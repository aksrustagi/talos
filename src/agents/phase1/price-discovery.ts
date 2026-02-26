/**
 * Agent 2: Price Discovery Agent
 *
 * Purpose: Continuous price monitoring, comparison, and opportunity identification
 * Runtime: Inngest (scheduled) + LangGraph + VAPI (AI calling)
 *
 * Capabilities:
 * - Daily price monitoring for high-spend items
 * - Market price analysis
 * - Quote collection via email and AI calls
 * - Opportunity identification
 * - Price trend analysis
 */

import { ChatAnthropic } from "@langchain/anthropic";
import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { inngest } from "../../inngest/client";

// State definition for the Price Discovery Agent
const PriceDiscoveryState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  universityId: Annotation<string>({
    reducer: (_, b) => b,
    default: () => "",
  }),
  monitoredItems: Annotation<MonitoredItem[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  priceSnapshots: Annotation<PriceSnapshot[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  opportunities: Annotation<SavingsOpportunity[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  callsQueued: Annotation<QueuedCall[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  analysisResults: Annotation<AnalysisResult | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),
});

// Types
interface MonitoredItem {
  productId: string;
  productName: string;
  currentPrice: number;
  contractPrice?: number;
  annualVolume: number;
  annualSpend: number;
  lastChecked: number;
  priceChangeThreshold: number;
}

interface PriceSnapshot {
  productId: string;
  vendorId: string;
  vendorName: string;
  price: number;
  listPrice: number;
  pricePerUnit: number;
  source: "catalog" | "web" | "api" | "call" | "email";
  availability: string;
  capturedAt: number;
}

interface SavingsOpportunity {
  id: string;
  type: "price_reduction" | "vendor_switch" | "volume_discount" | "timing" | "alternative_product";
  productId: string;
  productName: string;
  currentPrice: number;
  opportunityPrice: number;
  potentialSavings: number;
  annualSavings: number;
  savingsPercent: number;
  vendorId?: string;
  vendorName?: string;
  confidence: number;
  actionRequired: string;
  expiresAt?: number;
}

interface QueuedCall {
  vendorId: string;
  vendorName: string;
  vendorPhone: string;
  productId: string;
  productName: string;
  purpose: string;
  targetPrice?: number;
  scheduledAt?: number;
}

interface AnalysisResult {
  itemsChecked: number;
  priceChangesDetected: number;
  opportunitiesFound: number;
  totalPotentialSavings: number;
  callsQueued: number;
  recommendations: string[];
}

// Tool definitions
const getHighSpendItemsTool = tool(
  async (input: { universityId: string; minAnnualSpend: number; limit: number }) => {
    // This would query Convex for high-spend monitored items
    const items: MonitoredItem[] = [
      {
        productId: "prod_001",
        productName: "50ml Conical Centrifuge Tubes",
        currentPrice: 185.00,
        contractPrice: 185.00,
        annualVolume: 50,
        annualSpend: 9250.00,
        lastChecked: Date.now() - 86400000,
        priceChangeThreshold: 0.05,
      },
      {
        productId: "prod_002",
        productName: "Nitrile Examination Gloves (L)",
        currentPrice: 45.00,
        contractPrice: 42.00,
        annualVolume: 200,
        annualSpend: 9000.00,
        lastChecked: Date.now() - 86400000,
        priceChangeThreshold: 0.05,
      },
      {
        productId: "prod_003",
        productName: "PCR Plates 96-well",
        currentPrice: 125.00,
        contractPrice: 125.00,
        annualVolume: 100,
        annualSpend: 12500.00,
        lastChecked: Date.now() - 86400000,
        priceChangeThreshold: 0.05,
      },
    ];

    return JSON.stringify({
      success: true,
      items: items.filter(i => i.annualSpend >= input.minAnnualSpend).slice(0, input.limit),
      totalCount: items.length,
    });
  },
  {
    name: "get_high_spend_items",
    description: "Get high-spend items that need price monitoring",
    schema: z.object({
      universityId: z.string().describe("University ID"),
      minAnnualSpend: z.number().describe("Minimum annual spend threshold"),
      limit: z.number().describe("Maximum items to return"),
    }),
  }
);

const checkItemPriceTool = tool(
  async (input: { productId: string; productName: string; vendors: string[] }) => {
    // This would check current prices across vendors
    const snapshots: PriceSnapshot[] = [
      {
        productId: input.productId,
        vendorId: "vendor_fisher",
        vendorName: "Fisher Scientific",
        price: 185.00,
        listPrice: 220.00,
        pricePerUnit: 0.37,
        source: "api",
        availability: "in_stock",
        capturedAt: Date.now(),
      },
      {
        productId: input.productId,
        vendorId: "vendor_vwr",
        vendorName: "VWR",
        price: 178.00,
        listPrice: 215.00,
        pricePerUnit: 0.356,
        source: "api",
        availability: "in_stock",
        capturedAt: Date.now(),
      },
      {
        productId: input.productId,
        vendorId: "vendor_amazon",
        vendorName: "Amazon Business",
        price: 165.00,
        listPrice: 165.00,
        pricePerUnit: 0.33,
        source: "web",
        availability: "in_stock",
        capturedAt: Date.now(),
      },
    ];

    return JSON.stringify({
      success: true,
      productId: input.productId,
      snapshots,
      lowestPrice: Math.min(...snapshots.map(s => s.price)),
      highestPrice: Math.max(...snapshots.map(s => s.price)),
      priceSpread: Math.max(...snapshots.map(s => s.price)) - Math.min(...snapshots.map(s => s.price)),
    });
  },
  {
    name: "check_item_price",
    description: "Check current prices for an item across vendors",
    schema: z.object({
      productId: z.string().describe("Product ID to check"),
      productName: z.string().describe("Product name for search"),
      vendors: z.array(z.string()).describe("Vendor IDs to check"),
    }),
  }
);

const getHistoricalPricesTool = tool(
  async (input: { productId: string; days: number }) => {
    // This would get historical price data from Convex
    const history = [
      { date: "2025-01-01", price: 188.00, vendor: "Fisher Scientific" },
      { date: "2025-01-08", price: 185.00, vendor: "Fisher Scientific" },
      { date: "2025-01-15", price: 185.00, vendor: "Fisher Scientific" },
      { date: "2025-01-22", price: 182.00, vendor: "VWR" },
    ];

    return JSON.stringify({
      success: true,
      productId: input.productId,
      history,
      trend: "declining",
      averagePrice: 185.00,
      lowestHistorical: 182.00,
      highestHistorical: 188.00,
    });
  },
  {
    name: "get_historical_prices",
    description: "Get historical price data for trend analysis",
    schema: z.object({
      productId: z.string().describe("Product ID"),
      days: z.number().describe("Number of days of history"),
    }),
  }
);

const getContractPricingTool = tool(
  async (input: { productId: string; universityId: string }) => {
    // This would look up contract pricing from Convex
    return JSON.stringify({
      success: true,
      productId: input.productId,
      hasContract: true,
      contractPrice: 185.00,
      contractVendor: "Fisher Scientific",
      contractNumber: "CU-FISHER-2024-001",
      contractExpires: "2025-12-31",
      volumeCommitment: 100,
      currentVolume: 45,
    });
  },
  {
    name: "get_contract_pricing",
    description: "Get contract pricing information for a product",
    schema: z.object({
      productId: z.string().describe("Product ID"),
      universityId: z.string().describe("University ID"),
    }),
  }
);

const identifyOpportunitiesTool = tool(
  async (input: {
    currentPrices: PriceSnapshot[];
    historicalData: any;
    contractPricing: any;
    annualVolume: number;
  }) => {
    const opportunities: SavingsOpportunity[] = [];

    // Check for better prices from other vendors
    const contractPrice = input.contractPricing?.contractPrice || 0;
    const lowestPrice = Math.min(...input.currentPrices.map(p => p.price));
    const lowestPriceVendor = input.currentPrices.find(p => p.price === lowestPrice);

    if (lowestPrice < contractPrice) {
      const savings = (contractPrice - lowestPrice) * input.annualVolume;
      opportunities.push({
        id: `opp_${Date.now()}_1`,
        type: "vendor_switch",
        productId: input.currentPrices[0]?.productId || "",
        productName: "Product",
        currentPrice: contractPrice,
        opportunityPrice: lowestPrice,
        potentialSavings: contractPrice - lowestPrice,
        annualSavings: savings,
        savingsPercent: ((contractPrice - lowestPrice) / contractPrice) * 100,
        vendorId: lowestPriceVendor?.vendorId,
        vendorName: lowestPriceVendor?.vendorName,
        confidence: 0.85,
        actionRequired: "Consider switching to lower-priced vendor or renegotiating contract",
      });
    }

    // Check for timing opportunities based on price trends
    if (input.historicalData?.trend === "declining") {
      opportunities.push({
        id: `opp_${Date.now()}_2`,
        type: "timing",
        productId: input.currentPrices[0]?.productId || "",
        productName: "Product",
        currentPrice: contractPrice,
        opportunityPrice: input.historicalData.lowestHistorical,
        potentialSavings: contractPrice - input.historicalData.lowestHistorical,
        annualSavings: (contractPrice - input.historicalData.lowestHistorical) * input.annualVolume,
        savingsPercent: ((contractPrice - input.historicalData.lowestHistorical) / contractPrice) * 100,
        confidence: 0.7,
        actionRequired: "Prices are declining - consider timing bulk purchase for additional savings",
      });
    }

    return JSON.stringify({
      success: true,
      opportunities,
      totalPotentialSavings: opportunities.reduce((sum, o) => sum + o.annualSavings, 0),
    });
  },
  {
    name: "identify_opportunities",
    description: "Analyze price data to identify savings opportunities",
    schema: z.object({
      currentPrices: z.array(z.any()).describe("Current price snapshots"),
      historicalData: z.any().describe("Historical price data"),
      contractPricing: z.any().describe("Contract pricing information"),
      annualVolume: z.number().describe("Annual purchase volume"),
    }),
  }
);

const queueVendorCallTool = tool(
  async (input: {
    vendorId: string;
    vendorName: string;
    vendorPhone: string;
    productId: string;
    productName: string;
    targetPrice: number;
    reason: string;
  }) => {
    // This would queue a call via VAPI
    const callId = `call_${Date.now()}`;

    return JSON.stringify({
      success: true,
      callId,
      queued: true,
      vendorId: input.vendorId,
      vendorName: input.vendorName,
      estimatedCallTime: "Next business day",
    });
  },
  {
    name: "queue_vendor_call",
    description: "Queue an AI-powered call to a vendor for price negotiation",
    schema: z.object({
      vendorId: z.string().describe("Vendor ID"),
      vendorName: z.string().describe("Vendor name"),
      vendorPhone: z.string().describe("Vendor phone number"),
      productId: z.string().describe("Product ID"),
      productName: z.string().describe("Product name"),
      targetPrice: z.number().describe("Target price to negotiate"),
      reason: z.string().describe("Reason for the call"),
    }),
  }
);

const storePriceSnapshotsTool = tool(
  async (input: { snapshots: PriceSnapshot[] }) => {
    // This would store snapshots in Convex
    return JSON.stringify({
      success: true,
      stored: input.snapshots.length,
    });
  },
  {
    name: "store_price_snapshots",
    description: "Store price snapshots in the database",
    schema: z.object({
      snapshots: z.array(z.any()).describe("Price snapshots to store"),
    }),
  }
);

const createSavingsAlertTool = tool(
  async (input: { opportunities: SavingsOpportunity[]; universityId: string }) => {
    // This would create alerts in Convex and send notifications
    return JSON.stringify({
      success: true,
      alertsCreated: input.opportunities.length,
      totalSavings: input.opportunities.reduce((sum, o) => sum + o.annualSavings, 0),
    });
  },
  {
    name: "create_savings_alert",
    description: "Create savings alerts for identified opportunities",
    schema: z.object({
      opportunities: z.array(z.any()).describe("Savings opportunities"),
      universityId: z.string().describe("University ID"),
    }),
  }
);

// System prompt
const SYSTEM_PROMPT = `You are the Price Discovery Agent, a specialized AI for continuous price monitoring and opportunity identification in university procurement.

Your responsibilities:
1. Monitor prices for high-spend items daily
2. Compare current prices against contracts and historical data
3. Identify savings opportunities through:
   - Better prices from other vendors
   - Volume discount opportunities
   - Seasonal pricing patterns
   - Contract renegotiation triggers
4. Queue AI calls for large opportunities (>$5,000 potential savings)
5. Generate actionable insights and recommendations

When analyzing prices:
- Always calculate annual impact based on typical purchase volume
- Compare against both contract prices and market prices
- Consider total cost including shipping
- Flag significant deviations (>5% from contract)
- Prioritize opportunities by ROI and ease of implementation

For large opportunities (>$5,000 annual savings):
- Recommend vendor calls for quote verification
- Suggest contract renegotiation when justified
- Identify alternative products that meet specs

Always provide specific, actionable recommendations with quantified savings.`;

// Create the LangGraph agent
export function createPriceDiscoveryAgent() {
  const model = new ChatAnthropic({
    modelName: "claude-sonnet-4-20250514",
    temperature: 0.2,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  });

  const tools = [
    getHighSpendItemsTool,
    checkItemPriceTool,
    getHistoricalPricesTool,
    getContractPricingTool,
    identifyOpportunitiesTool,
    queueVendorCallTool,
    storePriceSnapshotsTool,
    createSavingsAlertTool,
  ];

  const modelWithTools = model.bindTools(tools);

  // Node: Get monitored items
  const getMonitoredItems = async (state: typeof PriceDiscoveryState.State) => {
    const result = await getHighSpendItemsTool.invoke({
      universityId: state.universityId,
      minAnnualSpend: 5000,
      limit: 100,
    });

    const parsed = JSON.parse(result);

    return {
      monitoredItems: parsed.items || [],
      messages: [new AIMessage(`Found ${parsed.items?.length || 0} items to monitor`)],
    };
  };

  // Node: Check prices for all items
  const checkPrices = async (state: typeof PriceDiscoveryState.State) => {
    const allSnapshots: PriceSnapshot[] = [];

    for (const item of state.monitoredItems.slice(0, 10)) {
      try {
        const result = await checkItemPriceTool.invoke({
          productId: item.productId,
          productName: item.productName,
          vendors: ["fisher", "vwr", "grainger", "amazon"],
        });

        const parsed = JSON.parse(result);
        if (parsed.snapshots) {
          allSnapshots.push(...parsed.snapshots);
        }
      } catch (error) {
        // Continue with other items
      }
    }

    return {
      priceSnapshots: allSnapshots,
    };
  };

  // Node: Analyze and find opportunities
  const findOpportunities = async (state: typeof PriceDiscoveryState.State) => {
    const opportunities: SavingsOpportunity[] = [];

    for (const item of state.monitoredItems) {
      const itemSnapshots = state.priceSnapshots.filter(s => s.productId === item.productId);

      if (itemSnapshots.length === 0) continue;

      // Get historical data
      const histResult = await getHistoricalPricesTool.invoke({
        productId: item.productId,
        days: 90,
      });
      const historicalData = JSON.parse(histResult);

      // Get contract pricing
      const contractResult = await getContractPricingTool.invoke({
        productId: item.productId,
        universityId: state.universityId,
      });
      const contractPricing = JSON.parse(contractResult);

      // Identify opportunities
      const oppResult = await identifyOpportunitiesTool.invoke({
        currentPrices: itemSnapshots,
        historicalData,
        contractPricing,
        annualVolume: item.annualVolume,
      });

      const parsed = JSON.parse(oppResult);
      if (parsed.opportunities) {
        // Add product name to opportunities
        const namedOpps = parsed.opportunities.map((o: SavingsOpportunity) => ({
          ...o,
          productId: item.productId,
          productName: item.productName,
        }));
        opportunities.push(...namedOpps);
      }
    }

    return {
      opportunities,
    };
  };

  // Node: Queue calls for high-value opportunities
  const queueCalls = async (state: typeof PriceDiscoveryState.State) => {
    const highValueOpps = state.opportunities.filter(o => o.annualSavings >= 5000);
    const queuedCalls: QueuedCall[] = [];

    for (const opp of highValueOpps) {
      if (opp.vendorId && opp.vendorName) {
        const call: QueuedCall = {
          vendorId: opp.vendorId,
          vendorName: opp.vendorName,
          vendorPhone: "1-800-555-0100", // Would come from vendor database
          productId: opp.productId,
          productName: opp.productName,
          purpose: "quote_request",
          targetPrice: opp.opportunityPrice,
        };
        queuedCalls.push(call);
      }
    }

    return {
      callsQueued: queuedCalls,
    };
  };

  // Node: Generate analysis results
  const generateAnalysis = async (state: typeof PriceDiscoveryState.State) => {
    // Store snapshots
    if (state.priceSnapshots.length > 0) {
      await storePriceSnapshotsTool.invoke({
        snapshots: state.priceSnapshots,
      });
    }

    // Create alerts for opportunities
    if (state.opportunities.length > 0) {
      await createSavingsAlertTool.invoke({
        opportunities: state.opportunities,
        universityId: state.universityId,
      });
    }

    const analysis: AnalysisResult = {
      itemsChecked: state.monitoredItems.length,
      priceChangesDetected: state.priceSnapshots.length,
      opportunitiesFound: state.opportunities.length,
      totalPotentialSavings: state.opportunities.reduce((sum, o) => sum + o.annualSavings, 0),
      callsQueued: state.callsQueued.length,
      recommendations: state.opportunities.map(o => o.actionRequired),
    };

    return {
      analysisResults: analysis,
      messages: [new AIMessage(`Analysis complete: Found ${analysis.opportunitiesFound} opportunities with $${analysis.totalPotentialSavings.toFixed(2)} potential annual savings`)],
    };
  };

  // Build the graph
  const graph = new StateGraph(PriceDiscoveryState)
    .addNode("get_items", getMonitoredItems)
    .addNode("check_prices", checkPrices)
    .addNode("find_opportunities", findOpportunities)
    .addNode("queue_calls", queueCalls)
    .addNode("generate_analysis", generateAnalysis)
    .addEdge(START, "get_items")
    .addEdge("get_items", "check_prices")
    .addEdge("check_prices", "find_opportunities")
    .addEdge("find_opportunities", "queue_calls")
    .addEdge("queue_calls", "generate_analysis")
    .addEdge("generate_analysis", END);

  return graph.compile();
}

// Export function to run the agent
export async function runPriceDiscoveryAgent(input: {
  universityId: string;
}): Promise<{
  success: boolean;
  results: AnalysisResult | undefined;
  opportunities: SavingsOpportunity[];
  callsQueued: QueuedCall[];
  error?: string;
}> {
  try {
    const agent = createPriceDiscoveryAgent();

    const result = await agent.invoke({
      universityId: input.universityId,
    });

    return {
      success: true,
      results: result.analysisResults,
      opportunities: result.opportunities,
      callsQueued: result.callsQueued,
    };
  } catch (error) {
    return {
      success: false,
      results: undefined,
      opportunities: [],
      callsQueued: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================
// INNGEST FUNCTIONS
// ============================================

/**
 * Daily Price Discovery - Scheduled job
 */
export const dailyPriceDiscovery = inngest.createFunction(
  { id: "price-discovery-daily", name: "Daily Price Discovery" },
  { cron: "0 6 * * *" }, // 6 AM daily
  async ({ step }) => {
    // Get all active universities
    const universities = await step.run("get-universities", async () => {
      // This would query Convex for active universities
      return [
        { id: "univ_columbia", name: "Columbia University" },
        { id: "univ_nyu", name: "New York University" },
      ];
    });

    const results = [];

    for (const university of universities) {
      // Run price discovery for each university
      const discoveryResult = await step.run(`discover-${university.id}`, async () => {
        return await runPriceDiscoveryAgent({
          universityId: university.id,
        });
      });

      results.push({
        universityId: university.id,
        ...discoveryResult,
      });

      // Queue calls for high-value opportunities
      if (discoveryResult.callsQueued.length > 0) {
        for (const call of discoveryResult.callsQueued) {
          await step.sendEvent("queue-vendor-call", {
            name: "vendor/call-for-quote",
            data: {
              universityId: university.id,
              opportunityId: `opp_${Date.now()}`,
              vendorId: call.vendorId,
              productId: call.productId,
              vendorPhone: call.vendorPhone,
            },
          });
        }
      }
    }

    return {
      universitiesProcessed: universities.length,
      totalOpportunities: results.reduce((sum, r) => sum + (r.opportunities?.length || 0), 0),
      totalPotentialSavings: results.reduce(
        (sum, r) => sum + (r.results?.totalPotentialSavings || 0),
        0
      ),
    };
  }
);

/**
 * Vendor Call for Quote - Triggered by opportunity detection
 */
export const vendorCallForQuote = inngest.createFunction(
  { id: "vendor-call-for-quote", name: "Vendor Call for Quote" },
  { event: "vendor/call-for-quote" },
  async ({ event, step }) => {
    const { universityId, opportunityId, vendorId, productId, vendorPhone } = event.data;

    // Step 1: Prepare call context
    const context = await step.run("prepare-context", async () => {
      // Get vendor, product, and historical data
      return {
        vendorName: "Example Vendor",
        productName: "Example Product",
        currentPrice: 185.00,
        targetPrice: 165.00,
        historicalLow: 160.00,
      };
    });

    // Step 2: Generate call script
    const script = await step.run("generate-script", async () => {
      const model = new ChatAnthropic({
        modelName: "claude-sonnet-4-20250514",
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      });

      const response = await model.invoke([
        new SystemMessage(`You are an AI assistant helping generate a professional phone script for procurement negotiation.`),
        new HumanMessage(`Generate a professional phone script to request a quote for:
- Product: ${context.productName}
- Current price we pay: $${context.currentPrice}
- Target price: $${context.targetPrice}
- Historical low: $${context.historicalLow}

The call should:
1. Introduce yourself as calling from the university procurement department
2. Request a quote for the product
3. Mention you're evaluating multiple vendors
4. Ask about volume discounts
5. Get validity period for the quote

Keep it professional and concise.`),
      ]);

      return {
        opening: "Hello, this is the procurement department calling...",
        fullScript: response.content as string,
      };
    });

    // Step 3: Make the call via VAPI (placeholder)
    const callResult = await step.run("make-call", async () => {
      // This would integrate with VAPI to make the actual call
      // For now, return a mock result
      return {
        callId: `vapi_call_${Date.now()}`,
        status: "completed",
        duration: 180,
        transcript: "Mock call transcript...",
      };
    });

    // Step 4: Process call results
    const quote = await step.run("process-results", async () => {
      // Extract quote information from the call
      return {
        quotedPrice: 170.00,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        volumeDiscount: "5% off for orders over 10 units",
        notes: "Quote obtained via AI call",
      };
    });

    // Step 5: Store quote
    await step.run("store-quote", async () => {
      // Store in Convex
      return { stored: true };
    });

    return {
      success: true,
      callId: callResult.callId,
      quote,
    };
  }
);

// Export types
export type { MonitoredItem, PriceSnapshot, SavingsOpportunity, QueuedCall, AnalysisResult };
