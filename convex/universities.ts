import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create a new university
export const create = mutation({
  args: {
    name: v.string(),
    type: v.union(
      v.literal("R1"),
      v.literal("R2"),
      v.literal("liberal_arts"),
      v.literal("community")
    ),
    region: v.string(),
    annualSpend: v.number(),
    settings: v.optional(
      v.object({
        diversityTarget: v.number(),
        sustainabilityTarget: v.number(),
        autoApprovalLimit: v.number(),
        timezone: v.string(),
      })
    ),
    subscription: v.optional(
      v.object({
        plan: v.union(
          v.literal("flat"),
          v.literal("performance"),
          v.literal("hybrid"),
          v.literal("trial")
        ),
        monthlyFee: v.number(),
        savingsSharePercent: v.number(),
        startDate: v.number(),
        endDate: v.optional(v.number()),
        cap: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const universityId = await ctx.db.insert("universities", {
      name: args.name,
      type: args.type,
      region: args.region,
      annualSpend: args.annualSpend,
      settings: args.settings || {
        diversityTarget: 15,
        sustainabilityTarget: 10,
        autoApprovalLimit: 500,
        timezone: "America/New_York",
      },
      subscription: args.subscription || {
        plan: "trial",
        monthlyFee: 0,
        savingsSharePercent: 0,
        startDate: now,
        endDate: now + 45 * 24 * 60 * 60 * 1000, // 45 days
      },
      integrations: {},
      createdAt: now,
      updatedAt: now,
    });
    return universityId;
  },
});

// Get university by ID
export const get = query({
  args: { id: v.id("universities") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Get university by name
export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("universities")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
  },
});

// List all universities
export const list = query({
  args: {
    type: v.optional(
      v.union(
        v.literal("R1"),
        v.literal("R2"),
        v.literal("liberal_arts"),
        v.literal("community")
      )
    ),
    region: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("universities");

    if (args.type) {
      query = query.withIndex("by_type", (q) => q.eq("type", args.type!));
    }

    return await query.collect();
  },
});

// Update university
export const update = mutation({
  args: {
    id: v.id("universities"),
    name: v.optional(v.string()),
    annualSpend: v.optional(v.number()),
    settings: v.optional(
      v.object({
        diversityTarget: v.number(),
        sustainabilityTarget: v.number(),
        autoApprovalLimit: v.number(),
        timezone: v.string(),
      })
    ),
    integrations: v.optional(
      v.object({
        procurementSystem: v.optional(v.string()),
        erpSystem: v.optional(v.string()),
        slackWorkspace: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("University not found");

    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    await ctx.db.patch(id, {
      ...filteredUpdates,
      updatedAt: Date.now(),
    });
    return id;
  },
});

// Update subscription
export const updateSubscription = mutation({
  args: {
    id: v.id("universities"),
    plan: v.union(
      v.literal("flat"),
      v.literal("performance"),
      v.literal("hybrid"),
      v.literal("trial")
    ),
    monthlyFee: v.number(),
    savingsSharePercent: v.number(),
    startDate: v.number(),
    endDate: v.optional(v.number()),
    cap: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...subscription } = args;
    await ctx.db.patch(id, {
      subscription,
      updatedAt: Date.now(),
    });
    return id;
  },
});

// Get subscription pricing options
export const getPricingOptions = query({
  args: {},
  handler: async () => {
    return {
      flat: {
        name: "Flat Subscription",
        monthlyFee: 30000,
        annualFee: 360000,
        features: [
          "All 30 AI agents",
          "Unlimited users",
          "Full knowledge graph access",
          "Priority support",
          "Quarterly business reviews",
        ],
        bestFor: "Universities wanting predictable costs",
      },
      performance: {
        name: "Performance-Based",
        savingsSharePercent: 36,
        annualCap: 1500000,
        features: [
          "All features from Flat",
          "Third-party savings verification available",
          "Quarterly true-up billing",
          "Capped at $1.5M/year",
        ],
        bestFor: "Risk-averse procurement teams",
      },
      hybrid: {
        name: "Hybrid",
        monthlyFee: 15000,
        savingsSharePercent: 20,
        savingsThreshold: 1000000,
        annualCap: 1000000,
        features: [
          "Guaranteed base revenue",
          "Aligned incentives",
          "20% of savings above $1M threshold",
          "Capped at $1M/year total",
        ],
        bestFor: "Pilot programs expanding to full deployment",
      },
      trial: {
        name: "45-Day Free Trial",
        duration: 45,
        phases: [
          {
            name: "Discovery",
            weeks: "1-2",
            activities: [
              "Ingest top 10 vendor catalogs",
              "Connect to procurement system (read-only)",
              "Deploy 5 core agents",
              "Generate initial savings opportunity report",
            ],
            deliverable: "Here's $X million you're overpaying",
          },
          {
            name: "Activation",
            weeks: "3-4",
            activities: [
              "Enable price alerts",
              "Start invoice matching",
              "Deploy category agents for top 3 spend areas",
              "Real-time dashboard access",
            ],
            deliverable: "First verified savings captured",
          },
          {
            name: "Proof",
            weeks: "5-6",
            activities: [
              "Full savings report with verification",
              "Projected annual ROI model",
              "Knowledge graph demo",
              "Executive presentation",
            ],
            deliverable: "Business case for full deployment",
          },
        ],
        conversionTarget: 80,
        expectedSavings: { min: 200000, max: 500000 },
      },
    };
  },
});

// Get dashboard stats for a university
export const getDashboardStats = query({
  args: { universityId: v.id("universities") },
  handler: async (ctx, args) => {
    const university = await ctx.db.get(args.universityId);
    if (!university) throw new Error("University not found");

    // Get savings records
    const savingsRecords = await ctx.db
      .query("savingsRecords")
      .withIndex("by_university", (q) => q.eq("universityId", args.universityId))
      .collect();

    const totalSavings = savingsRecords.reduce((sum, r) => sum + r.amount, 0);
    const verifiedSavings = savingsRecords
      .filter((r) => r.verificationStatus === "verified")
      .reduce((sum, r) => sum + r.amount, 0);

    // Get pending requisitions
    const pendingRequisitions = await ctx.db
      .query("requisitions")
      .withIndex("by_university", (q) => q.eq("universityId", args.universityId))
      .filter((q) => q.eq(q.field("status"), "pending_approval"))
      .collect();

    // Get active alerts
    const activeAlerts = await ctx.db
      .query("priceAlertNotifications")
      .filter((q) => q.eq(q.field("acknowledged"), false))
      .collect();

    // Get anomalies
    const newAnomalies = await ctx.db
      .query("anomalyDetections")
      .withIndex("by_university", (q) => q.eq("universityId", args.universityId))
      .filter((q) => q.eq(q.field("status"), "new"))
      .collect();

    return {
      universityName: university.name,
      subscription: university.subscription,
      annualSpend: university.annualSpend,
      totalSavings,
      verifiedSavings,
      savingsPercent: (totalSavings / university.annualSpend) * 100,
      pendingRequisitions: pendingRequisitions.length,
      pendingApprovalValue: pendingRequisitions.reduce(
        (sum, r) => sum + r.totalAmount,
        0
      ),
      activeAlerts: activeAlerts.length,
      criticalAlerts: activeAlerts.filter((a) => a.alertLevel === "critical")
        .length,
      newAnomalies: newAnomalies.length,
      criticalAnomalies: newAnomalies.filter((a) => a.severity === "critical")
        .length,
    };
  },
});
