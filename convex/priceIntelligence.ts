import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

// Record price history
export const recordPrice = mutation({
  args: {
    productId: v.id("products"),
    vendorId: v.id("vendors"),
    price: v.number(),
    pricePerUnit: v.number(),
    listPrice: v.number(),
    source: v.union(
      v.literal("catalog_sync"),
      v.literal("invoice"),
      v.literal("quote"),
      v.literal("manual")
    ),
  },
  handler: async (ctx, args) => {
    const priceHistoryId = await ctx.db.insert("priceHistory", {
      productId: args.productId,
      vendorId: args.vendorId,
      price: args.price,
      pricePerUnit: args.pricePerUnit,
      listPrice: args.listPrice,
      recordedAt: Date.now(),
      source: args.source,
    });
    return priceHistoryId;
  },
});

// Get price history for a product
export const getPriceHistory = query({
  args: {
    productId: v.id("products"),
    vendorId: v.optional(v.id("vendors")),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.days || 365;
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    let query = ctx.db
      .query("priceHistory")
      .withIndex("by_product", (q) =>
        q.eq("productId", args.productId).gt("recordedAt", since)
      );

    let results = await query.collect();

    if (args.vendorId) {
      results = results.filter((r) => r.vendorId === args.vendorId);
    }

    return results;
  },
});

// Store HMM price state prediction
export const storePriceState = mutation({
  args: {
    productId: v.id("products"),
    vendorId: v.optional(v.id("vendors")),
    state: v.union(
      v.literal("stable"),
      v.literal("rising"),
      v.literal("peak"),
      v.literal("declining"),
      v.literal("trough"),
      v.literal("volatile")
    ),
    stateProbability: v.number(),
    predictions: v.object({
      day7: v.object({ price: v.number(), confidence: v.number() }),
      day30: v.object({ price: v.number(), confidence: v.number() }),
      day90: v.object({ price: v.number(), confidence: v.number() }),
    }),
    observedEmissions: v.object({
      priceChange: v.number(),
      volumeIndicator: v.number(),
      seasonalIndicator: v.number(),
      newsIndicator: v.number(),
    }),
    recommendation: v.union(
      v.literal("buy_now"),
      v.literal("wait"),
      v.literal("urgent")
    ),
    waitUntil: v.optional(v.number()),
    expectedSavings: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const stateId = await ctx.db.insert("priceStateHistory", {
      ...args,
      calculatedAt: Date.now(),
    });
    return stateId;
  },
});

// Get latest price state for a product
export const getLatestPriceState = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("priceStateHistory")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .order("desc")
      .first();
  },
});

// Create price alert
export const createAlert = mutation({
  args: {
    universityId: v.id("universities"),
    userId: v.id("users"),
    productId: v.id("products"),
    alertType: v.union(
      v.literal("price_drop"),
      v.literal("price_increase"),
      v.literal("target_price"),
      v.literal("contract_violation"),
      v.literal("better_price_found")
    ),
    threshold: v.optional(v.number()),
    targetPrice: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const alertId = await ctx.db.insert("priceAlerts", {
      universityId: args.universityId,
      userId: args.userId,
      productId: args.productId,
      alertType: args.alertType,
      threshold: args.threshold,
      targetPrice: args.targetPrice,
      isActive: true,
      triggeredCount: 0,
      createdAt: Date.now(),
    });
    return alertId;
  },
});

// Trigger price alert notification
export const triggerAlert = mutation({
  args: {
    alertId: v.id("priceAlerts"),
    productId: v.id("products"),
    vendorId: v.id("vendors"),
    previousPrice: v.number(),
    currentPrice: v.number(),
    alertLevel: v.union(
      v.literal("critical"),
      v.literal("high"),
      v.literal("medium"),
      v.literal("low")
    ),
    message: v.string(),
    recommendedAction: v.string(),
    annualImpact: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const changePercent =
      ((args.currentPrice - args.previousPrice) / args.previousPrice) * 100;

    const notificationId = await ctx.db.insert("priceAlertNotifications", {
      alertId: args.alertId,
      productId: args.productId,
      vendorId: args.vendorId,
      previousPrice: args.previousPrice,
      currentPrice: args.currentPrice,
      changePercent,
      alertLevel: args.alertLevel,
      message: args.message,
      recommendedAction: args.recommendedAction,
      annualImpact: args.annualImpact,
      acknowledged: false,
      createdAt: Date.now(),
    });

    // Update alert trigger count
    const alert = await ctx.db.get(args.alertId);
    if (alert) {
      await ctx.db.patch(args.alertId, {
        lastTriggeredAt: Date.now(),
        triggeredCount: alert.triggeredCount + 1,
      });
    }

    return notificationId;
  },
});

// Get active alerts for user
export const getActiveAlerts = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("priceAlerts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

// Get unacknowledged notifications
export const getUnacknowledgedNotifications = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    return await ctx.db
      .query("priceAlertNotifications")
      .withIndex("by_acknowledged", (q) => q.eq("acknowledged", false))
      .order("desc")
      .take(limit);
  },
});

// Acknowledge notification
export const acknowledgeNotification = mutation({
  args: { notificationId: v.id("priceAlertNotifications") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.notificationId, {
      acknowledged: true,
      acknowledgedAt: Date.now(),
    });
    return args.notificationId;
  },
});

// Compare prices across vendors for a product
export const compareVendorPrices = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) return null;

    const listings = await ctx.db
      .query("vendorListings")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();

    const listingsWithVendors = await Promise.all(
      listings.map(async (listing) => {
        const vendor = await ctx.db.get(listing.vendorId);
        return { ...listing, vendor };
      })
    );

    // Sort by price per unit
    listingsWithVendors.sort((a, b) => a.pricePerUnit - b.pricePerUnit);

    const lowestPrice = listingsWithVendors[0]?.pricePerUnit || 0;
    const highestPrice =
      listingsWithVendors[listingsWithVendors.length - 1]?.pricePerUnit || 0;
    const priceSpread =
      lowestPrice > 0 ? ((highestPrice - lowestPrice) / lowestPrice) * 100 : 0;

    return {
      product,
      listings: listingsWithVendors,
      summary: {
        lowestPrice,
        highestPrice,
        priceSpread,
        vendorCount: listingsWithVendors.length,
        bestVendor: listingsWithVendors[0]?.vendor?.name,
      },
    };
  },
});

// Get price trend analysis
export const getPriceTrendAnalysis = query({
  args: {
    productId: v.id("products"),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.days || 90;
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    const priceHistory = await ctx.db
      .query("priceHistory")
      .withIndex("by_product", (q) =>
        q.eq("productId", args.productId).gt("recordedAt", since)
      )
      .collect();

    if (priceHistory.length === 0) {
      return null;
    }

    // Calculate statistics
    const prices = priceHistory.map((p) => p.pricePerUnit);
    const currentPrice = prices[prices.length - 1];
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    // Calculate trend (simple linear regression)
    const n = prices.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = prices.reduce((a, b) => a + b, 0);
    const sumXY = prices.reduce((sum, p, i) => sum + i * p, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const trend = slope > 0.01 ? "rising" : slope < -0.01 ? "falling" : "stable";

    return {
      productId: args.productId,
      period: { days, dataPoints: priceHistory.length },
      current: currentPrice,
      average: avgPrice,
      minimum: minPrice,
      maximum: maxPrice,
      percentFromMin: ((currentPrice - minPrice) / minPrice) * 100,
      percentFromMax: ((maxPrice - currentPrice) / maxPrice) * 100,
      trend,
      trendSlope: slope,
      priceHistory: priceHistory.map((p) => ({
        price: p.pricePerUnit,
        date: p.recordedAt,
      })),
    };
  },
});

// Record savings
export const recordSavings = mutation({
  args: {
    universityId: v.id("universities"),
    savingsType: v.union(
      v.literal("price_reduction"),
      v.literal("vendor_switch"),
      v.literal("contract_negotiation"),
      v.literal("demand_optimization"),
      v.literal("early_pay_discount"),
      v.literal("error_recovery"),
      v.literal("bundle_discount"),
      v.literal("timing_optimization")
    ),
    amount: v.number(),
    description: v.string(),
    agentId: v.string(),
    calculationMethod: v.string(),
    productId: v.optional(v.id("products")),
    vendorId: v.optional(v.id("vendors")),
    baselinePrice: v.optional(v.number()),
    achievedPrice: v.optional(v.number()),
    quantity: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const savingsId = await ctx.db.insert("savingsRecords", {
      universityId: args.universityId,
      savingsType: args.savingsType,
      amount: args.amount,
      verificationStatus: "calculated",
      description: args.description,
      agentId: args.agentId,
      calculationMethod: args.calculationMethod,
      productId: args.productId,
      vendorId: args.vendorId,
      baselinePrice: args.baselinePrice,
      achievedPrice: args.achievedPrice,
      quantity: args.quantity,
      recordedAt: Date.now(),
    });
    return savingsId;
  },
});

// Get savings summary
export const getSavingsSummary = query({
  args: {
    universityId: v.id("universities"),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const startDate = args.startDate || Date.now() - 365 * 24 * 60 * 60 * 1000;
    const endDate = args.endDate || Date.now();

    const savings = await ctx.db
      .query("savingsRecords")
      .withIndex("by_university", (q) => q.eq("universityId", args.universityId))
      .filter((q) =>
        q.and(
          q.gte(q.field("recordedAt"), startDate),
          q.lte(q.field("recordedAt"), endDate)
        )
      )
      .collect();

    // Group by type
    const byType: Record<string, { count: number; amount: number }> = {};
    for (const record of savings) {
      if (!byType[record.savingsType]) {
        byType[record.savingsType] = { count: 0, amount: 0 };
      }
      byType[record.savingsType].count++;
      byType[record.savingsType].amount += record.amount;
    }

    // Group by agent
    const byAgent: Record<string, { count: number; amount: number }> = {};
    for (const record of savings) {
      if (!byAgent[record.agentId]) {
        byAgent[record.agentId] = { count: 0, amount: 0 };
      }
      byAgent[record.agentId].count++;
      byAgent[record.agentId].amount += record.amount;
    }

    const total = savings.reduce((sum, r) => sum + r.amount, 0);
    const verified = savings
      .filter((r) => r.verificationStatus === "verified")
      .reduce((sum, r) => sum + r.amount, 0);

    return {
      totalSavings: total,
      verifiedSavings: verified,
      recordCount: savings.length,
      byType,
      byAgent,
      period: { startDate, endDate },
    };
  },
});
