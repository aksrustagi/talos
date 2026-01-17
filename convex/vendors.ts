import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create vendor
export const create = mutation({
  args: {
    name: v.string(),
    code: v.string(),
    type: v.union(
      v.literal("distributor"),
      v.literal("manufacturer"),
      v.literal("reseller")
    ),
    categories: v.array(v.string()),
    diversityStatus: v.optional(
      v.array(
        v.union(
          v.literal("MWBE"),
          v.literal("WBE"),
          v.literal("MBE"),
          v.literal("SBE"),
          v.literal("SDVOSB"),
          v.literal("HUBZone"),
          v.literal("LGBT")
        )
      )
    ),
    contact: v.object({
      email: v.string(),
      phone: v.optional(v.string()),
      accountRep: v.optional(v.string()),
      address: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const vendorId = await ctx.db.insert("vendors", {
      name: args.name,
      code: args.code,
      type: args.type,
      categories: args.categories,
      diversityStatus: args.diversityStatus || [],
      certifications: [],
      sustainability: {
        rating: undefined,
        certifications: [],
      },
      contact: args.contact,
      integration: {
        type: "manual",
        syncStatus: "pending",
      },
      performance: {
        overallScore: 80,
        priceScore: 80,
        qualityScore: 80,
        deliveryScore: 80,
        serviceScore: 80,
        complianceScore: 80,
        onTimeRate: 0.95,
        defectRate: 0.01,
        invoiceAccuracy: 0.98,
      },
      riskScore: 20,
      riskFactors: [],
      createdAt: now,
      updatedAt: now,
    });

    return vendorId;
  },
});

// Get vendor by ID
export const get = query({
  args: { id: v.id("vendors") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Get vendor by code
export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("vendors")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
  },
});

// List all vendors
export const list = query({
  args: {
    type: v.optional(
      v.union(
        v.literal("distributor"),
        v.literal("manufacturer"),
        v.literal("reseller")
      )
    ),
    category: v.optional(v.string()),
    diverseOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let results = await ctx.db.query("vendors").collect();

    if (args.type) {
      results = results.filter((v) => v.type === args.type);
    }

    if (args.category) {
      results = results.filter((v) => v.categories.includes(args.category!));
    }

    if (args.diverseOnly) {
      results = results.filter((v) => v.diversityStatus.length > 0);
    }

    return results;
  },
});

// Update vendor performance
export const updatePerformance = mutation({
  args: {
    vendorId: v.id("vendors"),
    performance: v.object({
      overallScore: v.number(),
      priceScore: v.number(),
      qualityScore: v.number(),
      deliveryScore: v.number(),
      serviceScore: v.number(),
      complianceScore: v.number(),
      onTimeRate: v.number(),
      defectRate: v.number(),
      invoiceAccuracy: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.vendorId, {
      performance: args.performance,
      updatedAt: Date.now(),
    });
    return args.vendorId;
  },
});

// Update vendor risk assessment
export const updateRisk = mutation({
  args: {
    vendorId: v.id("vendors"),
    riskScore: v.number(),
    riskFactors: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.vendorId, {
      riskScore: args.riskScore,
      riskFactors: args.riskFactors,
      updatedAt: Date.now(),
    });
    return args.vendorId;
  },
});

// Update vendor integration settings
export const updateIntegration = mutation({
  args: {
    vendorId: v.id("vendors"),
    type: v.union(
      v.literal("api"),
      v.literal("cxml"),
      v.literal("edi"),
      v.literal("manual")
    ),
    endpoint: v.optional(v.string()),
    credentials: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new Error("Vendor not found");

    await ctx.db.patch(args.vendorId, {
      integration: {
        ...vendor.integration,
        type: args.type,
        endpoint: args.endpoint,
        credentials: args.credentials,
      },
      updatedAt: Date.now(),
    });
    return args.vendorId;
  },
});

// Get vendor with contract info for a university
export const getWithContract = query({
  args: {
    vendorId: v.id("vendors"),
    universityId: v.id("universities"),
  },
  handler: async (ctx, args) => {
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) return null;

    const contracts = await ctx.db
      .query("contracts")
      .withIndex("by_vendor", (q) => q.eq("vendorId", args.vendorId))
      .filter((q) =>
        q.and(
          q.eq(q.field("universityId"), args.universityId),
          q.eq(q.field("status"), "active")
        )
      )
      .collect();

    return { ...vendor, contracts };
  },
});

// Get vendor scorecard
export const getScorecard = query({
  args: { vendorId: v.id("vendors") },
  handler: async (ctx, args) => {
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) return null;

    // Get recent orders
    const recentOrders = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_vendor", (q) => q.eq("vendorId", args.vendorId))
      .order("desc")
      .take(100);

    // Get recent invoices
    const recentInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_vendor", (q) => q.eq("vendorId", args.vendorId))
      .order("desc")
      .take(100);

    // Calculate metrics
    const totalOrders = recentOrders.length;
    const totalSpend = recentOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const onTimeOrders = recentOrders.filter(
      (o) => o.status === "received" || o.status === "closed"
    ).length;

    const invoiceExceptions = recentInvoices.filter(
      (i) => i.status === "exception" || i.status === "disputed"
    ).length;

    // Get risk assessment
    const riskAssessment = await ctx.db
      .query("supplierRiskAssessments")
      .withIndex("by_vendor", (q) => q.eq("vendorId", args.vendorId))
      .order("desc")
      .first();

    return {
      vendor,
      metrics: {
        totalOrders,
        totalSpend,
        onTimeRate: totalOrders > 0 ? onTimeOrders / totalOrders : 0,
        invoiceExceptionRate:
          recentInvoices.length > 0
            ? invoiceExceptions / recentInvoices.length
            : 0,
      },
      performance: vendor.performance,
      riskAssessment,
    };
  },
});

// Search diverse suppliers
export const searchDiverse = query({
  args: {
    category: v.optional(v.string()),
    diversityTypes: v.optional(
      v.array(
        v.union(
          v.literal("MWBE"),
          v.literal("WBE"),
          v.literal("MBE"),
          v.literal("SBE"),
          v.literal("SDVOSB"),
          v.literal("HUBZone"),
          v.literal("LGBT")
        )
      )
    ),
  },
  handler: async (ctx, args) => {
    let vendors = await ctx.db
      .query("vendors")
      .filter((q) => q.gt(q.field("diversityStatus"), []))
      .collect();

    if (args.category) {
      vendors = vendors.filter((v) => v.categories.includes(args.category!));
    }

    if (args.diversityTypes && args.diversityTypes.length > 0) {
      vendors = vendors.filter((v) =>
        v.diversityStatus.some((d) => args.diversityTypes!.includes(d))
      );
    }

    // Sort by overall score
    vendors.sort((a, b) => b.performance.overallScore - a.performance.overallScore);

    return vendors;
  },
});

// Bulk update vendor performance from orders
export const recalculatePerformance = mutation({
  args: { vendorId: v.id("vendors") },
  handler: async (ctx, args) => {
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new Error("Vendor not found");

    // Get all orders from last year
    const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;

    const orders = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_vendor", (q) => q.eq("vendorId", args.vendorId))
      .filter((q) => q.gt(q.field("orderDate"), oneYearAgo))
      .collect();

    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_vendor", (q) => q.eq("vendorId", args.vendorId))
      .filter((q) => q.gt(q.field("invoiceDate"), oneYearAgo))
      .collect();

    // Calculate metrics
    const totalOrders = orders.length;
    const receivedOrders = orders.filter(
      (o) => o.status === "received" || o.status === "closed"
    ).length;
    const onTimeRate = totalOrders > 0 ? receivedOrders / totalOrders : 0.95;

    const totalInvoices = invoices.length;
    const matchedInvoices = invoices.filter((i) => i.matchStatus === "matched")
      .length;
    const invoiceAccuracy =
      totalInvoices > 0 ? matchedInvoices / totalInvoices : 0.98;

    // Calculate overall score
    const deliveryScore = Math.round(onTimeRate * 100);
    const complianceScore = Math.round(invoiceAccuracy * 100);
    const overallScore = Math.round(
      (vendor.performance.priceScore * 0.3 +
        vendor.performance.qualityScore * 0.2 +
        deliveryScore * 0.2 +
        vendor.performance.serviceScore * 0.15 +
        complianceScore * 0.1 +
        (vendor.diversityStatus.length > 0 ? 5 : 0))
    );

    await ctx.db.patch(args.vendorId, {
      performance: {
        ...vendor.performance,
        deliveryScore,
        complianceScore,
        overallScore,
        onTimeRate,
        invoiceAccuracy,
      },
      updatedAt: Date.now(),
    });

    return args.vendorId;
  },
});
