/**
 * Temporal Activities
 *
 * Activities are the building blocks executed by workflows.
 * They handle external interactions, database operations, and agent invocations.
 */

import Anthropic from "@anthropic-ai/sdk";
import { hmmPredictor } from "../intelligence/hmm";
import { anomalyDetector } from "../intelligence/anomalyDetection";

// Types
interface AgentInvocationInput {
  agentId: string;
  input: Record<string, any>;
  options?: {
    timeout?: number;
    maxTokens?: number;
  };
}

interface AgentResult {
  success: boolean;
  output: Record<string, any>;
  tokensUsed?: number;
  [key: string]: any;
}

interface SaveResultInput {
  workflowId: string;
  agentId: string;
  result: Record<string, any>;
  universityId: string;
}

interface NotificationInput {
  type: string;
  universityId: string;
  data: Record<string, any>;
}

interface DatabaseOperation {
  operation: string;
  data: Record<string, any>;
}

interface PriceDataInput {
  universityId: string;
  vendorId: string;
  fullCatalog?: boolean;
}

interface AnomalyScanInput {
  entityType: string;
  entityId: string;
  data: Record<string, any>;
  deepScan?: boolean;
}

interface ReportInput {
  type: string;
  universityId: string;
  data: Record<string, any>;
}

// Agent system prompts (abbreviated versions - full prompts in agents folder)
const AGENT_PROMPTS: Record<string, string> = {
  "price-watch": `You are the PriceWatch Agent. Monitor prices, detect changes, identify arbitrage opportunities, and generate alerts. Always calculate annual impact based on historical volume.`,

  "catalog-sync": `You are the Catalog Sync Agent. Ingest vendor catalogs, normalize product data, match products across vendors, and maintain the unified product database.`,

  "price-compare": `You are the Price Compare Agent. Analyze and compare prices across vendors, calculate total costs including shipping, and recommend optimal purchasing decisions.`,

  "knowledge-graph": `You are the Knowledge Graph Builder. Construct and query the cross-university procurement network, enable price benchmarking, and identify network-wide patterns.`,

  "historical-price": `You are the Historical Price Agent. Analyze price trends, use HMM predictions to determine optimal purchase timing, and forecast future costs.`,

  "contract-validator": `You are the Contract Price Validator. Validate invoices against contracts, detect overcharges, calculate recovery amounts, and generate dispute documentation.`,

  requisition: `You are the Requisition Agent. Parse natural language purchase requests, match products to catalog, check budgets, and generate compliant requisitions.`,

  "approval-workflow": `You are the Approval Workflow Agent. Route requisitions to appropriate approvers, track status, send reminders, and handle escalations.`,

  "vendor-selection": `You are the Vendor Selection Agent. Score and recommend vendors based on price, quality, delivery, compliance, and strategic factors.`,

  "invoice-matching": `You are the Invoice Matching Agent. Perform three-way matching (PO, receipt, invoice), auto-approve clean matches, and route exceptions.`,

  "negotiation-optimizer": `You are the Negotiation Optimization Agent. Use reinforcement learning insights to recommend optimal negotiation strategies and tactics.`,

  "lab-supply": `You are the Lab Supply Agent. Handle scientific procurement with expertise in grant compliance, chemical safety, and research protocols.`,
};

/**
 * Invoke an AI agent with the given input
 */
export async function invokeAgent(input: AgentInvocationInput): Promise<AgentResult> {
  const { agentId, input: agentInput, options } = input;

  // Get agent prompt
  const systemPrompt = AGENT_PROMPTS[agentId];
  if (!systemPrompt) {
    throw new Error(`Unknown agent: ${agentId}`);
  }

  // Initialize Anthropic client
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  try {
    // Create message with Claude
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: options?.maxTokens || 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Process this request:\n${JSON.stringify(agentInput, null, 2)}`,
        },
      ],
    });

    // Parse response
    const textContent = response.content.find((c) => c.type === "text");
    const outputText = textContent?.type === "text" ? textContent.text : "";

    // Try to extract JSON from response
    let output: Record<string, any> = {};
    try {
      // Look for JSON in the response
      const jsonMatch = outputText.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        output = JSON.parse(jsonMatch[1]);
      } else {
        // Try parsing the whole response as JSON
        output = JSON.parse(outputText);
      }
    } catch {
      // If no JSON, return text as message
      output = {
        message: outputText,
        rawResponse: true,
      };
    }

    return {
      success: true,
      output,
      tokensUsed: response.usage?.input_tokens + response.usage?.output_tokens,
      ...output, // Spread output fields for convenience
    };
  } catch (error) {
    console.error(`Agent ${agentId} invocation failed:`, error);
    return {
      success: false,
      output: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

/**
 * Save agent execution results to database
 */
export async function saveAgentResult(input: SaveResultInput): Promise<{ saved: boolean }> {
  const { workflowId, agentId, result, universityId } = input;

  // TODO: Implement actual Convex mutation
  // const convex = new ConvexHttpClient(process.env.CONVEX_URL!);
  // await convex.mutation(api.agents.completeExecution, {
  //   executionId: workflowId,
  //   output: result,
  //   status: "completed",
  // });

  console.log(`Saved result for ${agentId} in workflow ${workflowId}`);

  return { saved: true };
}

/**
 * Send notification to users
 */
export async function sendNotification(input: NotificationInput): Promise<{ sent: boolean }> {
  const { type, universityId, data } = input;

  // TODO: Implement actual notification sending
  // - Email via SendGrid/SES
  // - Slack via Slack API
  // - In-app via Convex

  console.log(`Sending ${type} notification for university ${universityId}:`, data);

  // Example Slack notification
  if (process.env.SLACK_WEBHOOK_URL) {
    try {
      await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `[${type.toUpperCase()}] ${JSON.stringify(data)}`,
        }),
      });
    } catch (error) {
      console.error("Failed to send Slack notification:", error);
    }
  }

  return { sent: true };
}

/**
 * Database operations via Convex
 */
export async function updateDatabase(input: DatabaseOperation): Promise<Record<string, any>> {
  const { operation, data } = input;

  // TODO: Implement actual Convex operations
  // const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

  switch (operation) {
    case "createRequisition":
      // await convex.mutation(api.requisitions.create, data);
      return {
        requisitionId: `req_${Date.now()}`,
        requisitionNumber: `REQ-2025-${String(Math.floor(Math.random() * 99999)).padStart(5, "0")}`,
        totalAmount: data.items?.reduce(
          (sum: number, item: any) => sum + (item.quantity || 1) * (item.unitPrice || 0),
          0
        ),
      };

    case "bulkPriceUpdate":
      // await convex.mutation(api.priceIntelligence.bulkRecordPrices, data);
      console.log(`Updated ${data.priceUpdates?.length || 0} prices for vendor ${data.vendorId}`);
      return { updated: data.priceUpdates?.length || 0 };

    case "getRelatedEntities":
      // Return mock data - would query Convex
      return {
        entity: data,
        related: [],
      };

    case "updateAnomaly":
      // await convex.mutation(api.anomalyDetection.updateStatus, data);
      return { updated: true };

    default:
      console.log(`Unknown database operation: ${operation}`);
      return {};
  }
}

/**
 * Fetch price data from vendors or database
 */
export async function fetchPriceData(input: PriceDataInput): Promise<{
  productCount: number;
  prices: Array<{ productId: string; price: number }>;
}> {
  const { universityId, vendorId, fullCatalog } = input;

  // TODO: Implement actual price fetching
  // - Query Convex for cached prices
  // - Call vendor APIs for real-time data
  // - Scrape vendor websites if needed

  console.log(`Fetching ${fullCatalog ? "full catalog" : "prices"} for vendor ${vendorId}`);

  // Mock response
  return {
    productCount: fullCatalog ? 50000 : 1000,
    prices: [
      { productId: "prod_1", price: 10.99 },
      { productId: "prod_2", price: 25.5 },
    ],
  };
}

/**
 * Run anomaly detection scan
 */
export async function runAnomalyScan(input: AnomalyScanInput): Promise<{
  anomalies: any[];
  findings: any[];
}> {
  const { entityType, entityId, data, deepScan } = input;

  try {
    // Use our anomaly detection system
    const features = {
      priceDeviation: data.priceDeviation || 0,
      quantityDeviation: data.quantityDeviation || 0,
      approvalThresholdProximity: data.approvalProximity || 0,
      isBusinessHours: data.isBusinessHours ?? true,
      hourOfDay: data.hourOfDay,
    };

    const anomalies = anomalyDetector.detect(
      entityType as any,
      entityId,
      features
    );

    // If deep scan, also check graph anomalies
    let graphAnomalies: any[] = [];
    if (deepScan) {
      graphAnomalies = anomalyDetector.detectGraphAnomalies();
    }

    return {
      anomalies: [...anomalies, ...graphAnomalies],
      findings: anomalies.map((a) => ({
        type: a.anomalyType,
        severity: a.severity,
        description: a.description,
      })),
    };
  } catch (error) {
    console.error("Anomaly scan failed:", error);
    return { anomalies: [], findings: [] };
  }
}

/**
 * Generate a report document
 */
export async function generateReport(input: ReportInput): Promise<{ reportId: string; url: string }> {
  const { type, universityId, data } = input;

  // TODO: Implement actual report generation
  // - Generate PDF using puppeteer/playwright
  // - Store in Convex file storage or S3
  // - Return download URL

  console.log(`Generating ${type} report for university ${universityId}`);

  const reportId = `report_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    reportId,
    url: `/api/v1/reports/${reportId}`,
  };
}

/**
 * Run HMM price prediction
 */
export async function runPricePrediction(input: {
  productId: string;
  priceHistory: Array<{ price: number; date: string }>;
  currentPrice: number;
  annualVolume: number;
}): Promise<{
  currentState: string;
  recommendation: string;
  predictions: any;
  expectedSavings?: number;
}> {
  try {
    // Convert price history to observations
    const observations = input.priceHistory.map((h, i, arr) => {
      const priceChange = i > 0 ? (h.price - arr[i - 1].price) / arr[i - 1].price : 0;
      const month = new Date(h.date).getMonth();
      return {
        priceChange,
        inventoryLevel: 0.5,
        orderVolume: 0.5,
        seasonalIndicator: month <= 2 ? 0.8 : month <= 5 ? 0.3 : 0.5,
        newsIndicator: 0.5,
      };
    });

    if (observations.length === 0) {
      return {
        currentState: "unknown",
        recommendation: "buy_now",
        predictions: {},
      };
    }

    // Run HMM prediction
    const prediction = hmmPredictor.predict(
      observations,
      input.currentPrice,
      input.annualVolume
    );

    return {
      currentState: prediction.currentState,
      recommendation: prediction.recommendation,
      predictions: prediction.predictions,
      expectedSavings: prediction.expectedSavings,
    };
  } catch (error) {
    console.error("HMM prediction failed:", error);
    return {
      currentState: "unknown",
      recommendation: "buy_now",
      predictions: {},
    };
  }
}
