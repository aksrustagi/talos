import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

// Register an agent configuration
export const registerAgent = mutation({
  args: {
    agentId: v.string(),
    name: v.string(),
    tier: v.union(v.literal(1), v.literal(2), v.literal(3)),
    category: v.string(),
    description: v.string(),
    systemPrompt: v.string(),
    capabilities: v.array(v.string()),
    tools: v.array(v.string()),
    configuration: v.object({
      model: v.string(),
      temperature: v.number(),
      maxTokens: v.number(),
      timeout: v.number(),
    }),
    integrations: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if agent already exists
    const existing = await ctx.db
      .query("agentConfigurations")
      .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: now,
      });
      return existing._id;
    }

    const agentConfigId = await ctx.db.insert("agentConfigurations", {
      ...args,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return agentConfigId;
  },
});

// Get agent configuration
export const getAgent = query({
  args: { agentId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentConfigurations")
      .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
      .first();
  },
});

// List all agents
export const listAgents = query({
  args: {
    tier: v.optional(v.union(v.literal(1), v.literal(2), v.literal(3))),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let results = await ctx.db.query("agentConfigurations").collect();

    if (args.tier) {
      results = results.filter((a) => a.tier === args.tier);
    }

    if (args.activeOnly) {
      results = results.filter((a) => a.isActive);
    }

    return results;
  },
});

// Toggle agent active status
export const toggleAgentStatus = mutation({
  args: {
    agentId: v.string(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agentConfigurations")
      .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
      .first();

    if (!agent) throw new Error("Agent not found");

    await ctx.db.patch(agent._id, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });

    return agent._id;
  },
});

// Start an agent execution
export const startExecution = mutation({
  args: {
    agentId: v.string(),
    universityId: v.id("universities"),
    userId: v.optional(v.id("users")),
    executionType: v.union(
      v.literal("scheduled"),
      v.literal("triggered"),
      v.literal("user_request"),
      v.literal("agent_chain")
    ),
    input: v.any(),
    workflowId: v.optional(v.string()),
    parentExecutionId: v.optional(v.id("agentExecutions")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const executionId = await ctx.db.insert("agentExecutions", {
      agentId: args.agentId,
      universityId: args.universityId,
      userId: args.userId,
      executionType: args.executionType,
      input: args.input,
      output: null,
      status: "running",
      durationMs: 0,
      workflowId: args.workflowId,
      parentExecutionId: args.parentExecutionId,
      startedAt: now,
    });

    return executionId;
  },
});

// Complete an agent execution
export const completeExecution = mutation({
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
  },
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution) throw new Error("Execution not found");

    const now = Date.now();
    const durationMs = now - execution.startedAt;

    await ctx.db.patch(args.executionId, {
      output: args.output,
      status: args.status,
      error: args.error,
      tokensUsed: args.tokensUsed,
      durationMs,
      completedAt: now,
    });

    return args.executionId;
  },
});

// Add message to execution
export const addMessage = mutation({
  args: {
    executionId: v.id("agentExecutions"),
    role: v.union(v.literal("system"), v.literal("user"), v.literal("assistant")),
    content: v.string(),
    toolCalls: v.optional(v.array(v.any())),
    toolResults: v.optional(v.array(v.any())),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const messageId = await ctx.db.insert("agentMessages", {
      executionId: args.executionId,
      role: args.role,
      content: args.content,
      toolCalls: args.toolCalls,
      toolResults: args.toolResults,
      metadata: args.metadata,
      createdAt: Date.now(),
    });
    return messageId;
  },
});

// Get execution with messages
export const getExecutionWithMessages = query({
  args: { executionId: v.id("agentExecutions") },
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution) return null;

    const messages = await ctx.db
      .query("agentMessages")
      .withIndex("by_execution", (q) => q.eq("executionId", args.executionId))
      .collect();

    const agent = await ctx.db
      .query("agentConfigurations")
      .withIndex("by_agent_id", (q) => q.eq("agentId", execution.agentId))
      .first();

    return { ...execution, messages, agent };
  },
});

// Get recent executions for an agent
export const getRecentExecutions = query({
  args: {
    agentId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;
    return await ctx.db
      .query("agentExecutions")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(limit);
  },
});

// Get agent performance metrics
export const getAgentMetrics = query({
  args: {
    agentId: v.string(),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.days || 30;
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    const executions = await ctx.db
      .query("agentExecutions")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .filter((q) => q.gt(q.field("startedAt"), since))
      .collect();

    const completed = executions.filter((e) => e.status === "completed");
    const failed = executions.filter((e) => e.status === "failed");

    const totalTokens = executions.reduce(
      (sum, e) => sum + (e.tokensUsed || 0),
      0
    );
    const avgDuration =
      completed.length > 0
        ? completed.reduce((sum, e) => sum + e.durationMs, 0) / completed.length
        : 0;

    return {
      agentId: args.agentId,
      period: { days, since },
      totalExecutions: executions.length,
      completedExecutions: completed.length,
      failedExecutions: failed.length,
      successRate:
        executions.length > 0 ? completed.length / executions.length : 0,
      averageDurationMs: avgDuration,
      totalTokensUsed: totalTokens,
      executionsByType: executions.reduce(
        (acc, e) => {
          acc[e.executionType] = (acc[e.executionType] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    };
  },
});

// Get all agent metrics summary
export const getAllAgentMetrics = query({
  args: { universityId: v.id("universities") },
  handler: async (ctx, args) => {
    const agents = await ctx.db
      .query("agentConfigurations")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const metrics = await Promise.all(
      agents.map(async (agent) => {
        const executions = await ctx.db
          .query("agentExecutions")
          .withIndex("by_agent", (q) => q.eq("agentId", agent.agentId))
          .filter((q) =>
            q.and(
              q.gt(q.field("startedAt"), since),
              q.eq(q.field("universityId"), args.universityId)
            )
          )
          .collect();

        const completed = executions.filter((e) => e.status === "completed");

        return {
          agentId: agent.agentId,
          name: agent.name,
          tier: agent.tier,
          category: agent.category,
          totalExecutions: executions.length,
          successRate:
            executions.length > 0 ? completed.length / executions.length : 1,
          isActive: agent.isActive,
        };
      })
    );

    return metrics;
  },
});
