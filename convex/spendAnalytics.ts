import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================
// SPENDING CATEGORY DEFINITIONS
// ============================================

// Columbia University spending categories with annual targets
export const SPENDING_CATEGORIES = {
  RESEARCH_LAB_SUPPLIES: {
    code: "RESEARCH_LAB",
    name: "Research & Lab Supplies",
    annualBudget: 280_000_000,
    percentOfTotal: 23.3,
    description: "Scientific equipment, reagents, consumables, lab apparatus",
  },
  IT_TECHNOLOGY: {
    code: "IT_TECH",
    name: "IT & Technology",
    annualBudget: 180_000_000,
    percentOfTotal: 15.0,
    description: "Hardware, software licenses, cloud services, networking",
  },
  FACILITIES_MAINTENANCE: {
    code: "FACILITIES",
    name: "Facilities & Maintenance",
    annualBudget: 150_000_000,
    percentOfTotal: 12.5,
    description: "Building maintenance, repairs, HVAC, custodial services",
  },
  MEDICAL_CLINICAL: {
    code: "MEDICAL",
    name: "Medical/Clinical Supplies",
    annualBudget: 140_000_000,
    percentOfTotal: 11.7,
    description: "Medical devices, pharmaceuticals, clinical supplies",
  },
  CONSTRUCTION_CAPITAL: {
    code: "CONSTRUCTION",
    name: "Construction & Capital Projects",
    annualBudget: 120_000_000,
    percentOfTotal: 10.0,
    description: "New construction, major renovations, capital improvements",
  },
  PROFESSIONAL_SERVICES: {
    code: "PROF_SERVICES",
    name: "Professional Services",
    annualBudget: 100_000_000,
    percentOfTotal: 8.3,
    description: "Consulting, legal, accounting, temporary staffing",
  },
  OFFICE_ADMINISTRATIVE: {
    code: "OFFICE_ADMIN",
    name: "Office & Administrative",
    annualBudget: 60_000_000,
    percentOfTotal: 5.0,
    description: "Office supplies, furniture, printing, mail services",
  },
  FOOD_SERVICES: {
    code: "FOOD",
    name: "Food Services",
    annualBudget: 50_000_000,
    percentOfTotal: 4.2,
    description: "Dining services, catering, food supplies",
  },
  UTILITIES_ENERGY: {
    code: "UTILITIES",
    name: "Utilities & Energy",
    annualBudget: 45_000_000,
    percentOfTotal: 3.75,
    description: "Electricity, gas, water, renewable energy",
  },
  TRANSPORTATION_FLEET: {
    code: "TRANSPORT",
    name: "Transportation & Fleet",
    annualBudget: 35_000_000,
    percentOfTotal: 2.9,
    description: "Vehicle fleet, shuttles, logistics, freight",
  },
  MARKETING_EVENTS: {
    code: "MARKETING",
    name: "Marketing & Events",
    annualBudget: 25_000_000,
    percentOfTotal: 2.1,
    description: "Marketing materials, events, conferences, recruitment",
  },
  OTHER: {
    code: "OTHER",
    name: "Other/Miscellaneous",
    annualBudget: 15_000_000,
    percentOfTotal: 1.25,
    description: "Miscellaneous purchases not in other categories",
  },
} as const;

export const TOTAL_ANNUAL_SPEND = 1_200_000_000; // $1.2B

// ============================================
// SPEND ANALYTICS QUERIES
// ============================================

// Get comprehensive spend overview for a university
export const getSpendOverview = query({
  args: {
    universityId: v.id("universities"),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const startDate = args.startDate || now - 365 * 24 * 60 * 60 * 1000;
    const endDate = args.endDate || now;

    const university = await ctx.db.get(args.universityId);
    if (!university) return null;

    // Get all purchase orders in the period
    const purchaseOrders = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_university", (q) => q.eq("universityId", args.universityId))
      .filter((q) =>
        q.and(
          q.gte(q.field("orderDate"), startDate),
          q.lte(q.field("orderDate"), endDate)
        )
      )
      .collect();

    // Get all invoices in the period
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_university", (q) => q.eq("universityId", args.universityId))
      .filter((q) =>
        q.and(
          q.gte(q.field("invoiceDate"), startDate),
          q.lte(q.field("invoiceDate"), endDate)
        )
      )
      .collect();

    // Get savings records
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

    // Calculate totals
    const totalOrdered = purchaseOrders.reduce((sum, po) => sum + po.totalAmount, 0);
    const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const totalSavings = savings.reduce((sum, s) => sum + s.amount, 0);
    const verifiedSavings = savings
      .filter((s) => s.verificationStatus === "verified")
      .reduce((sum, s) => sum + s.amount, 0);

    return {
      university: {
        id: args.universityId,
        name: university.name,
        annualBudget: university.annualSpend,
      },
      period: { startDate, endDate },
      totalOrdered,
      totalInvoiced,
      totalSavings,
      verifiedSavings,
      savingsRate: totalOrdered > 0 ? (totalSavings / totalOrdered) * 100 : 0,
      orderCount: purchaseOrders.length,
      invoiceCount: invoices.length,
      avgOrderValue: purchaseOrders.length > 0 ? totalOrdered / purchaseOrders.length : 0,
    };
  },
});

// Get spend breakdown by category
export const getSpendByCategory = query({
  args: {
    universityId: v.id("universities"),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const startDate = args.startDate || now - 365 * 24 * 60 * 60 * 1000;
    const endDate = args.endDate || now;

    // Get purchase orders with line items
    const purchaseOrders = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_university", (q) => q.eq("universityId", args.universityId))
      .filter((q) =>
        q.and(
          q.gte(q.field("orderDate"), startDate),
          q.lte(q.field("orderDate"), endDate)
        )
      )
      .collect();

    const poIds = purchaseOrders.map((po) => po._id);

    // Get all line items for these POs
    const allLineItems = await ctx.db.query("poLineItems").collect();
    const lineItems = allLineItems.filter((li) => poIds.includes(li.purchaseOrderId));

    // Get products to determine categories
    const productIds = lineItems
      .filter((li) => li.productId)
      .map((li) => li.productId);

    const products = await Promise.all(
      [...new Set(productIds)].map((pid) => ctx.db.get(pid!))
    );

    const productMap = new Map(products.filter(Boolean).map((p) => [p!._id, p]));

    // Aggregate by category
    const categorySpend: Record<
      string,
      { amount: number; itemCount: number; orderCount: number }
    > = {};

    for (const li of lineItems) {
      const product = li.productId ? productMap.get(li.productId) : null;
      const category = product?.categoryPath?.[0] || "Other";

      if (!categorySpend[category]) {
        categorySpend[category] = { amount: 0, itemCount: 0, orderCount: 0 };
      }
      categorySpend[category].amount += li.extendedPrice;
      categorySpend[category].itemCount++;
    }

    // Count orders per category
    const poLinesByCategory: Record<string, Set<string>> = {};
    for (const li of lineItems) {
      const product = li.productId ? productMap.get(li.productId) : null;
      const category = product?.categoryPath?.[0] || "Other";

      if (!poLinesByCategory[category]) {
        poLinesByCategory[category] = new Set();
      }
      poLinesByCategory[category].add(li.purchaseOrderId);
    }

    for (const [category, poSet] of Object.entries(poLinesByCategory)) {
      if (categorySpend[category]) {
        categorySpend[category].orderCount = poSet.size;
      }
    }

    const totalSpend = Object.values(categorySpend).reduce(
      (sum, c) => sum + c.amount,
      0
    );

    // Convert to array and add percentages
    const categories = Object.entries(categorySpend)
      .map(([name, data]) => ({
        category: name,
        amount: data.amount,
        itemCount: data.itemCount,
        orderCount: data.orderCount,
        percentOfTotal: totalSpend > 0 ? (data.amount / totalSpend) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      period: { startDate, endDate },
      totalSpend,
      categories,
      categoryCount: categories.length,
    };
  },
});

// Get spend by vendor with diversity tracking
export const getSpendByVendor = query({
  args: {
    universityId: v.id("universities"),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const startDate = args.startDate || now - 365 * 24 * 60 * 60 * 1000;
    const endDate = args.endDate || now;
    const limit = args.limit || 50;

    const purchaseOrders = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_university", (q) => q.eq("universityId", args.universityId))
      .filter((q) =>
        q.and(
          q.gte(q.field("orderDate"), startDate),
          q.lte(q.field("orderDate"), endDate)
        )
      )
      .collect();

    // Aggregate by vendor
    const vendorSpend: Record<
      string,
      { amount: number; orderCount: number; vendorId: string }
    > = {};

    for (const po of purchaseOrders) {
      const vendorIdStr = po.vendorId as unknown as string;
      if (!vendorSpend[vendorIdStr]) {
        vendorSpend[vendorIdStr] = {
          amount: 0,
          orderCount: 0,
          vendorId: vendorIdStr,
        };
      }
      vendorSpend[vendorIdStr].amount += po.totalAmount;
      vendorSpend[vendorIdStr].orderCount++;
    }

    // Get vendor details
    const vendorIds = Object.keys(vendorSpend);
    const vendors = await Promise.all(
      vendorIds.map((vid) => ctx.db.get(vid as any))
    );

    const totalSpend = Object.values(vendorSpend).reduce(
      (sum, v) => sum + v.amount,
      0
    );

    // Build vendor spend array with details
    const vendorSpendArray = vendors
      .filter(Boolean)
      .map((vendor) => {
        const spend = vendorSpend[vendor!._id as unknown as string];
        return {
          vendor: {
            id: vendor!._id,
            name: vendor!.name,
            code: vendor!.code,
            diversityStatus: vendor!.diversityStatus,
            type: vendor!.type,
          },
          amount: spend.amount,
          orderCount: spend.orderCount,
          percentOfTotal: totalSpend > 0 ? (spend.amount / totalSpend) * 100 : 0,
          isDiverse: vendor!.diversityStatus.length > 0,
        };
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, limit);

    // Calculate diversity metrics
    const diverseVendorSpend = vendorSpendArray
      .filter((v) => v.isDiverse)
      .reduce((sum, v) => sum + v.amount, 0);

    return {
      period: { startDate, endDate },
      totalSpend,
      vendors: vendorSpendArray,
      vendorCount: vendorSpendArray.length,
      diversityMetrics: {
        diverseSpend: diverseVendorSpend,
        diversePercent: totalSpend > 0 ? (diverseVendorSpend / totalSpend) * 100 : 0,
        diverseVendorCount: vendorSpendArray.filter((v) => v.isDiverse).length,
      },
    };
  },
});

// Get spend by department
export const getSpendByDepartment = query({
  args: {
    universityId: v.id("universities"),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const startDate = args.startDate || now - 365 * 24 * 60 * 60 * 1000;
    const endDate = args.endDate || now;

    // Get requisitions with department info
    const requisitions = await ctx.db
      .query("requisitions")
      .withIndex("by_university", (q) => q.eq("universityId", args.universityId))
      .filter((q) =>
        q.and(
          q.gte(q.field("createdAt"), startDate),
          q.lte(q.field("createdAt"), endDate),
          q.or(
            q.eq(q.field("status"), "approved"),
            q.eq(q.field("status"), "ordered")
          )
        )
      )
      .collect();

    // Aggregate by department
    const deptSpend: Record<
      string,
      { amount: number; requisitionCount: number; avgAmount: number }
    > = {};

    for (const req of requisitions) {
      if (!deptSpend[req.department]) {
        deptSpend[req.department] = {
          amount: 0,
          requisitionCount: 0,
          avgAmount: 0,
        };
      }
      deptSpend[req.department].amount += req.totalAmount;
      deptSpend[req.department].requisitionCount++;
    }

    // Calculate averages
    for (const dept of Object.keys(deptSpend)) {
      deptSpend[dept].avgAmount =
        deptSpend[dept].amount / deptSpend[dept].requisitionCount;
    }

    const totalSpend = Object.values(deptSpend).reduce(
      (sum, d) => sum + d.amount,
      0
    );

    const departments = Object.entries(deptSpend)
      .map(([name, data]) => ({
        department: name,
        amount: data.amount,
        requisitionCount: data.requisitionCount,
        avgAmount: data.avgAmount,
        percentOfTotal: totalSpend > 0 ? (data.amount / totalSpend) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      period: { startDate, endDate },
      totalSpend,
      departments,
      departmentCount: departments.length,
    };
  },
});

// Get diversity spend metrics
export const getDiversitySpendMetrics = query({
  args: {
    universityId: v.id("universities"),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const startDate = args.startDate || now - 365 * 24 * 60 * 60 * 1000;
    const endDate = args.endDate || now;

    const university = await ctx.db.get(args.universityId);
    const targetPercent = university?.settings.diversityTarget || 15;

    const purchaseOrders = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_university", (q) => q.eq("universityId", args.universityId))
      .filter((q) =>
        q.and(
          q.gte(q.field("orderDate"), startDate),
          q.lte(q.field("orderDate"), endDate)
        )
      )
      .collect();

    // Get all vendors
    const vendorIds = [...new Set(purchaseOrders.map((po) => po.vendorId))];
    const vendors = await Promise.all(vendorIds.map((vid) => ctx.db.get(vid)));
    const vendorMap = new Map(
      vendors.filter(Boolean).map((v) => [v!._id, v])
    );

    const totalSpend = purchaseOrders.reduce((sum, po) => sum + po.totalAmount, 0);

    // Aggregate by diversity type
    const diversitySpend: Record<
      string,
      { amount: number; vendorCount: number; orderCount: number }
    > = {
      MWBE: { amount: 0, vendorCount: 0, orderCount: 0 },
      WBE: { amount: 0, vendorCount: 0, orderCount: 0 },
      MBE: { amount: 0, vendorCount: 0, orderCount: 0 },
      SBE: { amount: 0, vendorCount: 0, orderCount: 0 },
      SDVOSB: { amount: 0, vendorCount: 0, orderCount: 0 },
      HUBZone: { amount: 0, vendorCount: 0, orderCount: 0 },
      LGBT: { amount: 0, vendorCount: 0, orderCount: 0 },
    };

    const diverseVendorsByType: Record<string, Set<string>> = {};

    for (const po of purchaseOrders) {
      const vendor = vendorMap.get(po.vendorId);
      if (vendor && vendor.diversityStatus.length > 0) {
        for (const status of vendor.diversityStatus) {
          if (!diverseVendorsByType[status]) {
            diverseVendorsByType[status] = new Set();
          }
          diverseVendorsByType[status].add(vendor._id as unknown as string);
          diversitySpend[status].amount += po.totalAmount;
          diversitySpend[status].orderCount++;
        }
      }
    }

    // Count unique vendors
    for (const [type, vendorSet] of Object.entries(diverseVendorsByType)) {
      diversitySpend[type].vendorCount = vendorSet.size;
    }

    // Total diverse spend (count each order once even if vendor has multiple certifications)
    let totalDiverseSpend = 0;
    const countedOrders = new Set<string>();
    for (const po of purchaseOrders) {
      const vendor = vendorMap.get(po.vendorId);
      if (
        vendor &&
        vendor.diversityStatus.length > 0 &&
        !countedOrders.has(po._id as unknown as string)
      ) {
        totalDiverseSpend += po.totalAmount;
        countedOrders.add(po._id as unknown as string);
      }
    }

    const diversePercent =
      totalSpend > 0 ? (totalDiverseSpend / totalSpend) * 100 : 0;
    const meetsTarget = diversePercent >= targetPercent;
    const gapToTarget = targetPercent - diversePercent;

    return {
      period: { startDate, endDate },
      totalSpend,
      totalDiverseSpend,
      diversePercent,
      targetPercent,
      meetsTarget,
      gapToTarget: meetsTarget ? 0 : gapToTarget,
      gapAmount: meetsTarget
        ? 0
        : (gapToTarget / 100) * totalSpend,
      byDiversityType: Object.entries(diversitySpend).map(([type, data]) => ({
        type,
        amount: data.amount,
        vendorCount: data.vendorCount,
        orderCount: data.orderCount,
        percentOfTotal: totalSpend > 0 ? (data.amount / totalSpend) * 100 : 0,
      })),
    };
  },
});

// Get sustainability spend metrics
export const getSustainabilityMetrics = query({
  args: {
    universityId: v.id("universities"),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const startDate = args.startDate || now - 365 * 24 * 60 * 60 * 1000;
    const endDate = args.endDate || now;

    const university = await ctx.db.get(args.universityId);
    const targetPercent = university?.settings.sustainabilityTarget || 20;

    const purchaseOrders = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_university", (q) => q.eq("universityId", args.universityId))
      .filter((q) =>
        q.and(
          q.gte(q.field("orderDate"), startDate),
          q.lte(q.field("orderDate"), endDate)
        )
      )
      .collect();

    // Get all vendors with sustainability info
    const vendorIds = [...new Set(purchaseOrders.map((po) => po.vendorId))];
    const vendors = await Promise.all(vendorIds.map((vid) => ctx.db.get(vid)));
    const vendorMap = new Map(
      vendors.filter(Boolean).map((v) => [v!._id, v])
    );

    const totalSpend = purchaseOrders.reduce((sum, po) => sum + po.totalAmount, 0);

    // Calculate sustainable spend
    let sustainableSpend = 0;
    const sustainableVendors = new Set<string>();

    for (const po of purchaseOrders) {
      const vendor = vendorMap.get(po.vendorId);
      if (
        vendor &&
        (vendor.sustainability.rating ||
          vendor.sustainability.certifications.length > 0)
      ) {
        sustainableSpend += po.totalAmount;
        sustainableVendors.add(vendor._id as unknown as string);
      }
    }

    const sustainablePercent =
      totalSpend > 0 ? (sustainableSpend / totalSpend) * 100 : 0;
    const meetsTarget = sustainablePercent >= targetPercent;

    // Group by certification
    const certificationSpend: Record<
      string,
      { amount: number; vendorCount: number }
    > = {};

    for (const po of purchaseOrders) {
      const vendor = vendorMap.get(po.vendorId);
      if (vendor && vendor.sustainability.certifications.length > 0) {
        for (const cert of vendor.sustainability.certifications) {
          if (!certificationSpend[cert]) {
            certificationSpend[cert] = { amount: 0, vendorCount: 0 };
          }
          certificationSpend[cert].amount += po.totalAmount;
        }
      }
    }

    return {
      period: { startDate, endDate },
      totalSpend,
      sustainableSpend,
      sustainablePercent,
      targetPercent,
      meetsTarget,
      gapToTarget: meetsTarget ? 0 : targetPercent - sustainablePercent,
      sustainableVendorCount: sustainableVendors.size,
      totalVendorCount: vendorIds.length,
      byCertification: Object.entries(certificationSpend)
        .map(([cert, data]) => ({
          certification: cert,
          amount: data.amount,
          percentOfTotal: totalSpend > 0 ? (data.amount / totalSpend) * 100 : 0,
        }))
        .sort((a, b) => b.amount - a.amount),
    };
  },
});

// Get spend trend analysis over time
export const getSpendTrends = query({
  args: {
    universityId: v.id("universities"),
    granularity: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("quarterly")
    ),
    periods: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const granularity = args.granularity;
    const periods = args.periods || 12;

    const msPerDay = 24 * 60 * 60 * 1000;
    const periodMs = {
      daily: msPerDay,
      weekly: 7 * msPerDay,
      monthly: 30 * msPerDay,
      quarterly: 90 * msPerDay,
    }[granularity];

    const now = Date.now();
    const startDate = now - periods * periodMs;

    const purchaseOrders = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_university", (q) => q.eq("universityId", args.universityId))
      .filter((q) => q.gte(q.field("orderDate"), startDate))
      .collect();

    // Group by period
    const periodData: Record<
      number,
      { spend: number; orders: number; avgOrderValue: number }
    > = {};

    for (let i = 0; i < periods; i++) {
      const periodStart = startDate + i * periodMs;
      periodData[periodStart] = { spend: 0, orders: 0, avgOrderValue: 0 };
    }

    for (const po of purchaseOrders) {
      const periodIndex = Math.floor((po.orderDate - startDate) / periodMs);
      const periodStart = startDate + periodIndex * periodMs;

      if (periodData[periodStart]) {
        periodData[periodStart].spend += po.totalAmount;
        periodData[periodStart].orders++;
      }
    }

    // Calculate averages
    for (const period of Object.keys(periodData)) {
      const data = periodData[Number(period)];
      data.avgOrderValue = data.orders > 0 ? data.spend / data.orders : 0;
    }

    const trends = Object.entries(periodData)
      .map(([periodStart, data]) => ({
        periodStart: Number(periodStart),
        periodEnd: Number(periodStart) + periodMs,
        spend: data.spend,
        orderCount: data.orders,
        avgOrderValue: data.avgOrderValue,
      }))
      .sort((a, b) => a.periodStart - b.periodStart);

    // Calculate growth rates
    const trendsWithGrowth = trends.map((t, i) => {
      const prevSpend = i > 0 ? trends[i - 1].spend : t.spend;
      const growthRate =
        prevSpend > 0 ? ((t.spend - prevSpend) / prevSpend) * 100 : 0;
      return { ...t, growthRate };
    });

    const totalSpend = trends.reduce((sum, t) => sum + t.spend, 0);
    const avgSpend = totalSpend / periods;

    return {
      granularity,
      periods,
      trends: trendsWithGrowth,
      summary: {
        totalSpend,
        avgSpendPerPeriod: avgSpend,
        totalOrders: trends.reduce((sum, t) => sum + t.orderCount, 0),
        avgGrowthRate:
          trendsWithGrowth.reduce((sum, t) => sum + t.growthRate, 0) /
          Math.max(1, trendsWithGrowth.length - 1),
      },
    };
  },
});

// Get cost center analysis
export const getCostCenterAnalysis = query({
  args: {
    universityId: v.id("universities"),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const startDate = args.startDate || now - 365 * 24 * 60 * 60 * 1000;
    const endDate = args.endDate || now;

    // Get budgets for cost center mapping
    const budgets = await ctx.db
      .query("budgets")
      .withIndex("by_university", (q) => q.eq("universityId", args.universityId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    // Get PO line items with GL codes
    const purchaseOrders = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_university", (q) => q.eq("universityId", args.universityId))
      .filter((q) =>
        q.and(
          q.gte(q.field("orderDate"), startDate),
          q.lte(q.field("orderDate"), endDate)
        )
      )
      .collect();

    const poIds = purchaseOrders.map((po) => po._id);
    const allLineItems = await ctx.db.query("poLineItems").collect();
    const lineItems = allLineItems.filter((li) => poIds.includes(li.purchaseOrderId));

    // Aggregate by budget code (cost center)
    const costCenterSpend: Record<
      string,
      {
        budgetCode: string;
        name: string;
        allocated: number;
        spent: number;
        remaining: number;
        utilizationPercent: number;
      }
    > = {};

    // Initialize from budgets
    for (const budget of budgets) {
      costCenterSpend[budget.budgetCode] = {
        budgetCode: budget.budgetCode,
        name: budget.name,
        allocated: budget.allocatedAmount,
        spent: 0,
        remaining: budget.availableAmount,
        utilizationPercent: 0,
      };
    }

    // Add spend from line items
    for (const li of lineItems) {
      const budgetCode = li.budgetCode;
      if (costCenterSpend[budgetCode]) {
        costCenterSpend[budgetCode].spent += li.extendedPrice;
      } else {
        costCenterSpend[budgetCode] = {
          budgetCode,
          name: budgetCode,
          allocated: 0,
          spent: li.extendedPrice,
          remaining: 0,
          utilizationPercent: 0,
        };
      }
    }

    // Calculate utilization
    for (const cc of Object.values(costCenterSpend)) {
      if (cc.allocated > 0) {
        cc.utilizationPercent = (cc.spent / cc.allocated) * 100;
        cc.remaining = cc.allocated - cc.spent;
      }
    }

    const costCenters = Object.values(costCenterSpend).sort(
      (a, b) => b.spent - a.spent
    );

    const totalAllocated = costCenters.reduce((sum, cc) => sum + cc.allocated, 0);
    const totalSpent = costCenters.reduce((sum, cc) => sum + cc.spent, 0);

    return {
      period: { startDate, endDate },
      costCenters,
      summary: {
        totalAllocated,
        totalSpent,
        totalRemaining: totalAllocated - totalSpent,
        overallUtilization:
          totalAllocated > 0 ? (totalSpent / totalAllocated) * 100 : 0,
        costCenterCount: costCenters.length,
        overBudgetCount: costCenters.filter(
          (cc) => cc.allocated > 0 && cc.spent > cc.allocated
        ).length,
      },
    };
  },
});

// ============================================
// SPEND ANALYTICS MUTATIONS
// ============================================

// Record a spend analysis snapshot
export const recordSpendSnapshot = mutation({
  args: {
    universityId: v.id("universities"),
    category: v.string(),
    amount: v.number(),
    period: v.object({
      startDate: v.number(),
      endDate: v.number(),
    }),
    metrics: v.object({
      orderCount: v.number(),
      vendorCount: v.number(),
      diverseSpendPercent: v.number(),
      sustainableSpendPercent: v.number(),
      savingsAmount: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    // Store in audit log as spend snapshot
    const auditId = await ctx.db.insert("auditLog", {
      universityId: args.universityId,
      action: "spend_snapshot",
      entityType: "spend_analytics",
      entityId: args.category,
      newValue: {
        category: args.category,
        amount: args.amount,
        period: args.period,
        metrics: args.metrics,
      },
      timestamp: Date.now(),
    });
    return auditId;
  },
});

// Columbia University spending breakdown query
export const getColumbiaSpendingBreakdown = query({
  args: {
    universityId: v.id("universities"),
  },
  handler: async (ctx, args) => {
    const university = await ctx.db.get(args.universityId);
    if (!university) return null;

    // Get actual spend data if available
    const now = Date.now();
    const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();

    const purchaseOrders = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_university", (q) => q.eq("universityId", args.universityId))
      .filter((q) => q.gte(q.field("orderDate"), yearStart))
      .collect();

    const ytdSpend = purchaseOrders.reduce((sum, po) => sum + po.totalAmount, 0);

    // Return Columbia spending breakdown with actuals if available
    const categories = Object.values(SPENDING_CATEGORIES).map((cat) => {
      const expectedYtd =
        (cat.annualBudget * (now - yearStart)) / (365 * 24 * 60 * 60 * 1000);
      const actualSpend = (ytdSpend * cat.percentOfTotal) / 100;

      return {
        code: cat.code,
        name: cat.name,
        description: cat.description,
        annualBudget: cat.annualBudget,
        percentOfTotal: cat.percentOfTotal,
        ytdExpected: expectedYtd,
        ytdActual: actualSpend,
        variance: actualSpend - expectedYtd,
        variancePercent:
          expectedYtd > 0 ? ((actualSpend - expectedYtd) / expectedYtd) * 100 : 0,
      };
    });

    return {
      university: {
        id: args.universityId,
        name: university.name,
        type: university.type,
      },
      totalAnnualBudget: TOTAL_ANNUAL_SPEND,
      ytdSpend,
      categories,
      generatedAt: now,
    };
  },
});

// Get savings opportunities analysis
export const getSavingsOpportunities = query({
  args: {
    universityId: v.id("universities"),
  },
  handler: async (ctx, args) => {
    // Get recent price alerts
    const priceAlerts = await ctx.db
      .query("priceAlertNotifications")
      .withIndex("by_acknowledged", (q) => q.eq("acknowledged", false))
      .order("desc")
      .take(50);

    // Get anomaly detections
    const anomalies = await ctx.db
      .query("anomalyDetections")
      .withIndex("by_university", (q) => q.eq("universityId", args.universityId))
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "new"),
          q.eq(q.field("anomalyType"), "price_anomaly")
        )
      )
      .take(20);

    // Get price state recommendations
    const buyRecommendations = await ctx.db
      .query("priceStateHistory")
      .withIndex("by_recommendation", (q) => q.eq("recommendation", "buy_now"))
      .order("desc")
      .take(20);

    const waitRecommendations = await ctx.db
      .query("priceStateHistory")
      .withIndex("by_recommendation", (q) => q.eq("recommendation", "wait"))
      .order("desc")
      .take(20);

    // Get savings records for projected annual savings
    const recentSavings = await ctx.db
      .query("savingsRecords")
      .withIndex("by_university", (q) => q.eq("universityId", args.universityId))
      .order("desc")
      .take(100);

    const avgMonthlySavings =
      recentSavings.reduce((sum, s) => sum + s.amount, 0) /
      Math.max(1, recentSavings.length);
    const projectedAnnualSavings = avgMonthlySavings * 12;

    return {
      priceAlerts: priceAlerts.map((a) => ({
        productId: a.productId,
        currentPrice: a.currentPrice,
        previousPrice: a.previousPrice,
        changePercent: a.changePercent,
        annualImpact: a.annualImpact,
        recommendation: a.recommendedAction,
      })),
      anomalies: anomalies.map((a) => ({
        type: a.anomalyType,
        severity: a.severity,
        description: a.description,
        confidence: a.confidence,
      })),
      timingOpportunities: {
        buyNow: buyRecommendations.map((r) => ({
          productId: r.productId,
          expectedSavings: r.expectedSavings,
          confidence: r.stateProbability,
        })),
        waitToBuy: waitRecommendations.map((r) => ({
          productId: r.productId,
          waitUntil: r.waitUntil,
          expectedSavings: r.expectedSavings,
        })),
      },
      projectedAnnualSavings,
      opportunityCount:
        priceAlerts.length +
        anomalies.length +
        buyRecommendations.length +
        waitRecommendations.length,
    };
  },
});
