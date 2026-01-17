/**
 * LangGraph Agent Implementations
 *
 * These agents use LangGraph for multi-step reasoning with tool use.
 * Each agent has a specific domain and set of tools.
 */

import { ChatAnthropic } from "@langchain/anthropic";
import { StateGraph, END } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// Types
interface AgentState {
  messages: BaseMessage[];
  context: Record<string, any>;
  toolResults: Record<string, any>;
  finalOutput?: any;
}

// Tool definitions
const priceComparisonTool = tool(
  async (input: { productId: string; vendors?: string[] }) => {
    // Simulate price comparison
    return JSON.stringify({
      productId: input.productId,
      prices: [
        { vendor: "Fisher", price: 42.0, shipping: 0 },
        { vendor: "VWR", price: 38.5, shipping: 0 },
        { vendor: "Sigma", price: 45.0, shipping: 5.0 },
      ],
      bestDeal: { vendor: "VWR", totalCost: 38.5 },
    });
  },
  {
    name: "compare_prices",
    description: "Compare prices across vendors for a product",
    schema: z.object({
      productId: z.string().describe("Product ID to compare"),
      vendors: z.array(z.string()).optional().describe("Specific vendors to compare"),
    }),
  }
);

const checkContractPriceTool = tool(
  async (input: { productId: string; vendorId: string }) => {
    // Simulate contract price lookup
    return JSON.stringify({
      productId: input.productId,
      vendorId: input.vendorId,
      contractPrice: 0.42,
      listPrice: 0.55,
      discount: 24,
      contractNumber: "CU-FISHER-2024-001",
    });
  },
  {
    name: "check_contract_price",
    description: "Check the contract price for a product with a vendor",
    schema: z.object({
      productId: z.string().describe("Product ID"),
      vendorId: z.string().describe("Vendor ID"),
    }),
  }
);

const getPriceHistoryTool = tool(
  async (input: { productId: string; days?: number }) => {
    // Simulate price history
    return JSON.stringify({
      productId: input.productId,
      history: [
        { date: "2024-10-01", price: 0.44 },
        { date: "2024-11-01", price: 0.45 },
        { date: "2024-12-01", price: 0.43 },
        { date: "2025-01-01", price: 0.47 },
      ],
      trend: "rising",
      recommendation: "wait_for_price_drop",
    });
  },
  {
    name: "get_price_history",
    description: "Get historical price data for a product",
    schema: z.object({
      productId: z.string().describe("Product ID"),
      days: z.number().optional().describe("Number of days of history"),
    }),
  }
);

const checkBudgetTool = tool(
  async (input: { budgetCode: string; amount: number }) => {
    // Simulate budget check
    const available = 45230;
    return JSON.stringify({
      budgetCode: input.budgetCode,
      available,
      requested: input.amount,
      afterPurchase: available - input.amount,
      status: input.amount <= available ? "ok" : "exceeded",
    });
  },
  {
    name: "check_budget",
    description: "Check if budget is available for a purchase",
    schema: z.object({
      budgetCode: z.string().describe("Budget code to check"),
      amount: z.number().describe("Amount to check against budget"),
    }),
  }
);

const searchProductsTool = tool(
  async (input: { query: string; category?: string }) => {
    // Simulate product search
    return JSON.stringify({
      query: input.query,
      results: [
        {
          id: "prod_001",
          name: "50ml Conical Tubes",
          manufacturer: "Corning",
          mpn: "430829",
        },
        {
          id: "prod_002",
          name: "50ml Centrifuge Tubes",
          manufacturer: "Fisher",
          mpn: "14-959-53A",
        },
      ],
    });
  },
  {
    name: "search_products",
    description: "Search for products in the catalog",
    schema: z.object({
      query: z.string().describe("Search query"),
      category: z.string().optional().describe("Category filter"),
    }),
  }
);

const getVendorInfoTool = tool(
  async (input: { vendorId: string }) => {
    // Simulate vendor info lookup
    return JSON.stringify({
      vendorId: input.vendorId,
      name: "Fisher Scientific",
      diversityStatus: [],
      performance: {
        overallScore: 92,
        onTimeRate: 0.96,
        qualityScore: 95,
      },
      contractStatus: "active",
      leadTime: 2,
    });
  },
  {
    name: "get_vendor_info",
    description: "Get information about a vendor",
    schema: z.object({
      vendorId: z.string().describe("Vendor ID"),
    }),
  }
);

const createPriceAlertTool = tool(
  async (input: { productId: string; targetPrice: number; alertType: string }) => {
    return JSON.stringify({
      alertId: `alert_${Date.now()}`,
      productId: input.productId,
      targetPrice: input.targetPrice,
      alertType: input.alertType,
      status: "active",
    });
  },
  {
    name: "create_price_alert",
    description: "Create a price alert for a product",
    schema: z.object({
      productId: z.string().describe("Product ID"),
      targetPrice: z.number().describe("Target price to alert at"),
      alertType: z
        .enum(["price_drop", "price_increase", "target_price"])
        .describe("Type of alert"),
    }),
  }
);

/**
 * Create a LangGraph agent with the specified tools and system prompt
 */
function createAgent(
  agentId: string,
  systemPrompt: string,
  tools: any[]
) {
  // Initialize model
  const model = new ChatAnthropic({
    modelName: "claude-3-5-sonnet-20241022",
    temperature: 0.3,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  }).bindTools(tools);

  // Create state graph
  const graph = new StateGraph<AgentState>({
    channels: {
      messages: { reducer: (a, b) => [...a, ...b], default: () => [] },
      context: { reducer: (a, b) => ({ ...a, ...b }), default: () => ({}) },
      toolResults: { reducer: (a, b) => ({ ...a, ...b }), default: () => ({}) },
      finalOutput: { reducer: (_, b) => b, default: () => undefined },
    },
  });

  // Define nodes
  const shouldContinue = (state: AgentState): "tools" | "end" => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage instanceof AIMessage && lastMessage.tool_calls?.length) {
      return "tools";
    }
    return "end";
  };

  const callModel = async (
    state: AgentState,
    config?: RunnableConfig
  ): Promise<Partial<AgentState>> => {
    const messages = [new SystemMessage(systemPrompt), ...state.messages];
    const response = await model.invoke(messages, config);
    return { messages: [response] };
  };

  const callTools = async (state: AgentState): Promise<Partial<AgentState>> => {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    const toolCalls = lastMessage.tool_calls || [];

    const results: Record<string, any> = {};
    const toolMessages: BaseMessage[] = [];

    for (const toolCall of toolCalls) {
      const tool = tools.find((t) => t.name === toolCall.name);
      if (tool) {
        try {
          const result = await tool.invoke(toolCall.args);
          results[toolCall.name] = JSON.parse(result);
          toolMessages.push(
            new HumanMessage({
              content: `Tool ${toolCall.name} result: ${result}`,
              name: toolCall.name,
            })
          );
        } catch (error) {
          toolMessages.push(
            new HumanMessage({
              content: `Tool ${toolCall.name} error: ${error}`,
              name: toolCall.name,
            })
          );
        }
      }
    }

    return {
      messages: toolMessages,
      toolResults: results,
    };
  };

  // Build graph
  graph.addNode("agent", callModel);
  graph.addNode("tools", callTools);
  graph.addEdge("__start__", "agent");
  graph.addConditionalEdges("agent", shouldContinue, {
    tools: "tools",
    end: END,
  });
  graph.addEdge("tools", "agent");

  return graph.compile();
}

/**
 * Price Watch Agent
 * Monitors prices and generates alerts
 */
export const priceWatchAgent = createAgent(
  "price-watch",
  `You are the PriceWatch Agent, a specialized AI for real-time procurement price monitoring.

Your responsibilities:
1. Monitor price changes across vendor catalogs
2. Detect significant price movements (>5% change)
3. Identify arbitrage opportunities
4. Track contract price compliance
5. Generate alerts and recommendations

When analyzing prices:
- Always calculate annual impact based on typical purchase volume
- Compare current prices to contract prices
- Look for equivalent products at lower prices
- Consider shipping costs in total cost analysis

Format your final response as actionable insights with specific recommendations.`,
  [
    priceComparisonTool,
    checkContractPriceTool,
    getPriceHistoryTool,
    createPriceAlertTool,
  ]
);

/**
 * Price Compare Agent
 * Compares prices across vendors
 */
export const priceCompareAgent = createAgent(
  "price-compare",
  `You are the Price Compare Agent, an expert at analyzing and comparing prices across vendors.

Your responsibilities:
1. Compare prices across all available vendors
2. Calculate total cost including shipping, handling, and taxes
3. Identify volume discount opportunities
4. Compare contract vs spot prices
5. Benchmark against network averages

When comparing:
- Normalize to same unit of measure
- Factor in minimum order quantities
- Consider lead times and delivery speed
- Check for diversity supplier options
- Look at payment terms (early pay discounts)

Provide clear rankings and specific savings calculations.`,
  [
    priceComparisonTool,
    checkContractPriceTool,
    getVendorInfoTool,
    searchProductsTool,
  ]
);

/**
 * Requisition Agent
 * Processes purchase requests
 */
export const requisitionAgent = createAgent(
  "requisition",
  `You are the Requisition Agent, the front-line AI for processing purchase requests.

Your responsibilities:
1. Parse natural language purchase requests
2. Match items to catalog products
3. Check budget availability
4. Find optimal vendors for each item
5. Generate properly formatted requisitions

When processing requests:
- Extract items, quantities, urgency, and budget information
- Match products to the best catalog entry
- Always check budget before finalizing
- Suggest cost-saving alternatives when available
- Flag items requiring special approval (IT, chemicals, etc.)

Be helpful and proactive in identifying savings opportunities.`,
  [
    searchProductsTool,
    priceComparisonTool,
    checkBudgetTool,
    getVendorInfoTool,
  ]
);

/**
 * Vendor Selection Agent
 * Recommends optimal vendors
 */
export const vendorSelectionAgent = createAgent(
  "vendor-selection",
  `You are the Vendor Selection Agent, an expert at recommending optimal vendors.

Your responsibilities:
1. Score vendors on price, quality, delivery, service, compliance
2. Identify qualified diverse suppliers
3. Flag vendor risks
4. Support strategic sourcing decisions

Evaluation factors (weighted):
- Price (30%): Unit price, discounts, shipping, payment terms
- Quality (20%): Defect rate, return rate, specs match
- Delivery (20%): On-time rate, lead time, tracking
- Service (15%): Responsiveness, issue resolution
- Compliance (10%): Contract compliance, invoice accuracy
- Strategic (5%): Diversity, sustainability, local preference

Always provide a balanced recommendation considering all factors.`,
  [
    getVendorInfoTool,
    priceComparisonTool,
    checkContractPriceTool,
  ]
);

/**
 * Run an agent with input
 */
export async function runAgent(
  agentId: string,
  input: string | Record<string, any>,
  context?: Record<string, any>
): Promise<{
  success: boolean;
  output: any;
  messages: BaseMessage[];
}> {
  // Select agent
  let agent;
  switch (agentId) {
    case "price-watch":
      agent = priceWatchAgent;
      break;
    case "price-compare":
      agent = priceCompareAgent;
      break;
    case "requisition":
      agent = requisitionAgent;
      break;
    case "vendor-selection":
      agent = vendorSelectionAgent;
      break;
    default:
      throw new Error(`Unknown agent: ${agentId}`);
  }

  try {
    // Format input
    const inputMessage =
      typeof input === "string" ? input : JSON.stringify(input, null, 2);

    // Run agent
    const result = await agent.invoke({
      messages: [new HumanMessage(inputMessage)],
      context: context || {},
      toolResults: {},
    });

    // Extract final output
    const lastMessage = result.messages[result.messages.length - 1];
    const output =
      lastMessage instanceof AIMessage
        ? lastMessage.content
        : "No response generated";

    return {
      success: true,
      output,
      messages: result.messages,
    };
  } catch (error) {
    console.error(`Agent ${agentId} failed:`, error);
    return {
      success: false,
      output: { error: error instanceof Error ? error.message : "Unknown error" },
      messages: [],
    };
  }
}

/**
 * Multi-agent orchestration for complex tasks
 */
export async function runAgentChain(
  agents: string[],
  input: any,
  context?: Record<string, any>
): Promise<{
  success: boolean;
  outputs: Record<string, any>;
  finalOutput: any;
}> {
  const outputs: Record<string, any> = {};
  let currentInput = input;
  let currentContext = context || {};

  for (const agentId of agents) {
    const result = await runAgent(agentId, currentInput, currentContext);

    if (!result.success) {
      return {
        success: false,
        outputs,
        finalOutput: result.output,
      };
    }

    outputs[agentId] = result.output;
    currentInput = result.output;
    currentContext = { ...currentContext, [`${agentId}_result`]: result.output };
  }

  return {
    success: true,
    outputs,
    finalOutput: outputs[agents[agents.length - 1]],
  };
}
