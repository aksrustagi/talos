import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppContext } from "../types/context";
import { agentRateLimiter } from "../middleware/rateLimiter";

export const agentRoutes = new Hono<AppContext>();

// Schemas
const invokeAgentSchema = z.object({
  input: z.any(),
  context: z
    .object({
      conversationId: z.string().optional(),
      additionalContext: z.record(z.any()).optional(),
    })
    .optional(),
  options: z
    .object({
      stream: z.boolean().default(false),
      timeout: z.number().default(60000),
      maxTokens: z.number().optional(),
    })
    .optional(),
});

// Apply rate limiting to all agent invocations
agentRoutes.use("/*/invoke", agentRateLimiter);

// GET /agents - List all agents
agentRoutes.get("/", async (c) => {
  const tier = c.req.query("tier");
  const activeOnly = c.req.query("activeOnly") !== "false";

  // TODO: Call Convex to list agents
  // const agents = await convex.query(api.agents.listAgents, { tier, activeOnly });

  return c.json({
    success: true,
    data: {
      tier1: {
        name: "Core Price Intelligence",
        agents: [
          {
            id: "price-watch",
            name: "PriceWatch Agent",
            description: "Real-time price monitoring and alerts",
            capabilities: ["price_monitoring", "alert_generation", "arbitrage_detection"],
            isActive: true,
          },
          {
            id: "catalog-sync",
            name: "Catalog Sync Agent",
            description: "Vendor catalog ingestion and normalization",
            capabilities: ["catalog_import", "product_matching", "sku_mapping"],
            isActive: true,
          },
          {
            id: "price-compare",
            name: "Price Compare Agent",
            description: "Cross-vendor price analysis",
            capabilities: ["vendor_comparison", "total_cost_analysis", "volume_optimization"],
            isActive: true,
          },
          {
            id: "knowledge-graph",
            name: "Knowledge Graph Builder",
            description: "Network price intelligence",
            capabilities: ["graph_building", "price_benchmarking", "pattern_detection"],
            isActive: true,
          },
          {
            id: "historical-price",
            name: "Historical Price Agent",
            description: "Price trend analysis and HMM predictions",
            capabilities: ["trend_analysis", "hmm_prediction", "timing_optimization"],
            isActive: true,
          },
          {
            id: "contract-validator",
            name: "Contract Price Validator",
            description: "Invoice validation and overcharge recovery",
            capabilities: ["invoice_matching", "overcharge_detection", "dispute_generation"],
            isActive: true,
          },
        ],
      },
      tier2: {
        name: "Procurement Process",
        agents: [
          {
            id: "requisition",
            name: "Requisition Agent",
            description: "Natural language purchase request processing",
            capabilities: ["nl_parsing", "product_matching", "budget_validation"],
            isActive: true,
          },
          {
            id: "approval-workflow",
            name: "Approval Workflow Agent",
            description: "Intelligent approval routing and escalation",
            capabilities: ["routing", "escalation", "delegation"],
            isActive: true,
          },
          {
            id: "vendor-selection",
            name: "Vendor Selection Agent",
            description: "Optimal vendor recommendation",
            capabilities: ["vendor_scoring", "diversity_matching", "risk_assessment"],
            isActive: true,
          },
          {
            id: "rfq-rfp",
            name: "RFQ/RFP Agent",
            description: "Competitive bidding automation",
            capabilities: ["rfq_generation", "response_collection", "bid_comparison"],
            isActive: true,
          },
          {
            id: "po-generation",
            name: "PO Generation Agent",
            description: "Purchase order creation and transmission",
            capabilities: ["po_creation", "gl_coding", "vendor_transmission"],
            isActive: true,
          },
          {
            id: "invoice-matching",
            name: "Invoice Matching Agent",
            description: "Three-way match automation",
            capabilities: ["ocr_ingestion", "matching", "exception_routing"],
            isActive: true,
          },
          {
            id: "receipt-delivery",
            name: "Receipt & Delivery Agent",
            description: "Shipment tracking and receiving",
            capabilities: ["tracking", "delivery_confirmation", "return_handling"],
            isActive: true,
          },
          {
            id: "payment-optimizer",
            name: "Payment Optimization Agent",
            description: "Payment timing and discount capture",
            capabilities: ["discount_optimization", "cash_flow_forecasting", "payment_scheduling"],
            isActive: true,
          },
        ],
      },
      tier3: {
        name: "Category Specialists",
        agents: [
          {
            id: "lab-supply",
            name: "Lab Supply Agent",
            description: "Scientific procurement expertise",
            capabilities: ["grant_compliance", "chemical_safety", "protocol_matching"],
            isActive: true,
          },
          {
            id: "it-equipment",
            name: "IT Equipment Agent",
            description: "Technology procurement",
            capabilities: ["spec_matching", "lifecycle_management", "security_compliance"],
            isActive: true,
          },
          {
            id: "office-supply",
            name: "Office Supply Agent",
            description: "Administrative supplies optimization",
            capabilities: ["demand_forecasting", "consolidation", "sustainability"],
            isActive: true,
          },
          {
            id: "furniture",
            name: "Furniture Agent",
            description: "Furniture and facilities procurement",
            capabilities: ["space_planning", "ergonomics", "sustainability"],
            isActive: true,
          },
          {
            id: "facilities",
            name: "Facilities Agent",
            description: "Building and maintenance procurement",
            capabilities: ["service_contracts", "emergency_procurement", "compliance"],
            isActive: true,
          },
          {
            id: "marketing",
            name: "Marketing & Events Agent",
            description: "Promotional and event procurement",
            capabilities: ["vendor_sourcing", "brand_compliance", "budget_tracking"],
            isActive: true,
          },
          {
            id: "travel",
            name: "Travel & Conference Agent",
            description: "Travel and event procurement",
            capabilities: ["policy_compliance", "booking_optimization", "expense_tracking"],
            isActive: true,
          },
          {
            id: "professional-services",
            name: "Professional Services Agent",
            description: "Consulting and services procurement",
            capabilities: ["sow_review", "rate_benchmarking", "contract_negotiation"],
            isActive: true,
          },
        ],
      },
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
      totalAgents: 22,
      activeAgents: 22,
    },
  });
});

// GET /agents/:agentId - Get agent details
agentRoutes.get("/:agentId", async (c) => {
  const agentId = c.req.param("agentId");

  // TODO: Call Convex to get agent
  // const agent = await convex.query(api.agents.getAgent, { agentId });

  return c.json({
    success: true,
    data: {
      id: agentId,
      name: "PriceWatch Agent",
      tier: 1,
      category: "Core Price Intelligence",
      description: "Real-time procurement price monitoring",
      capabilities: [
        "Monitor price changes across vendor catalogs",
        "Detect significant price movements",
        "Identify arbitrage opportunities",
        "Track contract price compliance",
        "Generate price intelligence reports",
      ],
      tools: [
        "get_product_prices",
        "compare_vendors",
        "get_price_history",
        "create_alert",
        "send_notification",
      ],
      configuration: {
        model: "claude-3-5-sonnet-20241022",
        temperature: 0.3,
        maxTokens: 4096,
        timeout: 60000,
      },
      integrations: ["slack", "email", "convex"],
      metrics: {
        executionsLast30Days: 4521,
        successRate: 0.98,
        avgResponseTime: 2340,
        savingsGenerated: 450000,
      },
      isActive: true,
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// POST /agents/:agentId/invoke - Invoke an agent
agentRoutes.post(
  "/:agentId/invoke",
  zValidator("json", invokeAgentSchema),
  async (c) => {
    const agentId = c.req.param("agentId");
    const { input, context, options } = c.req.valid("json");
    const user = c.get("user");

    // TODO: Start agent execution via Temporal/LangGraph
    // const executionId = await temporalClient.start(agentWorkflow, {
    //   args: [{ agentId, input, context, options }],
    //   taskQueue: "procurement-agents",
    //   workflowId: `agent-${agentId}-${Date.now()}`,
    // });

    const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // If streaming is requested, return a streaming response
    if (options?.stream) {
      return c.json({
        success: true,
        data: {
          executionId,
          agentId,
          status: "streaming",
          streamUrl: `/api/v1/agents/${agentId}/executions/${executionId}/stream`,
        },
        meta: {
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Simulate agent response
    return c.json({
      success: true,
      data: {
        executionId,
        agentId,
        status: "completed",
        output: {
          message: `Agent ${agentId} processed your request`,
          results: [],
          recommendations: [],
        },
        metrics: {
          durationMs: 2340,
          tokensUsed: 1250,
        },
      },
      meta: {
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
      },
    });
  }
);

// GET /agents/:agentId/executions - Get recent executions
agentRoutes.get("/:agentId/executions", async (c) => {
  const agentId = c.req.param("agentId");
  const limit = parseInt(c.req.query("limit") || "20");

  // TODO: Call Convex to get executions
  // const executions = await convex.query(api.agents.getRecentExecutions, { agentId, limit });

  return c.json({
    success: true,
    data: [
      {
        executionId: "exec_001",
        status: "completed",
        executionType: "user_request",
        input: { query: "Find price changes this week" },
        startedAt: "2025-01-15T14:00:00Z",
        completedAt: "2025-01-15T14:00:03Z",
        durationMs: 2850,
        tokensUsed: 1450,
      },
      {
        executionId: "exec_002",
        status: "completed",
        executionType: "scheduled",
        input: { task: "daily_price_scan" },
        startedAt: "2025-01-15T06:00:00Z",
        completedAt: "2025-01-15T06:05:23Z",
        durationMs: 323000,
        tokensUsed: 45000,
      },
    ],
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
      pagination: {
        total: 2,
        limit,
        offset: 0,
        hasMore: false,
      },
    },
  });
});

// GET /agents/:agentId/executions/:executionId - Get execution details
agentRoutes.get("/:agentId/executions/:executionId", async (c) => {
  const agentId = c.req.param("agentId");
  const executionId = c.req.param("executionId");

  // TODO: Call Convex to get execution with messages
  // const execution = await convex.query(api.agents.getExecutionWithMessages, { executionId });

  return c.json({
    success: true,
    data: {
      executionId,
      agentId,
      status: "completed",
      executionType: "user_request",
      input: { query: "Find price changes this week" },
      output: {
        priceChanges: [
          {
            product: "50ml Conical Tubes",
            vendor: "Fisher",
            previousPrice: 0.42,
            currentPrice: 0.47,
            changePercent: 11.9,
            annualImpact: 600,
          },
        ],
        summary: "Found 5 significant price changes this week",
        recommendations: ["Consider switching tubes to VWR"],
      },
      messages: [
        {
          role: "system",
          content: "You are the PriceWatch Agent...",
          timestamp: "2025-01-15T14:00:00Z",
        },
        {
          role: "user",
          content: "Find price changes this week",
          timestamp: "2025-01-15T14:00:01Z",
        },
        {
          role: "assistant",
          content: "I'll analyze price changes from the past 7 days...",
          toolCalls: [
            {
              id: "call_001",
              name: "get_price_history",
              arguments: { days: 7, significantOnly: true },
            },
          ],
          timestamp: "2025-01-15T14:00:02Z",
        },
        {
          role: "assistant",
          content: "Here are the top 5 price changes this week...",
          timestamp: "2025-01-15T14:00:03Z",
        },
      ],
      metrics: {
        durationMs: 2850,
        tokensUsed: 1450,
        toolCalls: 2,
      },
      startedAt: "2025-01-15T14:00:00Z",
      completedAt: "2025-01-15T14:00:03Z",
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// GET /agents/:agentId/metrics - Get agent performance metrics
agentRoutes.get("/:agentId/metrics", async (c) => {
  const agentId = c.req.param("agentId");
  const days = parseInt(c.req.query("days") || "30");

  // TODO: Call Convex to get metrics
  // const metrics = await convex.query(api.agents.getAgentMetrics, { agentId, days });

  return c.json({
    success: true,
    data: {
      agentId,
      period: { days },
      totalExecutions: 4521,
      completedExecutions: 4432,
      failedExecutions: 89,
      successRate: 0.98,
      averageDurationMs: 2340,
      totalTokensUsed: 5670000,
      executionsByType: {
        scheduled: 3200,
        triggered: 890,
        user_request: 431,
      },
      performanceTrend: [
        { date: "2025-01-08", executions: 145, successRate: 0.97, avgDuration: 2450 },
        { date: "2025-01-09", executions: 152, successRate: 0.98, avgDuration: 2380 },
        { date: "2025-01-10", executions: 148, successRate: 0.99, avgDuration: 2290 },
        { date: "2025-01-11", executions: 143, successRate: 0.98, avgDuration: 2340 },
        { date: "2025-01-12", executions: 155, successRate: 0.97, avgDuration: 2410 },
        { date: "2025-01-13", executions: 149, successRate: 0.98, avgDuration: 2350 },
        { date: "2025-01-14", executions: 151, successRate: 0.98, avgDuration: 2320 },
      ],
      savingsAttributed: 450000,
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// PUT /agents/:agentId/status - Toggle agent status
agentRoutes.put("/:agentId/status", async (c) => {
  const agentId = c.req.param("agentId");
  const body = await c.req.json();
  const { isActive } = body;

  // TODO: Call Convex to toggle status
  // await convex.mutation(api.agents.toggleAgentStatus, { agentId, isActive });

  return c.json({
    success: true,
    data: {
      agentId,
      isActive,
      updatedAt: new Date().toISOString(),
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// GET /agents/metrics/summary - Get all agents metrics summary
agentRoutes.get("/metrics/summary", async (c) => {
  const user = c.get("user");

  // TODO: Call Convex to get all agent metrics
  // const metrics = await convex.query(api.agents.getAllAgentMetrics, { universityId: user.universityId });

  return c.json({
    success: true,
    data: {
      totalAgents: 22,
      activeAgents: 22,
      executionsToday: 4521,
      executionsThisMonth: 125000,
      totalSavingsThisMonth: 125000,
      topPerformingAgents: [
        { id: "price-watch", name: "PriceWatch Agent", savings: 45000, executions: 4521 },
        { id: "contract-validator", name: "Contract Validator", savings: 32000, executions: 2340 },
        { id: "vendor-selection", name: "Vendor Selection", savings: 28000, executions: 890 },
      ],
      alertsByAgent: {
        "price-watch": 23,
        "contract-validator": 12,
        "invoice-matching": 8,
      },
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});
