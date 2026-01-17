import type { Context } from "hono";
import type { ConvexHttpClient } from "convex/browser";

// User information from JWT
export interface UserInfo {
  userId: string;
  universityId: string;
  email: string;
  role: "admin" | "procurement_manager" | "approver" | "requester" | "viewer";
  permissions: string[];
}

// Variables available in context
export interface AppVariables {
  user?: UserInfo;
  convex: ConvexHttpClient;
  requestId: string;
  startTime: number;
}

// Bindings (environment variables)
export interface AppBindings {
  CONVEX_URL: string;
  ANTHROPIC_API_KEY: string;
  JWT_SECRET: string;
  TEMPORAL_ADDRESS: string;
}

// Full context type
export interface AppContext {
  Variables: AppVariables;
  Bindings: AppBindings;
}

// Request types
export interface PaginationParams {
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface SearchParams extends PaginationParams {
  query?: string;
  filters?: Record<string, string | number | boolean>;
  sort?: string;
  order?: "asc" | "desc";
}

// Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    requestId: string;
    timestamp: string;
    pagination?: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  };
}

export interface ListResponse<T> extends ApiResponse<T[]> {
  meta: {
    requestId: string;
    timestamp: string;
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  };
}

// Agent types
export interface AgentRequest {
  agentId: string;
  input: unknown;
  context?: {
    universityId: string;
    userId?: string;
    conversationId?: string;
  };
  options?: {
    stream?: boolean;
    timeout?: number;
    maxTokens?: number;
  };
}

export interface AgentResponse {
  executionId: string;
  agentId: string;
  status: "running" | "completed" | "failed";
  output?: unknown;
  messages?: AgentMessage[];
  metrics?: {
    durationMs: number;
    tokensUsed: number;
  };
}

export interface AgentMessage {
  role: "system" | "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  timestamp: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

// Intelligence types
export interface PriceStateResult {
  productId: string;
  currentState: "stable" | "rising" | "peak" | "declining" | "trough" | "volatile";
  stateProbability: number;
  predictions: {
    day7: { price: number; confidence: number };
    day30: { price: number; confidence: number };
    day90: { price: number; confidence: number };
  };
  recommendation: "buy_now" | "wait" | "urgent";
  waitUntil?: string;
  expectedSavings?: number;
}

export interface AnomalyDetectionResult {
  entityType: string;
  entityId: string;
  anomalyType: string;
  severity: "critical" | "high" | "medium" | "low";
  confidence: number;
  description: string;
  details: unknown;
  recommendedActions: string[];
}

export interface DemandForecastResult {
  productId: string;
  period: string;
  predictedQuantity: number;
  confidenceInterval: {
    lower: number;
    upper: number;
    confidence: number;
  };
  predictedSpend: number;
  factors: {
    seasonality: number;
    trend: number;
    grantCycle: number;
    academicCalendar: number;
  };
  anomalyFlag: boolean;
  anomalyReason?: string;
  recommendation?: string;
}

export interface NegotiationStrategyResult {
  vendorId: string;
  productCategory: string;
  currentTerms: Record<string, unknown>;
  recommendedStrategy: {
    steps: Array<{
      action: string;
      expectedOutcome: string;
      fallback?: string;
    }>;
    openingPosition: string;
    walkawayPoint: string;
    expectedSavings: number;
    confidence: number;
  };
  leverage: string[];
  risks: string[];
}

export interface ContractIntelligenceResult {
  contractId: string;
  extractedTerms: {
    pricingTerms: unknown[];
    paymentTerms: unknown[];
    renewalClauses: unknown[];
    terminationRights: unknown[];
    liabilityCaps: unknown[];
    serviceLevels: unknown[];
  };
  riskFlags: Array<{
    clause: string;
    riskLevel: "high" | "medium" | "low";
    description: string;
    recommendation: string;
  }>;
  comparisonWithBenchmark: {
    betterThanAverage: string[];
    worseThanAverage: string[];
    neutral: string[];
  };
}

export interface SupplierRiskResult {
  vendorId: string;
  overallRiskScore: number;
  riskFactors: Array<{
    factor: string;
    score: number;
    weight: number;
    details: string;
  }>;
  supplyChainRisks: Array<{
    description: string;
    probability: number;
    impact: number;
    mitigationStrategy: string;
  }>;
  recommendations: string[];
}
