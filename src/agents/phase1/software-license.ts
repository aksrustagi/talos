/**
 * Agent 8: Software License Agent
 *
 * Purpose: Track, optimize, and renew software licenses
 * Runtime: LangGraph + Inngest
 *
 * Capabilities:
 * - Track license usage and utilization
 * - Identify optimization opportunities
 * - Manage renewal calendar
 * - Recommend tier changes and consolidation
 * - Support renewal negotiations
 */

import { ChatAnthropic } from "@langchain/anthropic";
import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { inngest } from "../../inngest/client";

// State definition
const LicenseState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  universityId: Annotation<string>({
    reducer: (_, b) => b,
    default: () => "",
  }),
  licenses: Annotation<SoftwareLicense[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  usageData: Annotation<UsageRecord[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  renewalCalendar: Annotation<RenewalItem[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  optimizationRecommendations: Annotation<OptimizationRecommendation[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  analysisResults: Annotation<LicenseAnalysis | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),
});

// Types
interface SoftwareLicense {
  id: string;
  name: string;
  publisher: string;
  productFamily?: string;
  licenseType: "subscription" | "perpetual" | "consumption" | "site_license" | "named_user" | "concurrent";
  licensingModel: "per_user" | "per_device" | "per_core" | "per_instance" | "enterprise" | "metered";
  totalLicenses: number;
  assignedLicenses: number;
  activeUsers: number;
  utilizationPercent: number;
  costPerLicense: number;
  totalAnnualCost: number;
  costPerActiveUser: number;
  renewalDate: number;
  autoRenewal: boolean;
  renewalNoticeDays: number;
  tier?: string;
  vendorId: string;
  vendorName: string;
  contractId?: string;
  departments: string[];
  features: string[];
  complianceStatus: "compliant" | "over_deployed" | "under_utilized" | "audit_required";
}

interface UsageRecord {
  licenseId: string;
  date: number;
  totalLicenses: number;
  assignedLicenses: number;
  activeUsers: number;
  peakConcurrentUsers?: number;
  loginCount?: number;
  featureUsage?: Array<{
    feature: string;
    usageCount: number;
    uniqueUsers: number;
  }>;
}

interface RenewalItem {
  licenseId: string;
  licenseName: string;
  vendorName: string;
  renewalDate: number;
  daysUntilRenewal: number;
  renewalValue: number;
  previousValue?: number;
  priceChangePercent?: number;
  utilizationPercent: number;
  recommendation?: "renew" | "renegotiate" | "downgrade" | "cancel" | "switch";
  notificationsSent: number[];
}

interface OptimizationRecommendation {
  licenseId: string;
  licenseName: string;
  type: "reduce_licenses" | "downgrade_tier" | "consolidate" | "switch_vendor" | "renegotiate" | "upgrade" | "eliminate_shelfware";
  description: string;
  currentCost: number;
  projectedCost: number;
  potentialSavings: number;
  savingsPercent: number;
  effort: "low" | "medium" | "high";
  priority: "low" | "medium" | "high";
  implementation: string[];
  risks: string[];
  timelineWeeks: number;
}

interface LicenseAnalysis {
  totalLicenses: number;
  totalAnnualSpend: number;
  averageUtilization: number;
  shelfwareAmount: number;
  upcomingRenewals30Days: number;
  upcomingRenewals90Days: number;
  totalOptimizationOpportunity: number;
  complianceIssues: number;
  recommendations: string[];
}

// Tool definitions
const getLicensesTool = tool(
  async (input: { universityId: string; filter?: string }) => {
    // This would query Convex for licenses
    const licenses: SoftwareLicense[] = [
      {
        id: "lic_001",
        name: "Microsoft 365 E3",
        publisher: "Microsoft",
        productFamily: "Microsoft 365",
        licenseType: "subscription",
        licensingModel: "per_user",
        totalLicenses: 5000,
        assignedLicenses: 4200,
        activeUsers: 3800,
        utilizationPercent: 76,
        costPerLicense: 32.00,
        totalAnnualCost: 1920000,
        costPerActiveUser: 505.26,
        renewalDate: Date.now() + 60 * 24 * 60 * 60 * 1000, // 60 days
        autoRenewal: true,
        renewalNoticeDays: 90,
        tier: "E3",
        vendorId: "vendor_microsoft",
        vendorName: "Microsoft",
        departments: ["All"],
        features: ["Office Apps", "Exchange", "Teams", "SharePoint"],
        complianceStatus: "compliant",
      },
      {
        id: "lic_002",
        name: "Adobe Creative Cloud",
        publisher: "Adobe",
        productFamily: "Creative Cloud",
        licenseType: "subscription",
        licensingModel: "per_user",
        totalLicenses: 500,
        assignedLicenses: 450,
        activeUsers: 280,
        utilizationPercent: 56,
        costPerLicense: 54.99,
        totalAnnualCost: 329940,
        costPerActiveUser: 1178.36,
        renewalDate: Date.now() + 120 * 24 * 60 * 60 * 1000, // 120 days
        autoRenewal: true,
        renewalNoticeDays: 60,
        tier: "Complete",
        vendorId: "vendor_adobe",
        vendorName: "Adobe",
        departments: ["Marketing", "Design", "Communications"],
        features: ["Photoshop", "Illustrator", "InDesign", "Premiere Pro"],
        complianceStatus: "under_utilized",
      },
      {
        id: "lic_003",
        name: "Slack Enterprise Grid",
        publisher: "Salesforce",
        productFamily: "Slack",
        licenseType: "subscription",
        licensingModel: "per_user",
        totalLicenses: 3000,
        assignedLicenses: 2800,
        activeUsers: 2500,
        utilizationPercent: 83,
        costPerLicense: 15.00,
        totalAnnualCost: 540000,
        costPerActiveUser: 216.00,
        renewalDate: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
        autoRenewal: false,
        renewalNoticeDays: 30,
        tier: "Enterprise Grid",
        vendorId: "vendor_slack",
        vendorName: "Salesforce",
        departments: ["All"],
        features: ["Channels", "DMs", "Integrations", "Compliance"],
        complianceStatus: "compliant",
      },
      {
        id: "lic_004",
        name: "MATLAB Campus License",
        publisher: "MathWorks",
        productFamily: "MATLAB",
        licenseType: "site_license",
        licensingModel: "enterprise",
        totalLicenses: 1, // Site license
        assignedLicenses: 1,
        activeUsers: 850,
        utilizationPercent: 100,
        costPerLicense: 125000,
        totalAnnualCost: 125000,
        costPerActiveUser: 147.06,
        renewalDate: Date.now() + 180 * 24 * 60 * 60 * 1000, // 180 days
        autoRenewal: true,
        renewalNoticeDays: 90,
        tier: "Campus",
        vendorId: "vendor_mathworks",
        vendorName: "MathWorks",
        departments: ["Engineering", "Sciences", "Mathematics"],
        features: ["MATLAB", "Simulink", "Toolboxes"],
        complianceStatus: "compliant",
      },
    ];

    return JSON.stringify({
      success: true,
      licenses,
      totalCount: licenses.length,
    });
  },
  {
    name: "get_licenses",
    description: "Get all software licenses for a university",
    schema: z.object({
      universityId: z.string().describe("University ID"),
      filter: z.string().optional().describe("Optional filter"),
    }),
  }
);

const getUsageDataTool = tool(
  async (input: { licenseId: string; days: number }) => {
    // This would query usage analytics
    const records: UsageRecord[] = [];
    const baseDate = Date.now();

    for (let i = 0; i < input.days; i++) {
      records.push({
        licenseId: input.licenseId,
        date: baseDate - i * 24 * 60 * 60 * 1000,
        totalLicenses: 5000,
        assignedLicenses: 4200 + Math.floor(Math.random() * 50),
        activeUsers: 3700 + Math.floor(Math.random() * 200),
        loginCount: 8000 + Math.floor(Math.random() * 1000),
      });
    }

    return JSON.stringify({
      success: true,
      records,
      averageActiveUsers: 3800,
      peakActiveUsers: 4100,
      trend: "stable",
    });
  },
  {
    name: "get_usage_data",
    description: "Get usage data for a specific license",
    schema: z.object({
      licenseId: z.string().describe("License ID"),
      days: z.number().describe("Number of days of data"),
    }),
  }
);

const getRenewalCalendarTool = tool(
  async (input: { universityId: string; daysAhead: number }) => {
    // This would query renewal calendar
    const renewals: RenewalItem[] = [
      {
        licenseId: "lic_003",
        licenseName: "Slack Enterprise Grid",
        vendorName: "Salesforce",
        renewalDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
        daysUntilRenewal: 30,
        renewalValue: 540000,
        previousValue: 500000,
        priceChangePercent: 8,
        utilizationPercent: 83,
        recommendation: "renegotiate",
        notificationsSent: [90, 60],
      },
      {
        licenseId: "lic_001",
        licenseName: "Microsoft 365 E3",
        vendorName: "Microsoft",
        renewalDate: Date.now() + 60 * 24 * 60 * 60 * 1000,
        daysUntilRenewal: 60,
        renewalValue: 1920000,
        previousValue: 1850000,
        priceChangePercent: 3.8,
        utilizationPercent: 76,
        recommendation: "renegotiate",
        notificationsSent: [90],
      },
    ];

    return JSON.stringify({
      success: true,
      renewals: renewals.filter(r => r.daysUntilRenewal <= input.daysAhead),
      totalValue: renewals.reduce((sum, r) => sum + r.renewalValue, 0),
    });
  },
  {
    name: "get_renewal_calendar",
    description: "Get upcoming license renewals",
    schema: z.object({
      universityId: z.string().describe("University ID"),
      daysAhead: z.number().describe("Days to look ahead"),
    }),
  }
);

const analyzeUtilizationTool = tool(
  async (input: { licenses: SoftwareLicense[] }) => {
    const underUtilized = input.licenses.filter(l => l.utilizationPercent < 70);
    const shelfware = input.licenses.filter(l => l.utilizationPercent < 50);

    const shelfwareAmount = shelfware.reduce((sum, l) => {
      const unusedLicenses = l.totalLicenses - l.activeUsers;
      return sum + (unusedLicenses * l.costPerLicense * 12);
    }, 0);

    return JSON.stringify({
      success: true,
      totalLicenses: input.licenses.length,
      underUtilizedCount: underUtilized.length,
      shelfwareCount: shelfware.length,
      shelfwareAmount,
      underUtilizedLicenses: underUtilized.map(l => ({
        id: l.id,
        name: l.name,
        utilization: l.utilizationPercent,
        unusedCost: (l.totalLicenses - l.activeUsers) * l.costPerLicense * 12,
      })),
    });
  },
  {
    name: "analyze_utilization",
    description: "Analyze license utilization across all licenses",
    schema: z.object({
      licenses: z.array(z.any()).describe("Licenses to analyze"),
    }),
  }
);

const generateOptimizationsTool = tool(
  async (input: { licenses: SoftwareLicense[]; usageData: any }) => {
    const recommendations: OptimizationRecommendation[] = [];

    for (const license of input.licenses) {
      // Check for under-utilization
      if (license.utilizationPercent < 70) {
        const unusedLicenses = license.totalLicenses - license.activeUsers;
        const savings = unusedLicenses * license.costPerLicense * 12;

        recommendations.push({
          licenseId: license.id,
          licenseName: license.name,
          type: "reduce_licenses",
          description: `Reduce ${license.name} licenses from ${license.totalLicenses} to ${license.activeUsers + Math.ceil(license.activeUsers * 0.1)} (10% buffer)`,
          currentCost: license.totalAnnualCost,
          projectedCost: license.totalAnnualCost - savings,
          potentialSavings: savings,
          savingsPercent: (savings / license.totalAnnualCost) * 100,
          effort: "low",
          priority: savings > 50000 ? "high" : savings > 20000 ? "medium" : "low",
          implementation: [
            "Review inactive user list",
            "Send notification to inactive users",
            "Wait 30 days for response",
            "Revoke unused licenses",
            "Update contract at renewal",
          ],
          risks: ["Users may need licenses reactivated"],
          timelineWeeks: 6,
        });
      }

      // Check for tier downgrade opportunities
      if (license.tier === "E3" && license.costPerActiveUser > 400) {
        recommendations.push({
          licenseId: license.id,
          licenseName: license.name,
          type: "downgrade_tier",
          description: `Consider downgrading some ${license.name} users to E1 tier if they don't need desktop Office apps`,
          currentCost: license.totalAnnualCost,
          projectedCost: license.totalAnnualCost * 0.7,
          potentialSavings: license.totalAnnualCost * 0.3,
          savingsPercent: 30,
          effort: "medium",
          priority: "medium",
          implementation: [
            "Analyze feature usage by user",
            "Identify users who only use web apps",
            "Pilot E1 with volunteer group",
            "Roll out tier changes",
          ],
          risks: ["User productivity impact if wrong users downgraded"],
          timelineWeeks: 12,
        });
      }

      // Check for consolidation opportunities
      if (license.productFamily === "Microsoft 365" && license.utilizationPercent > 80) {
        // Could consolidate other tools into M365
        recommendations.push({
          licenseId: license.id,
          licenseName: license.name,
          type: "consolidate",
          description: "Consolidate Slack into Microsoft Teams to reduce tool overlap",
          currentCost: 540000, // Slack cost
          projectedCost: 0,
          potentialSavings: 540000,
          savingsPercent: 100,
          effort: "high",
          priority: "medium",
          implementation: [
            "Assess Teams vs Slack feature parity",
            "Create migration plan",
            "Train users on Teams",
            "Run parallel systems",
            "Migrate channels and data",
            "Sunset Slack",
          ],
          risks: ["User adoption challenges", "Data migration complexity", "Integration changes"],
          timelineWeeks: 24,
        });
      }
    }

    return JSON.stringify({
      success: true,
      recommendations,
      totalPotentialSavings: recommendations.reduce((sum, r) => sum + r.potentialSavings, 0),
    });
  },
  {
    name: "generate_optimizations",
    description: "Generate optimization recommendations for licenses",
    schema: z.object({
      licenses: z.array(z.any()).describe("Licenses to analyze"),
      usageData: z.any().describe("Usage data"),
    }),
  }
);

const sendRenewalAlertTool = tool(
  async (input: {
    licenseId: string;
    licenseName: string;
    daysUntilRenewal: number;
    renewalValue: number;
    recommendation: string;
    recipients: string[];
  }) => {
    // This would send notifications
    console.log(`Sending renewal alert for ${input.licenseName}: ${input.daysUntilRenewal} days`);

    return JSON.stringify({
      success: true,
      alertId: `alert_${Date.now()}`,
      sent: true,
    });
  },
  {
    name: "send_renewal_alert",
    description: "Send a renewal alert notification",
    schema: z.object({
      licenseId: z.string().describe("License ID"),
      licenseName: z.string().describe("License name"),
      daysUntilRenewal: z.number().describe("Days until renewal"),
      renewalValue: z.number().describe("Renewal value"),
      recommendation: z.string().describe("Recommendation"),
      recipients: z.array(z.string()).describe("Email recipients"),
    }),
  }
);

const updateLicenseRecordTool = tool(
  async (input: { licenseId: string; updates: Record<string, any> }) => {
    // This would update Convex
    console.log(`Updating license ${input.licenseId}:`, input.updates);

    return JSON.stringify({
      success: true,
      updated: true,
    });
  },
  {
    name: "update_license_record",
    description: "Update a license record in the database",
    schema: z.object({
      licenseId: z.string().describe("License ID"),
      updates: z.record(z.any()).describe("Updates to apply"),
    }),
  }
);

// System prompt
const SYSTEM_PROMPT = `You are the Software License Agent, a specialized AI for managing and optimizing software licenses in university procurement.

Your responsibilities:
1. Track all software licenses and their usage
2. Monitor license utilization to identify waste
3. Manage renewal calendar and send timely alerts
4. Identify optimization opportunities (reduce, consolidate, renegotiate)
5. Support renewal negotiations with data

Key Metrics to Track:
- Utilization Rate: Active users / Total licenses
- Cost per Active User: Total cost / Active users
- Shelfware: Licenses assigned but not used

Optimization Strategies:
1. Right-sizing: Match license count to actual usage
2. Tier optimization: Downgrade users who don't need premium features
3. Consolidation: Reduce tool overlap (e.g., Teams vs Slack)
4. Timing: Negotiate during slow periods or multi-year deals
5. Volume discounts: Combine purchases across departments

Renewal Guidelines:
- 90 days out: Initial analysis and recommendation
- 60 days out: Stakeholder review and decision
- 30 days out: Final negotiation or renewal action
- Auto-renewal: Flag for review if utilization < 70%

Always provide data-driven recommendations with clear ROI calculations.`;

// Create the LangGraph agent
export function createSoftwareLicenseAgent() {
  const model = new ChatAnthropic({
    modelName: "claude-sonnet-4-20250514",
    temperature: 0.2,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  });

  const tools = [
    getLicensesTool,
    getUsageDataTool,
    getRenewalCalendarTool,
    analyzeUtilizationTool,
    generateOptimizationsTool,
    sendRenewalAlertTool,
    updateLicenseRecordTool,
  ];

  // Node: Get all licenses
  const getLicenses = async (state: typeof LicenseState.State) => {
    const result = await getLicensesTool.invoke({
      universityId: state.universityId,
    });

    const parsed = JSON.parse(result);

    return {
      licenses: parsed.licenses || [],
    };
  };

  // Node: Analyze utilization
  const analyzeUtilization = async (state: typeof LicenseState.State) => {
    const result = await analyzeUtilizationTool.invoke({
      licenses: state.licenses,
    });

    const parsed = JSON.parse(result);

    return {
      usageData: parsed,
    };
  };

  // Node: Get renewal calendar
  const getRenewals = async (state: typeof LicenseState.State) => {
    const result = await getRenewalCalendarTool.invoke({
      universityId: state.universityId,
      daysAhead: 90,
    });

    const parsed = JSON.parse(result);

    return {
      renewalCalendar: parsed.renewals || [],
    };
  };

  // Node: Generate optimizations
  const generateOptimizations = async (state: typeof LicenseState.State) => {
    const result = await generateOptimizationsTool.invoke({
      licenses: state.licenses,
      usageData: state.usageData,
    });

    const parsed = JSON.parse(result);

    return {
      optimizationRecommendations: parsed.recommendations || [],
    };
  };

  // Node: Generate analysis
  const generateAnalysis = async (state: typeof LicenseState.State) => {
    const totalSpend = state.licenses.reduce((sum, l) => sum + l.totalAnnualCost, 0);
    const avgUtilization = state.licenses.reduce((sum, l) => sum + l.utilizationPercent, 0) / state.licenses.length;
    const shelfware = state.licenses.filter(l => l.utilizationPercent < 50);
    const shelfwareAmount = shelfware.reduce((sum, l) => {
      const unused = l.totalLicenses - l.activeUsers;
      return sum + (unused * l.costPerLicense * 12);
    }, 0);

    const analysis: LicenseAnalysis = {
      totalLicenses: state.licenses.length,
      totalAnnualSpend: totalSpend,
      averageUtilization: Math.round(avgUtilization),
      shelfwareAmount,
      upcomingRenewals30Days: state.renewalCalendar.filter(r => r.daysUntilRenewal <= 30).length,
      upcomingRenewals90Days: state.renewalCalendar.length,
      totalOptimizationOpportunity: state.optimizationRecommendations.reduce((sum, r) => sum + r.potentialSavings, 0),
      complianceIssues: state.licenses.filter(l => l.complianceStatus !== "compliant").length,
      recommendations: state.optimizationRecommendations
        .filter(r => r.priority === "high")
        .map(r => r.description),
    };

    return {
      analysisResults: analysis,
      messages: [new AIMessage(`Analysis complete: ${analysis.totalLicenses} licenses, $${(analysis.totalAnnualSpend / 1000000).toFixed(2)}M annual spend, ${analysis.averageUtilization}% average utilization`)],
    };
  };

  // Build the graph
  const graph = new StateGraph(LicenseState)
    .addNode("get_licenses", getLicenses)
    .addNode("analyze_utilization", analyzeUtilization)
    .addNode("get_renewals", getRenewals)
    .addNode("generate_optimizations", generateOptimizations)
    .addNode("generate_analysis", generateAnalysis)
    .addEdge(START, "get_licenses")
    .addEdge("get_licenses", "analyze_utilization")
    .addEdge("analyze_utilization", "get_renewals")
    .addEdge("get_renewals", "generate_optimizations")
    .addEdge("generate_optimizations", "generate_analysis")
    .addEdge("generate_analysis", END);

  return graph.compile();
}

// Export function to run the agent
export async function runSoftwareLicenseAgent(input: {
  universityId: string;
}): Promise<{
  success: boolean;
  analysis?: LicenseAnalysis;
  licenses?: SoftwareLicense[];
  optimizations?: OptimizationRecommendation[];
  renewals?: RenewalItem[];
  error?: string;
}> {
  try {
    const agent = createSoftwareLicenseAgent();

    const result = await agent.invoke({
      universityId: input.universityId,
    });

    return {
      success: true,
      analysis: result.analysisResults,
      licenses: result.licenses,
      optimizations: result.optimizationRecommendations,
      renewals: result.renewalCalendar,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================
// INNGEST FUNCTIONS
// ============================================

/**
 * Daily License Usage Check
 */
export const dailyLicenseUsageCheck = inngest.createFunction(
  { id: "license-daily-usage", name: "Daily License Usage Check" },
  { cron: "0 7 * * *" }, // 7 AM daily
  async ({ step }) => {
    // Get all universities
    const universities = await step.run("get-universities", async () => {
      return [{ id: "univ_columbia" }];
    });

    const results = [];

    for (const univ of universities) {
      const analysis = await step.run(`analyze-${univ.id}`, async () => {
        return await runSoftwareLicenseAgent({
          universityId: univ.id,
        });
      });

      results.push({ universityId: univ.id, ...analysis });
    }

    return {
      universitiesProcessed: universities.length,
      results,
    };
  }
);

/**
 * License Renewal Approaching
 */
export const licenseRenewalApproaching = inngest.createFunction(
  { id: "license-renewal-alert", name: "License Renewal Alert" },
  { event: "license/renewal-approaching" },
  async ({ event, step }) => {
    const { universityId, licenseId, renewalDate, daysUntilRenewal } = event.data;

    // Run analysis for the specific license
    const analysis = await step.run("analyze-license", async () => {
      return await runSoftwareLicenseAgent({
        universityId,
      });
    });

    // Find recommendations for this license
    const licenseOptimizations = analysis.optimizations?.filter(
      (o) => o.licenseId === licenseId
    );

    // Send alert with recommendations
    await step.run("send-alert", async () => {
      const license = analysis.licenses?.find(l => l.id === licenseId);
      if (!license) return;

      // Would send email notification
      console.log(`Renewal alert for ${license.name}: ${daysUntilRenewal} days`);
    });

    return {
      success: true,
      licenseId,
      daysUntilRenewal,
      optimizations: licenseOptimizations,
    };
  }
);

/**
 * Weekly License Optimization Analysis
 */
export const weeklyLicenseOptimization = inngest.createFunction(
  { id: "license-weekly-optimization", name: "Weekly License Optimization" },
  { cron: "0 8 * * 1" }, // Monday 8 AM
  async ({ step }) => {
    const universities = await step.run("get-universities", async () => {
      return [{ id: "univ_columbia" }];
    });

    const results = [];

    for (const univ of universities) {
      const analysis = await step.run(`optimize-${univ.id}`, async () => {
        return await runSoftwareLicenseAgent({
          universityId: univ.id,
        });
      });

      // Send optimization report if significant savings found
      if (analysis.analysis && analysis.analysis.totalOptimizationOpportunity > 10000) {
        await step.run(`notify-${univ.id}`, async () => {
          console.log(`Sending optimization report for ${univ.id}: $${analysis.analysis!.totalOptimizationOpportunity} savings opportunity`);
        });
      }

      results.push({ universityId: univ.id, ...analysis });
    }

    return {
      universitiesProcessed: universities.length,
      totalOptimizationOpportunity: results.reduce(
        (sum, r) => sum + (r.analysis?.totalOptimizationOpportunity || 0),
        0
      ),
    };
  }
);

// Export types
export type {
  SoftwareLicense,
  UsageRecord,
  RenewalItem,
  OptimizationRecommendation,
  LicenseAnalysis,
};
