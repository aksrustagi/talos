/**
 * Agent 3: Vendor Intelligence Agent
 *
 * Purpose: Evaluate, score, and monitor vendor performance and risk
 * Runtime: LangGraph + Inngest
 *
 * Capabilities:
 * - Vendor lookup from D&B, SAM.gov, state debarment lists
 * - Risk scoring and assessment
 * - Compliance verification (SAM, insurance, diversity certifications)
 * - News/media monitoring for vendor risk
 * - Performance analysis based on delivery and quality metrics
 */

import { ChatAnthropic } from "@langchain/anthropic";
import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { inngest } from "../../inngest/client";

// State definition
const VendorIntelligenceState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  vendorId: Annotation<string>({
    reducer: (_, b) => b,
    default: () => "",
  }),
  universityId: Annotation<string>({
    reducer: (_, b) => b,
    default: () => "",
  }),
  assessmentType: Annotation<string>({
    reducer: (_, b) => b,
    default: () => "standard",
  }),
  vendorBasicInfo: Annotation<VendorBasicInfo | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),
  financialHealth: Annotation<FinancialHealth | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),
  complianceStatus: Annotation<ComplianceStatus | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),
  performanceMetrics: Annotation<PerformanceMetrics | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),
  riskFactors: Annotation<RiskFactor[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  newsAlerts: Annotation<NewsAlert[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  diversityCertifications: Annotation<DiversityCertification[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  assessment: Annotation<VendorAssessment | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),
});

// Types
interface VendorBasicInfo {
  id: string;
  name: string;
  legalName: string;
  dbaName?: string;
  taxId: string;
  dunsNumber?: string;
  samUei?: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  contact: {
    name: string;
    email: string;
    phone: string;
  };
  type: "manufacturer" | "distributor" | "reseller" | "service_provider";
  categories: string[];
  yearsInBusiness: number;
}

interface FinancialHealth {
  dnbRating?: string;
  dnbScore?: number;
  creditScore?: number;
  paymentIndex?: number;
  annualRevenue?: number;
  employeeCount?: number;
  publicCompany: boolean;
  stockSymbol?: string;
  financialRiskLevel: "low" | "medium" | "high" | "critical";
  indicators: {
    name: string;
    value: string | number;
    status: "good" | "warning" | "concern";
  }[];
}

interface ComplianceStatus {
  samRegistered: boolean;
  samUei?: string;
  samStatus?: string;
  samExpirationDate?: number;
  samCageCode?: string;
  debarred: boolean;
  debarmentSource?: string;
  debarmentReason?: string;
  exclusionType?: string;
  insuranceVerified: boolean;
  insurancePolicies: {
    type: string;
    carrier: string;
    policyNumber: string;
    coverageAmount: number;
    expirationDate: number;
    verified: boolean;
  }[];
  w9OnFile: boolean;
  w9Date?: number;
  stateRegistrations: {
    state: string;
    status: string;
    expirationDate?: number;
  }[];
}

interface PerformanceMetrics {
  overallScore: number;
  onTimeDeliveryRate: number;
  qualityScore: number;
  defectRate: number;
  invoiceAccuracy: number;
  responseTime: number; // hours
  issueResolutionTime: number; // days
  orderAccuracy: number;
  returnRate: number;
  totalOrders: number;
  totalSpend: number;
  averageOrderValue: number;
}

interface RiskFactor {
  factor: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  source: string;
  mitigationActions: string[];
  detectedAt: number;
}

interface NewsAlert {
  headline: string;
  source: string;
  publishedAt: number;
  sentiment: "positive" | "neutral" | "negative";
  relevanceScore: number;
  summary: string;
  url?: string;
  riskImplications?: string;
}

interface DiversityCertification {
  type: string; // MBE, WBE, SDVOB, HUBZone, etc.
  certifyingBody: string;
  certificationNumber: string;
  issuedDate: number;
  expirationDate: number;
  verified: boolean;
  documentUrl?: string;
}

interface VendorAssessment {
  vendorId: string;
  assessmentType: string;
  overallScore: number;
  scores: {
    financial: number;
    compliance: number;
    performance: number;
    risk: number;
  };
  recommendation: "approved" | "conditional" | "requires_review" | "rejected";
  riskLevel: "low" | "medium" | "high" | "critical";
  findings: string[];
  recommendations: string[];
  nextReviewDate: number;
  assessedAt: number;
}

// Tool definitions
const vendorLookupTool = tool(
  async (input: { vendorId?: string; vendorName?: string; taxId?: string }) => {
    // This would look up vendor in internal database and D&B
    const vendor: VendorBasicInfo = {
      id: input.vendorId || "vendor_001",
      name: "Fisher Scientific",
      legalName: "Fisher Scientific Company LLC",
      taxId: "XX-XXXXXXX",
      dunsNumber: "123456789",
      samUei: "ABC123DEF456",
      address: {
        street: "300 Industry Drive",
        city: "Pittsburgh",
        state: "PA",
        zip: "15275",
        country: "USA",
      },
      contact: {
        name: "John Smith",
        email: "jsmith@fisher.com",
        phone: "1-800-766-7000",
      },
      type: "distributor",
      categories: ["Lab Supplies", "Chemicals", "Equipment"],
      yearsInBusiness: 120,
    };

    return JSON.stringify({
      success: true,
      vendor,
    });
  },
  {
    name: "vendor_lookup",
    description: "Look up vendor information from internal database and D&B",
    schema: z.object({
      vendorId: z.string().optional().describe("Internal vendor ID"),
      vendorName: z.string().optional().describe("Vendor name to search"),
      taxId: z.string().optional().describe("Tax ID to search"),
    }),
  }
);

const checkSamGovTool = tool(
  async (input: { samUei?: string; vendorName?: string; taxId?: string }) => {
    // This would check SAM.gov for registration and exclusions
    return JSON.stringify({
      success: true,
      registered: true,
      samUei: input.samUei || "ABC123DEF456",
      status: "Active",
      expirationDate: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year from now
      cageCode: "1ABC2",
      entityType: "Business or Organization",
      debarred: false,
      exclusions: [],
    });
  },
  {
    name: "check_sam_gov",
    description: "Check vendor registration and exclusion status on SAM.gov",
    schema: z.object({
      samUei: z.string().optional().describe("SAM Unique Entity Identifier"),
      vendorName: z.string().optional().describe("Vendor name"),
      taxId: z.string().optional().describe("Tax ID"),
    }),
  }
);

const checkDebarmentListsTool = tool(
  async (input: { vendorName: string; taxId?: string }) => {
    // This would check federal and state debarment lists
    return JSON.stringify({
      success: true,
      federalDebarred: false,
      stateDebarments: [],
      epaSuspensions: false,
      warnings: [],
    });
  },
  {
    name: "check_debarment_lists",
    description: "Check federal and state debarment/exclusion lists",
    schema: z.object({
      vendorName: z.string().describe("Vendor name"),
      taxId: z.string().optional().describe("Tax ID"),
    }),
  }
);

const getFinancialHealthTool = tool(
  async (input: { dunsNumber?: string; vendorName?: string }) => {
    // This would get D&B financial data
    const health: FinancialHealth = {
      dnbRating: "4A2",
      dnbScore: 85,
      creditScore: 780,
      paymentIndex: 85,
      annualRevenue: 40000000000, // $40B for Thermo Fisher
      employeeCount: 80000,
      publicCompany: true,
      stockSymbol: "TMO",
      financialRiskLevel: "low",
      indicators: [
        { name: "Paydex Score", value: 85, status: "good" },
        { name: "D&B Rating", value: "4A2", status: "good" },
        { name: "Years in Business", value: 120, status: "good" },
        { name: "Revenue Growth", value: "5.2%", status: "good" },
      ],
    };

    return JSON.stringify({
      success: true,
      health,
    });
  },
  {
    name: "get_financial_health",
    description: "Get financial health and credit information from D&B",
    schema: z.object({
      dunsNumber: z.string().optional().describe("D&B DUNS number"),
      vendorName: z.string().optional().describe("Vendor name"),
    }),
  }
);

const verifyInsuranceTool = tool(
  async (input: { vendorId: string }) => {
    // This would verify insurance certificates
    return JSON.stringify({
      success: true,
      verified: true,
      policies: [
        {
          type: "General Liability",
          carrier: "Liberty Mutual",
          policyNumber: "GL-123456",
          coverageAmount: 2000000,
          expirationDate: Date.now() + 180 * 24 * 60 * 60 * 1000,
          verified: true,
        },
        {
          type: "Workers Compensation",
          carrier: "Hartford",
          policyNumber: "WC-789012",
          coverageAmount: 1000000,
          expirationDate: Date.now() + 200 * 24 * 60 * 60 * 1000,
          verified: true,
        },
      ],
    });
  },
  {
    name: "verify_insurance",
    description: "Verify vendor insurance certificates and coverage",
    schema: z.object({
      vendorId: z.string().describe("Vendor ID"),
    }),
  }
);

const checkDiversityCertsTool = tool(
  async (input: { vendorId: string; vendorName: string }) => {
    // This would check diversity certification databases
    return JSON.stringify({
      success: true,
      certifications: [] as DiversityCertification[], // No diversity certs for major distributor
    });
  },
  {
    name: "check_diversity_certs",
    description: "Check vendor diversity certifications (MBE, WBE, SDVOB, etc.)",
    schema: z.object({
      vendorId: z.string().describe("Vendor ID"),
      vendorName: z.string().describe("Vendor name"),
    }),
  }
);

const getPerformanceMetricsTool = tool(
  async (input: { vendorId: string; universityId: string }) => {
    // This would get performance data from Convex
    const metrics: PerformanceMetrics = {
      overallScore: 92,
      onTimeDeliveryRate: 0.96,
      qualityScore: 95,
      defectRate: 0.02,
      invoiceAccuracy: 0.98,
      responseTime: 4,
      issueResolutionTime: 2,
      orderAccuracy: 0.99,
      returnRate: 0.01,
      totalOrders: 1250,
      totalSpend: 2500000,
      averageOrderValue: 2000,
    };

    return JSON.stringify({
      success: true,
      metrics,
    });
  },
  {
    name: "get_performance_metrics",
    description: "Get vendor performance metrics for the university",
    schema: z.object({
      vendorId: z.string().describe("Vendor ID"),
      universityId: z.string().describe("University ID"),
    }),
  }
);

const monitorVendorNewsTool = tool(
  async (input: { vendorName: string; daysBack: number }) => {
    // This would use news API to monitor vendor news
    const alerts: NewsAlert[] = [
      {
        headline: "Thermo Fisher Reports Strong Q4 Earnings",
        source: "Reuters",
        publishedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
        sentiment: "positive",
        relevanceScore: 0.85,
        summary: "Company exceeds analyst expectations with 8% revenue growth.",
        riskImplications: "None - positive financial indicator",
      },
    ];

    return JSON.stringify({
      success: true,
      alerts,
      overallSentiment: "positive",
    });
  },
  {
    name: "monitor_vendor_news",
    description: "Monitor news and media for vendor-related alerts",
    schema: z.object({
      vendorName: z.string().describe("Vendor name to monitor"),
      daysBack: z.number().describe("Number of days to look back"),
    }),
  }
);

const calculateRiskScoreTool = tool(
  async (input: {
    financialHealth: FinancialHealth;
    complianceStatus: ComplianceStatus;
    performanceMetrics: PerformanceMetrics;
    newsAlerts: NewsAlert[];
  }) => {
    // Calculate risk score based on all factors
    let riskScore = 0;
    const riskFactors: RiskFactor[] = [];

    // Financial risk (0-30 points)
    if (input.financialHealth.financialRiskLevel === "high") {
      riskScore += 20;
      riskFactors.push({
        factor: "Financial Health",
        severity: "high",
        description: "Vendor shows concerning financial indicators",
        source: "D&B Report",
        mitigationActions: ["Request financial statements", "Consider payment terms"],
        detectedAt: Date.now(),
      });
    }

    // Compliance risk (0-30 points)
    if (!input.complianceStatus.samRegistered) {
      riskScore += 25;
      riskFactors.push({
        factor: "SAM Registration",
        severity: "critical",
        description: "Vendor not registered in SAM.gov - required for federal funds",
        source: "SAM.gov",
        mitigationActions: ["Require SAM registration before contracting"],
        detectedAt: Date.now(),
      });
    }

    if (input.complianceStatus.debarred) {
      riskScore += 30;
      riskFactors.push({
        factor: "Debarment",
        severity: "critical",
        description: "Vendor is debarred from federal contracting",
        source: "Federal Exclusion List",
        mitigationActions: ["Do not contract with this vendor"],
        detectedAt: Date.now(),
      });
    }

    // Performance risk (0-20 points)
    if (input.performanceMetrics.onTimeDeliveryRate < 0.90) {
      riskScore += 10;
      riskFactors.push({
        factor: "Delivery Performance",
        severity: "medium",
        description: "On-time delivery rate below 90%",
        source: "Internal Performance Data",
        mitigationActions: ["Discuss delivery issues with vendor", "Consider alternative vendors"],
        detectedAt: Date.now(),
      });
    }

    // News/reputation risk (0-20 points)
    const negativeNews = input.newsAlerts.filter(n => n.sentiment === "negative");
    if (negativeNews.length > 0) {
      riskScore += negativeNews.length * 5;
      riskFactors.push({
        factor: "Negative Press",
        severity: negativeNews.length > 2 ? "high" : "medium",
        description: `${negativeNews.length} negative news items detected`,
        source: "News Monitoring",
        mitigationActions: ["Review news items", "Assess impact on operations"],
        detectedAt: Date.now(),
      });
    }

    const riskLevel: "low" | "medium" | "high" | "critical" =
      riskScore >= 50 ? "critical" :
      riskScore >= 30 ? "high" :
      riskScore >= 15 ? "medium" : "low";

    return JSON.stringify({
      success: true,
      riskScore,
      riskLevel,
      riskFactors,
    });
  },
  {
    name: "calculate_risk_score",
    description: "Calculate overall vendor risk score",
    schema: z.object({
      financialHealth: z.any().describe("Financial health data"),
      complianceStatus: z.any().describe("Compliance status data"),
      performanceMetrics: z.any().describe("Performance metrics"),
      newsAlerts: z.array(z.any()).describe("News alerts"),
    }),
  }
);

// System prompt
const SYSTEM_PROMPT = `You are the Vendor Intelligence Agent, a specialized AI for evaluating and monitoring vendor risk in university procurement.

Your responsibilities:
1. Assess new vendors for onboarding eligibility
2. Monitor existing vendor risk continuously
3. Verify compliance with federal, state, and institutional requirements
4. Track vendor performance metrics
5. Alert on risk indicators

Risk Assessment Framework:
- Financial Health (25%): D&B rating, credit score, payment history
- Compliance (30%): SAM registration, debarment status, insurance, W-9
- Performance (25%): On-time delivery, quality, invoice accuracy
- Reputation (10%): News monitoring, customer reviews
- Strategic (10%): Diversity status, sustainability, local preference

Compliance Requirements:
- SAM.gov registration required for federal fund purchases
- Check exclusion lists (federal, state, EPA)
- Verify insurance coverage meets minimums
- Diversity certifications must be current

When assessing vendors:
- Always check SAM.gov first for federal eligibility
- Flag any debarment or exclusion immediately
- Consider financial stability for large contracts
- Note diversity status for reporting

Provide clear recommendations with specific action items.`;

// Create the LangGraph agent
export function createVendorIntelligenceAgent() {
  const model = new ChatAnthropic({
    modelName: "claude-sonnet-4-20250514",
    temperature: 0.2,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  });

  const tools = [
    vendorLookupTool,
    checkSamGovTool,
    checkDebarmentListsTool,
    getFinancialHealthTool,
    verifyInsuranceTool,
    checkDiversityCertsTool,
    getPerformanceMetricsTool,
    monitorVendorNewsTool,
    calculateRiskScoreTool,
  ];

  // Node: Get vendor basic info
  const getVendorInfo = async (state: typeof VendorIntelligenceState.State) => {
    const result = await vendorLookupTool.invoke({
      vendorId: state.vendorId,
    });
    const parsed = JSON.parse(result);

    return {
      vendorBasicInfo: parsed.vendor,
    };
  };

  // Node: Check compliance
  const checkCompliance = async (state: typeof VendorIntelligenceState.State) => {
    const vendor = state.vendorBasicInfo;
    if (!vendor) return {};

    // Check SAM.gov
    const samResult = await checkSamGovTool.invoke({
      samUei: vendor.samUei,
      vendorName: vendor.name,
    });
    const samData = JSON.parse(samResult);

    // Check debarment lists
    const debarmentResult = await checkDebarmentListsTool.invoke({
      vendorName: vendor.name,
      taxId: vendor.taxId,
    });
    const debarmentData = JSON.parse(debarmentResult);

    // Verify insurance
    const insuranceResult = await verifyInsuranceTool.invoke({
      vendorId: vendor.id,
    });
    const insuranceData = JSON.parse(insuranceResult);

    // Check diversity certs
    const diversityResult = await checkDiversityCertsTool.invoke({
      vendorId: vendor.id,
      vendorName: vendor.name,
    });
    const diversityData = JSON.parse(diversityResult);

    const complianceStatus: ComplianceStatus = {
      samRegistered: samData.registered,
      samUei: samData.samUei,
      samStatus: samData.status,
      samExpirationDate: samData.expirationDate,
      samCageCode: samData.cageCode,
      debarred: samData.debarred || debarmentData.federalDebarred,
      insuranceVerified: insuranceData.verified,
      insurancePolicies: insuranceData.policies || [],
      w9OnFile: true, // Would check actual status
      stateRegistrations: [],
    };

    return {
      complianceStatus,
      diversityCertifications: diversityData.certifications || [],
    };
  };

  // Node: Get financial health
  const getFinancialHealth = async (state: typeof VendorIntelligenceState.State) => {
    const vendor = state.vendorBasicInfo;
    if (!vendor) return {};

    const result = await getFinancialHealthTool.invoke({
      dunsNumber: vendor.dunsNumber,
      vendorName: vendor.name,
    });
    const parsed = JSON.parse(result);

    return {
      financialHealth: parsed.health,
    };
  };

  // Node: Get performance metrics
  const getPerformance = async (state: typeof VendorIntelligenceState.State) => {
    const result = await getPerformanceMetricsTool.invoke({
      vendorId: state.vendorId,
      universityId: state.universityId,
    });
    const parsed = JSON.parse(result);

    return {
      performanceMetrics: parsed.metrics,
    };
  };

  // Node: Monitor news
  const monitorNews = async (state: typeof VendorIntelligenceState.State) => {
    const vendor = state.vendorBasicInfo;
    if (!vendor) return {};

    const result = await monitorVendorNewsTool.invoke({
      vendorName: vendor.name,
      daysBack: 30,
    });
    const parsed = JSON.parse(result);

    return {
      newsAlerts: parsed.alerts || [],
    };
  };

  // Node: Calculate risk and generate assessment
  const generateAssessment = async (state: typeof VendorIntelligenceState.State) => {
    if (!state.financialHealth || !state.complianceStatus || !state.performanceMetrics) {
      return {
        messages: [new AIMessage("Insufficient data for assessment")],
      };
    }

    // Calculate risk score
    const riskResult = await calculateRiskScoreTool.invoke({
      financialHealth: state.financialHealth,
      complianceStatus: state.complianceStatus,
      performanceMetrics: state.performanceMetrics,
      newsAlerts: state.newsAlerts,
    });
    const riskData = JSON.parse(riskResult);

    // Calculate component scores
    const financialScore = state.financialHealth.dnbScore || 70;
    const complianceScore = state.complianceStatus.samRegistered && !state.complianceStatus.debarred ? 95 : 30;
    const performanceScore = state.performanceMetrics.overallScore;
    const riskScore = 100 - riskData.riskScore;

    const overallScore = Math.round(
      financialScore * 0.25 +
      complianceScore * 0.30 +
      performanceScore * 0.25 +
      riskScore * 0.20
    );

    // Determine recommendation
    let recommendation: "approved" | "conditional" | "requires_review" | "rejected" = "approved";
    const findings: string[] = [];
    const recommendations: string[] = [];

    if (state.complianceStatus.debarred) {
      recommendation = "rejected";
      findings.push("CRITICAL: Vendor is debarred from federal contracting");
      recommendations.push("Do not proceed with this vendor");
    } else if (!state.complianceStatus.samRegistered) {
      recommendation = "conditional";
      findings.push("Vendor not registered in SAM.gov");
      recommendations.push("Require SAM registration for federal fund purchases");
    } else if (riskData.riskLevel === "high") {
      recommendation = "requires_review";
      findings.push("Elevated risk factors detected");
      recommendations.push("Review risk factors before proceeding");
    }

    if (state.performanceMetrics.onTimeDeliveryRate < 0.90) {
      findings.push("On-time delivery rate below target (90%)");
      recommendations.push("Discuss delivery performance improvement plan");
    }

    if (state.diversityCertifications.length > 0) {
      findings.push(`Diversity certified: ${state.diversityCertifications.map(c => c.type).join(", ")}`);
    }

    const assessment: VendorAssessment = {
      vendorId: state.vendorId,
      assessmentType: state.assessmentType,
      overallScore,
      scores: {
        financial: financialScore,
        compliance: complianceScore,
        performance: performanceScore,
        risk: riskScore,
      },
      recommendation,
      riskLevel: riskData.riskLevel,
      findings,
      recommendations,
      nextReviewDate: Date.now() + 90 * 24 * 60 * 60 * 1000, // 90 days
      assessedAt: Date.now(),
    };

    return {
      riskFactors: riskData.riskFactors,
      assessment,
      messages: [new AIMessage(`Assessment complete: ${recommendation} with score ${overallScore}/100`)],
    };
  };

  // Build the graph
  const graph = new StateGraph(VendorIntelligenceState)
    .addNode("get_vendor_info", getVendorInfo)
    .addNode("check_compliance", checkCompliance)
    .addNode("get_financial_health", getFinancialHealth)
    .addNode("get_performance", getPerformance)
    .addNode("monitor_news", monitorNews)
    .addNode("generate_assessment", generateAssessment)
    .addEdge(START, "get_vendor_info")
    .addEdge("get_vendor_info", "check_compliance")
    .addEdge("check_compliance", "get_financial_health")
    .addEdge("get_financial_health", "get_performance")
    .addEdge("get_performance", "monitor_news")
    .addEdge("monitor_news", "generate_assessment")
    .addEdge("generate_assessment", END);

  return graph.compile();
}

// Export function to run the agent
export async function runVendorIntelligenceAgent(input: {
  vendorId: string;
  universityId: string;
  assessmentType?: "new_vendor" | "quarterly_review" | "risk_assessment" | "contract_renewal";
}): Promise<{
  success: boolean;
  assessment: VendorAssessment | undefined;
  riskFactors: RiskFactor[];
  error?: string;
}> {
  try {
    const agent = createVendorIntelligenceAgent();

    const result = await agent.invoke({
      vendorId: input.vendorId,
      universityId: input.universityId,
      assessmentType: input.assessmentType || "standard",
    });

    return {
      success: true,
      assessment: result.assessment,
      riskFactors: result.riskFactors,
    };
  } catch (error) {
    return {
      success: false,
      assessment: undefined,
      riskFactors: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================
// INNGEST FUNCTIONS
// ============================================

/**
 * Quarterly Vendor Review - Scheduled job
 */
export const quarterlyVendorReview = inngest.createFunction(
  { id: "vendor-quarterly-review", name: "Quarterly Vendor Review" },
  { cron: "0 0 1 */3 *" }, // First day of every quarter
  async ({ step }) => {
    // Get active vendors needing review
    const vendors = await step.run("get-vendors-for-review", async () => {
      // Would query Convex for vendors due for quarterly review
      return [
        { vendorId: "vendor_fisher", universityId: "univ_columbia" },
        { vendorId: "vendor_vwr", universityId: "univ_columbia" },
      ];
    });

    const results = [];

    for (const vendor of vendors) {
      const assessment = await step.run(`assess-${vendor.vendorId}`, async () => {
        return await runVendorIntelligenceAgent({
          vendorId: vendor.vendorId,
          universityId: vendor.universityId,
          assessmentType: "quarterly_review",
        });
      });

      results.push({
        vendorId: vendor.vendorId,
        ...assessment,
      });

      // Send alerts for high-risk vendors
      if (assessment.assessment?.riskLevel === "high" || assessment.assessment?.riskLevel === "critical") {
        await step.sendEvent("vendor-risk-alert", {
          name: "vendor/risk-alert",
          data: {
            universityId: vendor.universityId,
            vendorId: vendor.vendorId,
            riskType: assessment.assessment?.riskLevel,
            severity: assessment.assessment?.riskLevel,
          },
        });
      }
    }

    return {
      vendorsReviewed: vendors.length,
      results,
    };
  }
);

/**
 * New Vendor Assessment - Triggered by vendor request
 */
export const newVendorAssessment = inngest.createFunction(
  { id: "vendor-new-assessment", name: "New Vendor Assessment" },
  { event: "vendor/assessment-request" },
  async ({ event, step }) => {
    const { universityId, vendorId, assessmentType } = event.data;

    const result = await step.run("run-assessment", async () => {
      return await runVendorIntelligenceAgent({
        vendorId,
        universityId,
        assessmentType: assessmentType as any,
      });
    });

    // Store assessment in Convex
    await step.run("store-assessment", async () => {
      // Would store in Convex
      return { stored: true };
    });

    // Notify if approval needed
    if (result.assessment?.recommendation === "requires_review") {
      await step.run("notify-reviewer", async () => {
        // Would send notification
        return { notified: true };
      });
    }

    return result;
  }
);

// Export types
export type {
  VendorBasicInfo,
  FinancialHealth,
  ComplianceStatus,
  PerformanceMetrics,
  RiskFactor,
  NewsAlert,
  DiversityCertification,
  VendorAssessment,
};
