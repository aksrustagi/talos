/**
 * Convex AI Agent Functions
 *
 * These functions run AI agents directly within Convex using actions.
 * They integrate with the Convex database for seamless data access.
 */

import { v } from "convex/values";
import { action, internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// Agent execution action
export const executeAgent = action({
  args: {
    agentId: v.string(),
    universityId: v.id("universities"),
    userId: v.optional(v.id("users")),
    input: v.any(),
    options: v.optional(
      v.object({
        timeout: v.optional(v.number()),
        maxTokens: v.optional(v.number()),
        stream: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();

    // Record execution start
    const executionId = await ctx.runMutation(internal.aiAgents.startExecution, {
      agentId: args.agentId,
      universityId: args.universityId,
      userId: args.userId,
      input: args.input,
    });

    try {
      // Get agent configuration
      const agentConfig = await ctx.runQuery(internal.aiAgents.getAgentConfig, {
        agentId: args.agentId,
      });

      if (!agentConfig) {
        throw new Error(`Agent ${args.agentId} not found`);
      }

      // Prepare context for agent
      const agentContext = await ctx.runQuery(internal.aiAgents.prepareContext, {
        universityId: args.universityId,
        agentId: args.agentId,
        input: args.input,
      });

      // Call external AI service (Anthropic)
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: agentConfig.model || "claude-3-5-sonnet-20241022",
          max_tokens: args.options?.maxTokens || agentConfig.maxTokens || 4096,
          system: agentConfig.systemPrompt,
          messages: [
            {
              role: "user",
              content: `Context:\n${JSON.stringify(agentContext, null, 2)}\n\nRequest:\n${JSON.stringify(args.input, null, 2)}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`AI service error: ${response.statusText}`);
      }

      const result = await response.json();
      const output = result.content?.[0]?.text || "";
      const tokensUsed =
        (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0);

      // Parse output if JSON
      let parsedOutput;
      try {
        const jsonMatch = output.match(/```json\n?([\s\S]*?)\n?```/);
        parsedOutput = jsonMatch
          ? JSON.parse(jsonMatch[1])
          : { message: output };
      } catch {
        parsedOutput = { message: output };
      }

      // Record execution completion
      await ctx.runMutation(internal.aiAgents.completeExecution, {
        executionId,
        output: parsedOutput,
        status: "completed",
        tokensUsed,
        durationMs: Date.now() - startTime,
      });

      // Process any actions from the agent output
      if (parsedOutput.actions) {
        await ctx.runAction(internal.aiAgents.processAgentActions, {
          executionId,
          universityId: args.universityId,
          actions: parsedOutput.actions,
        });
      }

      return {
        executionId,
        status: "completed",
        output: parsedOutput,
        tokensUsed,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      // Record execution failure
      await ctx.runMutation(internal.aiAgents.completeExecution, {
        executionId,
        output: { error: error instanceof Error ? error.message : "Unknown error" },
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        durationMs: Date.now() - startTime,
      });

      throw error;
    }
  },
});

// Internal mutation to start execution
export const startExecution = internalMutation({
  args: {
    agentId: v.string(),
    universityId: v.id("universities"),
    userId: v.optional(v.id("users")),
    input: v.any(),
  },
  handler: async (ctx, args) => {
    const executionId = await ctx.db.insert("agentExecutions", {
      agentId: args.agentId,
      universityId: args.universityId,
      userId: args.userId,
      executionType: "user_request",
      input: args.input,
      output: null,
      status: "running",
      durationMs: 0,
      startedAt: Date.now(),
    });
    return executionId;
  },
});

// Internal mutation to complete execution
export const completeExecution = internalMutation({
  args: {
    executionId: v.id("agentExecutions"),
    output: v.any(),
    status: v.union(
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    error: v.optional(v.string()),
    tokensUsed: v.optional(v.number()),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.executionId, {
      output: args.output,
      status: args.status,
      error: args.error,
      tokensUsed: args.tokensUsed,
      durationMs: args.durationMs || 0,
      completedAt: Date.now(),
    });
  },
});

// Internal query to get agent config
export const getAgentConfig = internalMutation({
  args: { agentId: v.string() },
  handler: async (ctx, args) => {
    const config = await ctx.db
      .query("agentConfigurations")
      .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
      .first();

    if (!config) {
      // Return default config for known agents
      return getDefaultAgentConfig(args.agentId);
    }

    return {
      model: config.configuration.model,
      maxTokens: config.configuration.maxTokens,
      systemPrompt: config.systemPrompt,
      tools: config.tools,
    };
  },
});

// Internal query to prepare context
export const prepareContext = internalMutation({
  args: {
    universityId: v.id("universities"),
    agentId: v.string(),
    input: v.any(),
  },
  handler: async (ctx, args) => {
    // Get university info
    const university = await ctx.db.get(args.universityId);

    // Build context based on agent type
    const context: Record<string, any> = {
      university: university
        ? {
            name: university.name,
            type: university.type,
            settings: university.settings,
          }
        : null,
      timestamp: new Date().toISOString(),
    };

    // Add agent-specific context
    switch (args.agentId) {
      case "price-watch":
      case "price-compare":
        // Add recent price data
        const recentPrices = await ctx.db
          .query("priceHistory")
          .order("desc")
          .take(100);
        context.recentPriceChanges = recentPrices.length;
        break;

      case "requisition":
        // Add budget info if budget code in input
        if (args.input?.budgetCode) {
          const budget = await ctx.db
            .query("budgets")
            .withIndex("by_code", (q) => q.eq("budgetCode", args.input.budgetCode))
            .first();
          context.budget = budget;
        }
        break;

      case "contract-validator":
        // Add active contracts
        const contracts = await ctx.db
          .query("contracts")
          .withIndex("by_university", (q) => q.eq("universityId", args.universityId))
          .filter((q) => q.eq(q.field("status"), "active"))
          .take(50);
        context.activeContracts = contracts.length;
        break;
    }

    return context;
  },
});

// Internal action to process agent actions
export const processAgentActions = internalAction({
  args: {
    executionId: v.id("agentExecutions"),
    universityId: v.id("universities"),
    actions: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    for (const action of args.actions) {
      switch (action.type) {
        case "create_alert":
          await ctx.runMutation(internal.aiAgents.createPriceAlert, {
            universityId: args.universityId,
            ...action.data,
          });
          break;

        case "record_savings":
          await ctx.runMutation(internal.aiAgents.recordSavings, {
            universityId: args.universityId,
            executionId: args.executionId,
            ...action.data,
          });
          break;

        case "send_notification":
          // Would integrate with notification system
          console.log("Notification:", action.data);
          break;
      }
    }
  },
});

// Internal mutation to create price alert
export const createPriceAlert = internalMutation({
  args: {
    universityId: v.id("universities"),
    productId: v.id("products"),
    userId: v.id("users"),
    alertType: v.string(),
    targetPrice: v.optional(v.number()),
    threshold: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("priceAlerts", {
      universityId: args.universityId,
      productId: args.productId,
      userId: args.userId,
      alertType: args.alertType as any,
      targetPrice: args.targetPrice,
      threshold: args.threshold,
      isActive: true,
      triggeredCount: 0,
      createdAt: Date.now(),
    });
  },
});

// Internal mutation to record savings
export const recordSavings = internalMutation({
  args: {
    universityId: v.id("universities"),
    executionId: v.id("agentExecutions"),
    savingsType: v.string(),
    amount: v.number(),
    description: v.string(),
    calculationMethod: v.string(),
  },
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);

    await ctx.db.insert("savingsRecords", {
      universityId: args.universityId,
      savingsType: args.savingsType as any,
      amount: args.amount,
      verificationStatus: "calculated",
      description: args.description,
      agentId: execution?.agentId || "unknown",
      calculationMethod: args.calculationMethod,
      recordedAt: Date.now(),
    });
  },
});

// Helper function for default agent configs
function getDefaultAgentConfig(agentId: string) {
  const configs: Record<string, any> = {
    "price-watch": {
      model: "claude-3-5-sonnet-20241022",
      maxTokens: 4096,
      systemPrompt:
        "You are the PriceWatch Agent. Monitor prices, detect changes, and generate alerts.",
      tools: ["get_prices", "create_alert", "compare_vendors"],
    },
    "price-compare": {
      model: "claude-3-5-sonnet-20241022",
      maxTokens: 4096,
      systemPrompt:
        "You are the Price Compare Agent. Compare prices across vendors.",
      tools: ["compare_prices", "get_contracts", "calculate_savings"],
    },
    requisition: {
      model: "claude-3-5-sonnet-20241022",
      maxTokens: 4096,
      systemPrompt:
        "You are the Requisition Agent. Process purchase requests.",
      tools: ["search_products", "check_budget", "create_requisition"],
    },
    "contract-validator": {
      model: "claude-3-5-sonnet-20241022",
      maxTokens: 4096,
      systemPrompt:
        "You are the Contract Validator Agent. Validate invoices against contracts.",
      tools: ["validate_invoice", "check_contract", "generate_dispute"],
    },
  };

  return (
    configs[agentId] || {
      model: "claude-3-5-sonnet-20241022",
      maxTokens: 4096,
      systemPrompt: `You are a procurement AI agent (${agentId}).`,
      tools: [],
    }
  );
}

// Scheduled price monitoring action
export const scheduledPriceMonitor = internalAction({
  args: {},
  handler: async (ctx) => {
    // Get all active universities
    const universities = await ctx.runQuery(internal.aiAgents.getActiveUniversities, {});

    for (const university of universities) {
      // Run price watch for each university
      await ctx.runAction(internal.aiAgents.executeAgent as any, {
        agentId: "price-watch",
        universityId: university._id,
        input: { mode: "scheduled_scan" },
      });
    }
  },
});

// Internal query to get active universities
export const getActiveUniversities = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("universities")
      .filter((q) =>
        q.or(
          q.eq(q.field("subscription.plan"), "flat"),
          q.eq(q.field("subscription.plan"), "performance"),
          q.eq(q.field("subscription.plan"), "hybrid"),
          q.eq(q.field("subscription.plan"), "trial")
        )
      )
      .collect();
  },
});
