/**
 * Temporal Workflows for AI Agent Orchestration
 *
 * These workflows coordinate complex multi-step AI agent operations
 * with retry logic, timeouts, and state management.
 */

import {
  proxyActivities,
  sleep,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Proxy activities with retry configuration
const {
  invokeAgent,
  saveAgentResult,
  sendNotification,
  updateDatabase,
  fetchPriceData,
  runAnomalyScan,
  generateReport,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
    nonRetryableErrorTypes: ["ValidationError", "AuthenticationError"],
  },
});

// Signals and Queries
export const cancelWorkflowSignal = defineSignal("cancelWorkflow");
export const getProgressQuery = defineQuery<WorkflowProgress>("getProgress");

interface WorkflowProgress {
  currentStep: string;
  totalSteps: number;
  completedSteps: number;
  status: "running" | "completed" | "failed" | "cancelled";
  results: Record<string, any>;
}

/**
 * Workflow: Price Watch Daily Scan
 * Runs daily to check for price changes across all vendor catalogs
 */
export async function priceWatchDailyScanWorkflow(input: {
  universityId: string;
  vendorIds: string[];
  alertThreshold: number;
}): Promise<{
  scannedProducts: number;
  alertsGenerated: number;
  savingsIdentified: number;
}> {
  let cancelled = false;
  let progress: WorkflowProgress = {
    currentStep: "initializing",
    totalSteps: input.vendorIds.length + 2,
    completedSteps: 0,
    status: "running",
    results: {},
  };

  // Set up signal and query handlers
  setHandler(cancelWorkflowSignal, () => {
    cancelled = true;
  });
  setHandler(getProgressQuery, () => progress);

  const results = {
    scannedProducts: 0,
    alertsGenerated: 0,
    savingsIdentified: 0,
  };

  try {
    // Step 1: Fetch current price data
    progress.currentStep = "fetching_price_data";
    for (const vendorId of input.vendorIds) {
      if (cancelled) {
        progress.status = "cancelled";
        return results;
      }

      const priceData = await fetchPriceData({
        universityId: input.universityId,
        vendorId,
      });

      results.scannedProducts += priceData.productCount;
      progress.completedSteps++;
    }

    // Step 2: Invoke PriceWatch Agent for analysis
    progress.currentStep = "analyzing_prices";
    const agentResult = await invokeAgent({
      agentId: "price-watch",
      input: {
        universityId: input.universityId,
        alertThreshold: input.alertThreshold,
        scannedProducts: results.scannedProducts,
      },
    });

    results.alertsGenerated = agentResult.alertsGenerated || 0;
    results.savingsIdentified = agentResult.savingsIdentified || 0;
    progress.completedSteps++;

    // Step 3: Save results and send notifications
    progress.currentStep = "saving_results";
    await saveAgentResult({
      workflowId: "price-watch-daily",
      agentId: "price-watch",
      result: results,
      universityId: input.universityId,
    });

    if (results.alertsGenerated > 0) {
      await sendNotification({
        type: "price_alerts",
        universityId: input.universityId,
        data: {
          alertCount: results.alertsGenerated,
          savingsOpportunity: results.savingsIdentified,
        },
      });
    }

    progress.completedSteps++;
    progress.status = "completed";
    progress.results = results;

    return results;
  } catch (error) {
    progress.status = "failed";
    throw error;
  }
}

/**
 * Workflow: Requisition Processing
 * Handles the full lifecycle of a purchase requisition
 */
export async function requisitionProcessingWorkflow(input: {
  universityId: string;
  requisitionId: string;
  requesterId: string;
  originalRequest?: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    estimatedPrice?: number;
  }>;
}): Promise<{
  requisitionNumber: string;
  status: string;
  processedItems: any[];
  recommendations: string[];
}> {
  let progress: WorkflowProgress = {
    currentStep: "parsing_request",
    totalSteps: 5,
    completedSteps: 0,
    status: "running",
    results: {},
  };

  setHandler(getProgressQuery, () => progress);

  // Step 1: Parse and enrich request with Requisition Agent
  progress.currentStep = "parsing_request";
  const parsedRequest = await invokeAgent({
    agentId: "requisition",
    input: {
      originalRequest: input.originalRequest,
      lineItems: input.lineItems,
      universityId: input.universityId,
    },
  });
  progress.completedSteps++;

  // Step 2: Find best vendors with Vendor Selection Agent
  progress.currentStep = "selecting_vendors";
  const vendorRecommendations = await invokeAgent({
    agentId: "vendor-selection",
    input: {
      items: parsedRequest.enrichedItems,
      universityId: input.universityId,
      preferences: {
        diversityTarget: 15,
        sustainabilityTarget: 10,
      },
    },
  });
  progress.completedSteps++;

  // Step 3: Compare prices with Price Compare Agent
  progress.currentStep = "comparing_prices";
  const priceComparison = await invokeAgent({
    agentId: "price-compare",
    input: {
      items: parsedRequest.enrichedItems,
      vendorOptions: vendorRecommendations.vendors,
    },
  });
  progress.completedSteps++;

  // Step 4: Check budget and generate requisition
  progress.currentStep = "generating_requisition";
  const requisitionResult = await updateDatabase({
    operation: "createRequisition",
    data: {
      universityId: input.universityId,
      requesterId: input.requesterId,
      items: priceComparison.optimizedItems,
      vendors: vendorRecommendations.selectedVendors,
    },
  });
  progress.completedSteps++;

  // Step 5: Route for approval
  progress.currentStep = "routing_approval";
  const approvalResult = await invokeAgent({
    agentId: "approval-workflow",
    input: {
      requisitionId: requisitionResult.requisitionId,
      totalAmount: requisitionResult.totalAmount,
      department: parsedRequest.department,
    },
  });
  progress.completedSteps++;

  progress.status = "completed";

  return {
    requisitionNumber: requisitionResult.requisitionNumber,
    status: approvalResult.status,
    processedItems: priceComparison.optimizedItems,
    recommendations: [
      ...vendorRecommendations.recommendations,
      ...priceComparison.recommendations,
    ],
  };
}

/**
 * Workflow: Invoice Validation
 * Three-way match and contract price validation
 */
export async function invoiceValidationWorkflow(input: {
  universityId: string;
  invoiceId: string;
  vendorId: string;
  invoiceData: {
    lineItems: Array<{
      sku: string;
      description: string;
      quantity: number;
      unitPrice: number;
    }>;
    totalAmount: number;
  };
}): Promise<{
  validationStatus: "matched" | "exception" | "disputed";
  discrepancies: any[];
  recoveryAmount: number;
  actions: string[];
}> {
  let progress: WorkflowProgress = {
    currentStep: "matching_invoice",
    totalSteps: 4,
    completedSteps: 0,
    status: "running",
    results: {},
  };

  setHandler(getProgressQuery, () => progress);

  // Step 1: Invoice Matching Agent - Three-way match
  progress.currentStep = "matching_invoice";
  const matchResult = await invokeAgent({
    agentId: "invoice-matching",
    input: {
      invoiceId: input.invoiceId,
      vendorId: input.vendorId,
      lineItems: input.invoiceData.lineItems,
    },
  });
  progress.completedSteps++;

  // Step 2: Contract Price Validator Agent
  progress.currentStep = "validating_contract_prices";
  const contractValidation = await invokeAgent({
    agentId: "contract-validator",
    input: {
      invoiceId: input.invoiceId,
      vendorId: input.vendorId,
      lineItems: input.invoiceData.lineItems,
      universityId: input.universityId,
    },
  });
  progress.completedSteps++;

  // Step 3: Anomaly detection
  progress.currentStep = "detecting_anomalies";
  const anomalyResult = await runAnomalyScan({
    entityType: "invoice",
    entityId: input.invoiceId,
    data: input.invoiceData,
  });
  progress.completedSteps++;

  // Step 4: Determine actions based on results
  progress.currentStep = "determining_actions";
  const allDiscrepancies = [
    ...matchResult.discrepancies,
    ...contractValidation.violations,
  ];

  const recoveryAmount = contractValidation.totalOvercharge || 0;
  let validationStatus: "matched" | "exception" | "disputed" = "matched";
  const actions: string[] = [];

  if (allDiscrepancies.length > 0) {
    validationStatus = "exception";
    actions.push("Review discrepancies");

    if (recoveryAmount > 100) {
      validationStatus = "disputed";
      actions.push("File dispute with vendor");
      actions.push("Generate dispute letter");
    }
  }

  if (anomalyResult.anomalies.length > 0) {
    validationStatus = "exception";
    actions.push("Investigate detected anomalies");
  }

  // Save results
  await saveAgentResult({
    workflowId: `invoice-validation-${input.invoiceId}`,
    agentId: "invoice-matching",
    result: {
      validationStatus,
      discrepancies: allDiscrepancies,
      recoveryAmount,
      anomalies: anomalyResult.anomalies,
    },
    universityId: input.universityId,
  });

  progress.completedSteps++;
  progress.status = "completed";

  return {
    validationStatus,
    discrepancies: allDiscrepancies,
    recoveryAmount,
    actions,
  };
}

/**
 * Workflow: Contract Renewal Analysis
 * Comprehensive analysis before contract renewal
 */
export async function contractRenewalWorkflow(input: {
  universityId: string;
  contractId: string;
  vendorId: string;
  expirationDate: string;
}): Promise<{
  recommendation: "renew" | "renegotiate" | "terminate" | "rebid";
  analysis: any;
  negotiationStrategy?: any;
  alternativeVendors?: any[];
}> {
  let progress: WorkflowProgress = {
    currentStep: "analyzing_contract",
    totalSteps: 5,
    completedSteps: 0,
    status: "running",
    results: {},
  };

  setHandler(getProgressQuery, () => progress);

  // Step 1: Analyze current contract performance
  progress.currentStep = "analyzing_contract";
  const contractAnalysis = await invokeAgent({
    agentId: "contract-validator",
    input: {
      mode: "performance_analysis",
      contractId: input.contractId,
      vendorId: input.vendorId,
    },
  });
  progress.completedSteps++;

  // Step 2: Benchmark against network pricing
  progress.currentStep = "benchmarking_prices";
  const benchmarkResult = await invokeAgent({
    agentId: "knowledge-graph",
    input: {
      mode: "price_benchmark",
      contractId: input.contractId,
      vendorId: input.vendorId,
    },
  });
  progress.completedSteps++;

  // Step 3: Assess vendor risk
  progress.currentStep = "assessing_risk";
  const riskAssessment = await invokeAgent({
    agentId: "vendor-selection",
    input: {
      mode: "risk_assessment",
      vendorId: input.vendorId,
    },
  });
  progress.completedSteps++;

  // Determine recommendation
  let recommendation: "renew" | "renegotiate" | "terminate" | "rebid" = "renew";

  if (benchmarkResult.priceGap > 10) {
    recommendation = "renegotiate";
  }
  if (contractAnalysis.complianceScore < 80) {
    recommendation = "renegotiate";
  }
  if (riskAssessment.riskScore > 60) {
    recommendation = "rebid";
  }
  if (contractAnalysis.complianceScore < 60 || riskAssessment.riskScore > 80) {
    recommendation = "terminate";
  }

  // Step 4: Generate negotiation strategy if needed
  let negotiationStrategy;
  let alternativeVendors;

  if (recommendation === "renegotiate" || recommendation === "rebid") {
    progress.currentStep = "generating_strategy";

    // Get negotiation strategy from RL agent
    const strategyResult = await invokeAgent({
      agentId: "negotiation-optimizer",
      input: {
        vendorId: input.vendorId,
        contractId: input.contractId,
        currentTerms: contractAnalysis.terms,
        benchmarkData: benchmarkResult,
      },
    });
    negotiationStrategy = strategyResult.strategy;

    // Find alternatives
    const alternativesResult = await invokeAgent({
      agentId: "vendor-selection",
      input: {
        mode: "find_alternatives",
        category: contractAnalysis.category,
        currentVendorId: input.vendorId,
      },
    });
    alternativeVendors = alternativesResult.alternatives;
  }
  progress.completedSteps++;

  // Step 5: Generate report
  progress.currentStep = "generating_report";
  await generateReport({
    type: "contract_renewal",
    universityId: input.universityId,
    data: {
      contractId: input.contractId,
      recommendation,
      contractAnalysis,
      benchmarkResult,
      riskAssessment,
      negotiationStrategy,
      alternativeVendors,
    },
  });
  progress.completedSteps++;

  progress.status = "completed";

  return {
    recommendation,
    analysis: {
      performance: contractAnalysis,
      benchmark: benchmarkResult,
      risk: riskAssessment,
    },
    negotiationStrategy,
    alternativeVendors,
  };
}

/**
 * Workflow: Catalog Sync
 * Synchronize and normalize vendor catalog data
 */
export async function catalogSyncWorkflow(input: {
  universityId: string;
  vendorId: string;
  catalogSource: "api" | "file" | "scrape";
  catalogData?: any;
}): Promise<{
  productsProcessed: number;
  newProducts: number;
  updatedProducts: number;
  priceChanges: number;
}> {
  let progress: WorkflowProgress = {
    currentStep: "fetching_catalog",
    totalSteps: 4,
    completedSteps: 0,
    status: "running",
    results: {},
  };

  setHandler(getProgressQuery, () => progress);

  // Step 1: Fetch/receive catalog data
  progress.currentStep = "fetching_catalog";
  let catalogData = input.catalogData;
  if (!catalogData) {
    catalogData = await fetchPriceData({
      universityId: input.universityId,
      vendorId: input.vendorId,
      fullCatalog: true,
    });
  }
  progress.completedSteps++;

  // Step 2: Process with Catalog Sync Agent
  progress.currentStep = "processing_catalog";
  const syncResult = await invokeAgent({
    agentId: "catalog-sync",
    input: {
      vendorId: input.vendorId,
      catalogData,
      universityId: input.universityId,
    },
  });
  progress.completedSteps++;

  // Step 3: Update price history
  progress.currentStep = "updating_prices";
  await updateDatabase({
    operation: "bulkPriceUpdate",
    data: {
      vendorId: input.vendorId,
      priceUpdates: syncResult.priceUpdates,
    },
  });
  progress.completedSteps++;

  // Step 4: Notify about significant changes
  progress.currentStep = "sending_notifications";
  if (syncResult.significantPriceChanges > 0) {
    await sendNotification({
      type: "catalog_update",
      universityId: input.universityId,
      data: {
        vendorId: input.vendorId,
        priceChanges: syncResult.significantPriceChanges,
        newProducts: syncResult.newProducts,
      },
    });
  }
  progress.completedSteps++;

  progress.status = "completed";

  return {
    productsProcessed: syncResult.productsProcessed,
    newProducts: syncResult.newProducts,
    updatedProducts: syncResult.updatedProducts,
    priceChanges: syncResult.priceChanges,
  };
}

/**
 * Workflow: Anomaly Investigation
 * Deep investigation of detected anomalies
 */
export async function anomalyInvestigationWorkflow(input: {
  universityId: string;
  anomalyId: string;
  entityType: string;
  entityId: string;
  severity: string;
}): Promise<{
  investigationComplete: boolean;
  findings: any[];
  recommendation: string;
  actionsRequired: string[];
}> {
  let progress: WorkflowProgress = {
    currentStep: "gathering_data",
    totalSteps: 4,
    completedSteps: 0,
    status: "running",
    results: {},
  };

  setHandler(getProgressQuery, () => progress);

  // Step 1: Gather related data
  progress.currentStep = "gathering_data";
  const relatedData = await updateDatabase({
    operation: "getRelatedEntities",
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
    },
  });
  progress.completedSteps++;

  // Step 2: Deep anomaly analysis
  progress.currentStep = "analyzing_anomaly";
  const analysisResult = await runAnomalyScan({
    entityType: input.entityType,
    entityId: input.entityId,
    data: relatedData,
    deepScan: true,
  });
  progress.completedSteps++;

  // Step 3: Determine findings and recommendations
  progress.currentStep = "determining_findings";
  const findings = analysisResult.findings || [];
  let recommendation = "monitor";
  const actionsRequired: string[] = [];

  if (input.severity === "critical") {
    recommendation = "immediate_action";
    actionsRequired.push("Escalate to compliance team");
    actionsRequired.push("Freeze related transactions");
  } else if (findings.length > 0) {
    recommendation = "investigate_further";
    actionsRequired.push("Review transaction history");
    actionsRequired.push("Contact relevant parties");
  }
  progress.completedSteps++;

  // Step 4: Update anomaly status and notify
  progress.currentStep = "finalizing";
  await updateDatabase({
    operation: "updateAnomaly",
    data: {
      anomalyId: input.anomalyId,
      status: "investigated",
      findings,
      recommendation,
    },
  });

  if (input.severity === "critical" || input.severity === "high") {
    await sendNotification({
      type: "anomaly_investigation",
      universityId: input.universityId,
      data: {
        anomalyId: input.anomalyId,
        severity: input.severity,
        recommendation,
        actionsRequired,
      },
    });
  }
  progress.completedSteps++;

  progress.status = "completed";

  return {
    investigationComplete: true,
    findings,
    recommendation,
    actionsRequired,
  };
}
