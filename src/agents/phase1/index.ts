/**
 * Phase 1 Core Agents Index
 *
 * Export all 8 Phase 1 agents for the procurement AI system.
 *
 * Agent Runtime Distribution:
 * - Temporal (Compliance-Critical): #4, #5, #7
 * - LangGraph + Inngest (Complex AI): #1, #2, #3, #6, #8
 */

// Agent 1: Catalog Intelligence Agent
export {
  createCatalogIntelligenceAgent,
  runCatalogIntelligenceAgent,
  type Product,
  type MatchedProduct,
  type Recommendation,
  type SearchStep,
} from "./catalog-intelligence";

// Agent 2: Price Discovery Agent
export {
  createPriceDiscoveryAgent,
  runPriceDiscoveryAgent,
  dailyPriceDiscovery,
  vendorCallForQuote,
  type MonitoredItem,
  type PriceSnapshot,
  type SavingsOpportunity,
  type QueuedCall,
  type AnalysisResult,
} from "./price-discovery";

// Agent 3: Vendor Intelligence Agent
export {
  createVendorIntelligenceAgent,
  runVendorIntelligenceAgent,
  quarterlyVendorReview,
  newVendorAssessment,
  type VendorBasicInfo,
  type FinancialHealth,
  type ComplianceStatus,
  type PerformanceMetrics,
  type RiskFactor,
  type NewsAlert,
  type DiversityCertification,
  type VendorAssessment,
} from "./vendor-intelligence";

// Agent 6: Email Communication Agent
export {
  createEmailCommunicationAgent,
  runEmailCommunicationAgent,
  processInboundEmail,
  sendQuoteRequestEmails,
  type InboundEmail,
  type EmailClassification,
  type GeneratedResponse,
} from "./email-communication";

// Agent 8: Software License Agent
export {
  createSoftwareLicenseAgent,
  runSoftwareLicenseAgent,
  dailyLicenseUsageCheck,
  licenseRenewalApproaching,
  weeklyLicenseOptimization,
  type SoftwareLicense,
  type UsageRecord,
  type RenewalItem,
  type OptimizationRecommendation,
  type LicenseAnalysis,
} from "./software-license";

// Re-export Temporal workflow types (actual workflows in /temporal/workflows/)
export type {
  Requisition as ComplianceRequisition,
  ComplianceCheck,
  ComplianceResult,
  ComplianceState,
} from "../../temporal/workflows/policy-compliance";

export type {
  ApprovalStage,
  ApprovalDecision,
  CompletedApproval,
  ApprovalResult,
  ApprovalState,
} from "../../temporal/workflows/approval-routing";

export type {
  Invoice,
  ParsedInvoice,
  Discrepancy,
  ReconciliationResult,
  ReconciliationState,
} from "../../temporal/workflows/payment-reconciliation";

/**
 * Phase 1 Agent Registry
 *
 * Provides a unified interface for invoking any Phase 1 agent.
 */
export const Phase1Agents = {
  // LangGraph + Inngest Agents
  "catalog-intelligence": {
    id: "catalog-intelligence",
    name: "Catalog Intelligence Agent",
    runtime: "langgraph-inngest",
    description: "Index, search, and match products across catalogs",
    run: runCatalogIntelligenceAgent,
  },
  "price-discovery": {
    id: "price-discovery",
    name: "Price Discovery Agent",
    runtime: "langgraph-inngest",
    description: "Continuous price monitoring and opportunity identification",
    run: runPriceDiscoveryAgent,
  },
  "vendor-intelligence": {
    id: "vendor-intelligence",
    name: "Vendor Intelligence Agent",
    runtime: "langgraph-inngest",
    description: "Evaluate, score, and monitor vendor performance and risk",
    run: runVendorIntelligenceAgent,
  },
  "email-communication": {
    id: "email-communication",
    name: "Email Communication Agent",
    runtime: "langgraph-inngest",
    description: "Handle all procurement-related email communications",
    run: runEmailCommunicationAgent,
  },
  "software-license": {
    id: "software-license",
    name: "Software License Agent",
    runtime: "langgraph-inngest",
    description: "Track, optimize, and renew software licenses",
    run: runSoftwareLicenseAgent,
  },

  // Temporal Agents (workflows)
  "policy-compliance": {
    id: "policy-compliance",
    name: "Policy Compliance Agent",
    runtime: "temporal",
    description: "Ensure purchases comply with federal, state, and institutional policies",
    workflow: "policyComplianceWorkflow",
  },
  "approval-routing": {
    id: "approval-routing",
    name: "Approval Routing Agent",
    runtime: "temporal",
    description: "Intelligently route requisitions through approval chains",
    workflow: "approvalRoutingWorkflow",
  },
  "payment-reconciliation": {
    id: "payment-reconciliation",
    name: "Payment Reconciliation Agent",
    runtime: "temporal",
    description: "Match invoices, verify deliveries, and reconcile payments",
    workflow: "paymentReconciliationWorkflow",
  },
} as const;

export type Phase1AgentId = keyof typeof Phase1Agents;

/**
 * Get agent configuration by ID
 */
export function getPhase1Agent(agentId: Phase1AgentId) {
  return Phase1Agents[agentId];
}

/**
 * List all Phase 1 agents
 */
export function listPhase1Agents() {
  return Object.values(Phase1Agents);
}

/**
 * Get agents by runtime type
 */
export function getAgentsByRuntime(runtime: "langgraph-inngest" | "temporal") {
  return Object.values(Phase1Agents).filter(a => a.runtime === runtime);
}
