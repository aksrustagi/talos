import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppContext } from "../types/context";
import { SPENDING_CATEGORIES, TOTAL_ANNUAL_SPEND } from "./spendCategoryData";

export const spendAnalyticsRoutes = new Hono<AppContext>();

// =====================================================
// Request Schemas
// =====================================================

const dateRangeSchema = z.object({
  startDate: z.number().optional(),
  endDate: z.number().optional(),
});

const spendTrendSchema = z.object({
  granularity: z.enum(["daily", "weekly", "monthly", "quarterly"]),
  periods: z.number().min(1).max(52).optional(),
});

// =====================================================
// 1. Spend Overview
// =====================================================

// GET /spend/overview/:universityId - Get comprehensive spend overview
spendAnalyticsRoutes.get("/overview/:universityId", async (c) => {
  const universityId = c.req.param("universityId");
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");

  // Calculate date range
  const now = Date.now();
  const start = startDate ? parseInt(startDate) : now - 365 * 24 * 60 * 60 * 1000;
  const end = endDate ? parseInt(endDate) : now;

  // TODO: Connect to Convex spendAnalytics.getSpendOverview
  return c.json({
    success: true,
    data: {
      university: {
        id: universityId,
        name: "Columbia University",
        annualBudget: TOTAL_ANNUAL_SPEND,
      },
      period: { startDate: start, endDate: end },
      totalOrdered: 892_456_321,
      totalInvoiced: 876_234_112,
      totalSavings: 32_456_789,
      verifiedSavings: 28_934_567,
      savingsRate: 3.64,
      orderCount: 45_678,
      invoiceCount: 42_345,
      avgOrderValue: 19_536,
      ytdBudgetUtilization: 74.4,
      projectedYearEndSpend: 1_156_789_234,
      comparedToLastYear: {
        spendChange: 2.3,
        orderCountChange: 5.1,
        savingsChange: 18.7,
      },
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// =====================================================
// 2. Category Breakdown
// =====================================================

// GET /spend/categories/:universityId - Get spend by category
spendAnalyticsRoutes.get("/categories/:universityId", async (c) => {
  const universityId = c.req.param("universityId");

  // Build Columbia spending breakdown from defined categories
  const categories = Object.values(SPENDING_CATEGORIES).map((cat, index) => {
    // Calculate YTD spend based on annual budget prorated
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearProgress = (now.getTime() - yearStart.getTime()) / (365 * 24 * 60 * 60 * 1000);
    const expectedYtd = cat.annualBudget * yearProgress;

    // Add some variance for realism
    const variance = 0.95 + Math.random() * 0.1; // 95-105% of expected
    const actualYtd = Math.round(expectedYtd * variance);

    return {
      code: cat.code,
      name: cat.name,
      description: cat.description,
      annualBudget: cat.annualBudget,
      percentOfTotal: cat.percentOfTotal,
      ytdSpend: actualYtd,
      ytdBudgetUsed: (actualYtd / cat.annualBudget) * 100,
      remainingBudget: cat.annualBudget - actualYtd,
      orderCount: Math.round(1000 + Math.random() * 5000),
      vendorCount: Math.round(10 + Math.random() * 50),
      topVendors: getTopVendorsForCategory(cat.code),
      diverseSpendPercent: 8 + Math.random() * 12,
      sustainableSpendPercent: 5 + Math.random() * 15,
    };
  });

  const totalYtdSpend = categories.reduce((sum, c) => sum + c.ytdSpend, 0);

  return c.json({
    success: true,
    data: {
      universityId,
      totalAnnualBudget: TOTAL_ANNUAL_SPEND,
      totalYtdSpend,
      categories,
      summary: {
        largestCategory: categories[0].name,
        largestCategorySpend: categories[0].ytdSpend,
        smallestCategory: categories[categories.length - 1].name,
        overBudgetCategories: categories.filter(c => c.ytdBudgetUsed > 80).length,
        categoryCount: categories.length,
      },
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// =====================================================
// 3. Vendor Analysis
// =====================================================

// GET /spend/vendors/:universityId - Get spend by vendor
spendAnalyticsRoutes.get("/vendors/:universityId", async (c) => {
  const universityId = c.req.param("universityId");
  const limit = parseInt(c.req.query("limit") || "25");
  const diverseOnly = c.req.query("diverseOnly") === "true";

  // Top vendors for Columbia
  const vendors = [
    { id: "v001", name: "Fisher Scientific", code: "FISHER", amount: 45_678_234, orderCount: 8934, isDiverse: false, diversityStatus: [], type: "distributor" },
    { id: "v002", name: "VWR International", code: "VWR", amount: 38_456_123, orderCount: 7234, isDiverse: false, diversityStatus: [], type: "distributor" },
    { id: "v003", name: "Dell Technologies", code: "DELL", amount: 32_123_456, orderCount: 2345, isDiverse: false, diversityStatus: [], type: "manufacturer" },
    { id: "v004", name: "Grainger", code: "GRAINGER", amount: 28_934_567, orderCount: 4567, isDiverse: false, diversityStatus: [], type: "distributor" },
    { id: "v005", name: "CDW Government", code: "CDW", amount: 24_567_890, orderCount: 1890, isDiverse: false, diversityStatus: [], type: "reseller" },
    { id: "v006", name: "Staples Business", code: "STAPLES", amount: 18_234_567, orderCount: 12345, isDiverse: false, diversityStatus: [], type: "distributor" },
    { id: "v007", name: "Johnson Controls", code: "JCI", amount: 15_678_901, orderCount: 567, isDiverse: false, diversityStatus: [], type: "manufacturer" },
    { id: "v008", name: "Aramark", code: "ARAMARK", amount: 14_567_890, orderCount: 890, isDiverse: false, diversityStatus: [], type: "distributor" },
    { id: "v009", name: "ASSA ABLOY", code: "ASSA", amount: 12_345_678, orderCount: 234, isDiverse: false, diversityStatus: [], type: "manufacturer" },
    { id: "v010", name: "Minority Business Solutions", code: "MBS", amount: 8_456_789, orderCount: 1234, isDiverse: true, diversityStatus: ["MBE", "MWBE"], type: "distributor" },
    { id: "v011", name: "Women's Tech Supply", code: "WTS", amount: 6_789_012, orderCount: 890, isDiverse: true, diversityStatus: ["WBE"], type: "reseller" },
    { id: "v012", name: "Veteran Services Inc", code: "VSI", amount: 5_678_901, orderCount: 456, isDiverse: true, diversityStatus: ["SDVOSB"], type: "distributor" },
    { id: "v013", name: "EcoGreen Supplies", code: "ECOGREEN", amount: 4_567_890, orderCount: 678, isDiverse: true, diversityStatus: ["SBE"], type: "distributor" },
    { id: "v014", name: "Harlem Business Alliance", code: "HBA", amount: 3_456_789, orderCount: 345, isDiverse: true, diversityStatus: ["MBE", "SBE"], type: "distributor" },
    { id: "v015", name: "Pride Office Products", code: "PRIDE", amount: 2_345_678, orderCount: 234, isDiverse: true, diversityStatus: ["LGBT", "SBE"], type: "reseller" },
  ];

  const filteredVendors = diverseOnly ? vendors.filter(v => v.isDiverse) : vendors;
  const topVendors = filteredVendors.slice(0, limit);

  const totalSpend = vendors.reduce((sum, v) => sum + v.amount, 0);
  const diverseSpend = vendors.filter(v => v.isDiverse).reduce((sum, v) => sum + v.amount, 0);

  return c.json({
    success: true,
    data: {
      universityId,
      vendors: topVendors.map(v => ({
        vendor: {
          id: v.id,
          name: v.name,
          code: v.code,
          diversityStatus: v.diversityStatus,
          type: v.type,
        },
        amount: v.amount,
        orderCount: v.orderCount,
        percentOfTotal: (v.amount / totalSpend) * 100,
        isDiverse: v.isDiverse,
        avgOrderValue: Math.round(v.amount / v.orderCount),
      })),
      totalSpend,
      vendorCount: vendors.length,
      diversityMetrics: {
        diverseSpend,
        diversePercent: (diverseSpend / totalSpend) * 100,
        diverseVendorCount: vendors.filter(v => v.isDiverse).length,
        targetPercent: 15,
        gapToTarget: Math.max(0, 15 - (diverseSpend / totalSpend) * 100),
      },
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// =====================================================
// 4. Department Analysis
// =====================================================

// GET /spend/departments/:universityId - Get spend by department
spendAnalyticsRoutes.get("/departments/:universityId", async (c) => {
  const universityId = c.req.param("universityId");

  // Columbia University departments
  const departments = [
    { name: "College of Physicians & Surgeons", code: "CPMS", amount: 180_456_789, requisitionCount: 8934, avgAmount: 20_198 },
    { name: "Fu Foundation School of Engineering", code: "SEAS", amount: 145_234_567, requisitionCount: 6234, avgAmount: 23_299 },
    { name: "Arts & Sciences", code: "A&S", amount: 125_678_901, requisitionCount: 7890, avgAmount: 15_929 },
    { name: "Columbia Business School", code: "CBS", amount: 95_456_123, requisitionCount: 3456, avgAmount: 27_621 },
    { name: "Mailman School of Public Health", code: "MSPH", amount: 85_234_567, requisitionCount: 4567, avgAmount: 18_666 },
    { name: "Law School", code: "LAW", amount: 65_789_012, requisitionCount: 2890, avgAmount: 22_762 },
    { name: "Teachers College", code: "TC", amount: 55_456_789, requisitionCount: 3234, avgAmount: 17_150 },
    { name: "Graduate School of Architecture", code: "GSAPP", amount: 45_234_567, requisitionCount: 2345, avgAmount: 19_291 },
    { name: "School of Social Work", code: "SSW", amount: 35_678_901, requisitionCount: 1890, avgAmount: 18_877 },
    { name: "Journalism School", code: "JOUR", amount: 28_456_123, requisitionCount: 1567, avgAmount: 18_160 },
    { name: "Facilities Management", code: "FACIL", amount: 125_345_678, requisitionCount: 5678, avgAmount: 22_076 },
    { name: "IT & Computing Services", code: "CUIT", amount: 98_765_432, requisitionCount: 3456, avgAmount: 28_578 },
  ];

  const totalSpend = departments.reduce((sum, d) => sum + d.amount, 0);

  return c.json({
    success: true,
    data: {
      universityId,
      departments: departments.map(d => ({
        department: d.name,
        code: d.code,
        amount: d.amount,
        requisitionCount: d.requisitionCount,
        avgAmount: d.avgAmount,
        percentOfTotal: (d.amount / totalSpend) * 100,
      })).sort((a, b) => b.amount - a.amount),
      totalSpend,
      departmentCount: departments.length,
      summary: {
        topDepartment: departments[0].name,
        topDepartmentSpend: departments[0].amount,
        avgDepartmentSpend: totalSpend / departments.length,
      },
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// =====================================================
// 5. Diversity Spend Tracking
// =====================================================

// GET /spend/diversity/:universityId - Get diversity spend metrics
spendAnalyticsRoutes.get("/diversity/:universityId", async (c) => {
  const universityId = c.req.param("universityId");

  const totalSpend = 892_456_321;
  const targetPercent = 15;

  const diversityTypes = [
    { type: "MWBE", amount: 58_234_567, vendorCount: 45, orderCount: 3456 },
    { type: "WBE", amount: 32_456_789, vendorCount: 28, orderCount: 2134 },
    { type: "MBE", amount: 28_901_234, vendorCount: 32, orderCount: 1890 },
    { type: "SBE", amount: 24_567_890, vendorCount: 56, orderCount: 2567 },
    { type: "SDVOSB", amount: 12_345_678, vendorCount: 18, orderCount: 890 },
    { type: "HUBZone", amount: 8_901_234, vendorCount: 12, orderCount: 567 },
    { type: "LGBT", amount: 4_567_890, vendorCount: 8, orderCount: 345 },
  ];

  // Total unique diverse spend (vendors may have multiple certifications)
  const totalDiverseSpend = 89_456_234; // After deduplication
  const diversePercent = (totalDiverseSpend / totalSpend) * 100;
  const meetsTarget = diversePercent >= targetPercent;
  const gapToTarget = meetsTarget ? 0 : targetPercent - diversePercent;

  return c.json({
    success: true,
    data: {
      universityId,
      period: {
        startDate: new Date(new Date().getFullYear(), 0, 1).getTime(),
        endDate: Date.now(),
      },
      totalSpend,
      totalDiverseSpend,
      diversePercent,
      targetPercent,
      meetsTarget,
      gapToTarget,
      gapAmount: meetsTarget ? 0 : (gapToTarget / 100) * totalSpend,
      byDiversityType: diversityTypes.map(d => ({
        type: d.type,
        amount: d.amount,
        vendorCount: d.vendorCount,
        orderCount: d.orderCount,
        percentOfTotal: (d.amount / totalSpend) * 100,
      })),
      trends: {
        lastMonth: { diversePercent: 9.8, change: 0.2 },
        lastQuarter: { diversePercent: 9.2, change: 0.8 },
        lastYear: { diversePercent: 7.5, change: 2.5 },
      },
      opportunities: [
        { category: "Office Supplies", currentDiversePercent: 5.2, potentialIncrease: 12.3, vendorSuggestions: 8 },
        { category: "IT Equipment", currentDiversePercent: 3.8, potentialIncrease: 8.7, vendorSuggestions: 5 },
        { category: "Lab Supplies", currentDiversePercent: 4.5, potentialIncrease: 6.2, vendorSuggestions: 12 },
      ],
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// =====================================================
// 6. Sustainability Spend Tracking
// =====================================================

// GET /spend/sustainability/:universityId - Get sustainability metrics
spendAnalyticsRoutes.get("/sustainability/:universityId", async (c) => {
  const universityId = c.req.param("universityId");

  const totalSpend = 892_456_321;
  const targetPercent = 20;

  const sustainableSpend = 145_678_901;
  const sustainablePercent = (sustainableSpend / totalSpend) * 100;
  const meetsTarget = sustainablePercent >= targetPercent;

  const certifications = [
    { certification: "Energy Star", amount: 45_678_901, vendorCount: 34 },
    { certification: "EPEAT", amount: 38_901_234, vendorCount: 28 },
    { certification: "FSC Certified", amount: 25_678_901, vendorCount: 45 },
    { certification: "Green Seal", amount: 18_901_234, vendorCount: 23 },
    { certification: "Carbon Neutral", amount: 12_345_678, vendorCount: 12 },
    { certification: "B Corp", amount: 8_901_234, vendorCount: 8 },
  ];

  return c.json({
    success: true,
    data: {
      universityId,
      period: {
        startDate: new Date(new Date().getFullYear(), 0, 1).getTime(),
        endDate: Date.now(),
      },
      totalSpend,
      sustainableSpend,
      sustainablePercent,
      targetPercent,
      meetsTarget,
      gapToTarget: meetsTarget ? 0 : targetPercent - sustainablePercent,
      sustainableVendorCount: 89,
      totalVendorCount: 234,
      byCertification: certifications.map(c => ({
        certification: c.certification,
        amount: c.amount,
        vendorCount: c.vendorCount,
        percentOfTotal: (c.amount / totalSpend) * 100,
      })),
      environmentalImpact: {
        carbonOffsetKg: 1_234_567,
        recycledMaterialsTons: 456,
        energySavedKwh: 2_345_678,
        waterSavedGallons: 567_890,
      },
      trends: {
        lastMonth: { sustainablePercent: 15.8, change: 0.5 },
        lastQuarter: { sustainablePercent: 14.2, change: 2.1 },
        lastYear: { sustainablePercent: 11.5, change: 4.8 },
      },
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// =====================================================
// 7. Spend Trends
// =====================================================

// GET /spend/trends/:universityId - Get spend trends over time
spendAnalyticsRoutes.get("/trends/:universityId", async (c) => {
  const universityId = c.req.param("universityId");
  const granularity = c.req.query("granularity") as "daily" | "weekly" | "monthly" | "quarterly" || "monthly";
  const periods = parseInt(c.req.query("periods") || "12");

  // Generate trend data
  const now = Date.now();
  const msPerPeriod = {
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000,
    quarterly: 90 * 24 * 60 * 60 * 1000,
  }[granularity];

  const baseSpend = {
    daily: 2_500_000,
    weekly: 17_500_000,
    monthly: 75_000_000,
    quarterly: 225_000_000,
  }[granularity];

  const trends = [];
  for (let i = periods - 1; i >= 0; i--) {
    const periodStart = now - (i + 1) * msPerPeriod;
    const periodEnd = now - i * msPerPeriod;
    const variance = 0.85 + Math.random() * 0.3; // 85-115% of base
    const spend = Math.round(baseSpend * variance);
    const orders = Math.round((spend / 19500) * (0.9 + Math.random() * 0.2));

    trends.push({
      periodStart,
      periodEnd,
      spend,
      orderCount: orders,
      avgOrderValue: Math.round(spend / orders),
      growthRate: i < periods - 1 ? (Math.random() * 10 - 5) : 0,
    });
  }

  // Calculate growth rates properly
  for (let i = 1; i < trends.length; i++) {
    const prevSpend = trends[i - 1].spend;
    trends[i].growthRate = ((trends[i].spend - prevSpend) / prevSpend) * 100;
  }

  const totalSpend = trends.reduce((sum, t) => sum + t.spend, 0);
  const totalOrders = trends.reduce((sum, t) => sum + t.orderCount, 0);
  const avgGrowth = trends.slice(1).reduce((sum, t) => sum + t.growthRate, 0) / (trends.length - 1);

  return c.json({
    success: true,
    data: {
      universityId,
      granularity,
      periods,
      trends,
      summary: {
        totalSpend,
        avgSpendPerPeriod: totalSpend / periods,
        totalOrders,
        avgGrowthRate: avgGrowth,
        highestPeriod: trends.reduce((max, t) => t.spend > max.spend ? t : max, trends[0]),
        lowestPeriod: trends.reduce((min, t) => t.spend < min.spend ? t : min, trends[0]),
      },
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// =====================================================
// 8. Cost Center Analysis
// =====================================================

// GET /spend/cost-centers/:universityId - Get cost center analysis
spendAnalyticsRoutes.get("/cost-centers/:universityId", async (c) => {
  const universityId = c.req.param("universityId");

  const costCenters = [
    { code: "CC-CPMS-001", name: "Medical Research Operations", department: "CPMS", allocated: 50_000_000, spent: 42_345_678, committed: 3_456_789 },
    { code: "CC-SEAS-001", name: "Engineering Labs", department: "SEAS", allocated: 35_000_000, spent: 28_901_234, committed: 2_345_678 },
    { code: "CC-A&S-001", name: "Arts & Sciences General", department: "A&S", allocated: 30_000_000, spent: 24_567_890, committed: 1_890_123 },
    { code: "CC-FACIL-001", name: "Campus Facilities", department: "Facilities", allocated: 45_000_000, spent: 38_901_234, committed: 4_567_890 },
    { code: "CC-CUIT-001", name: "IT Infrastructure", department: "CUIT", allocated: 40_000_000, spent: 35_678_901, committed: 2_890_123 },
    { code: "CC-CBS-001", name: "Business School Ops", department: "CBS", allocated: 25_000_000, spent: 21_234_567, committed: 1_567_890 },
    { code: "CC-MSPH-001", name: "Public Health Research", department: "MSPH", allocated: 28_000_000, spent: 23_456_789, committed: 2_123_456 },
    { code: "CC-LAW-001", name: "Law School Operations", department: "LAW", allocated: 18_000_000, spent: 15_678_901, committed: 1_234_567 },
  ];

  const costCentersWithMetrics = costCenters.map(cc => {
    const available = cc.allocated - cc.spent - cc.committed;
    const utilizationPercent = ((cc.spent + cc.committed) / cc.allocated) * 100;
    return {
      ...cc,
      available,
      utilizationPercent,
      status: utilizationPercent > 90 ? "critical" : utilizationPercent > 75 ? "warning" : "healthy",
    };
  });

  const totalAllocated = costCenters.reduce((sum, cc) => sum + cc.allocated, 0);
  const totalSpent = costCenters.reduce((sum, cc) => sum + cc.spent, 0);
  const totalCommitted = costCenters.reduce((sum, cc) => sum + cc.committed, 0);

  return c.json({
    success: true,
    data: {
      universityId,
      costCenters: costCentersWithMetrics.sort((a, b) => b.spent - a.spent),
      summary: {
        totalAllocated,
        totalSpent,
        totalCommitted,
        totalAvailable: totalAllocated - totalSpent - totalCommitted,
        overallUtilization: ((totalSpent + totalCommitted) / totalAllocated) * 100,
        costCenterCount: costCenters.length,
        criticalCount: costCentersWithMetrics.filter(cc => cc.status === "critical").length,
        warningCount: costCentersWithMetrics.filter(cc => cc.status === "warning").length,
      },
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// =====================================================
// 9. Savings Opportunities
// =====================================================

// GET /spend/opportunities/:universityId - Get savings opportunities
spendAnalyticsRoutes.get("/opportunities/:universityId", async (c) => {
  const universityId = c.req.param("universityId");

  return c.json({
    success: true,
    data: {
      universityId,
      totalOpportunityValue: 12_456_789,
      opportunities: {
        priceAlerts: [
          { productId: "p001", productName: "Fisher 50ml Conical Tubes", currentPrice: 0.47, suggestedPrice: 0.42, annualVolume: 50000, annualImpact: 2500, recommendation: "Switch to VWR equivalent" },
          { productId: "p002", productName: "Nitrile Gloves Large", currentPrice: 8.50, suggestedPrice: 7.20, annualVolume: 12000, annualImpact: 15600, recommendation: "Negotiate volume discount" },
          { productId: "p003", productName: "Dell OptiPlex 7000", currentPrice: 1299, suggestedPrice: 1149, annualVolume: 500, annualImpact: 75000, recommendation: "Use consortium pricing" },
        ],
        contractRenegotiations: [
          { vendorName: "Fisher Scientific", currentDiscount: 12, suggestedDiscount: 18, annualSpend: 45000000, potentialSavings: 2700000 },
          { vendorName: "Grainger", currentDiscount: 8, suggestedDiscount: 15, annualSpend: 28000000, potentialSavings: 1960000 },
        ],
        vendorConsolidation: [
          { category: "Office Supplies", currentVendorCount: 12, suggestedVendorCount: 3, currentSpend: 8500000, potentialSavings: 850000 },
          { category: "Lab Consumables", currentVendorCount: 8, suggestedVendorCount: 2, currentSpend: 25000000, potentialSavings: 1875000 },
        ],
        timingOptimizations: [
          { productId: "p004", productName: "Paper Supplies", optimalPurchaseWindow: "Q4", expectedSavings: 125000, confidence: 0.85 },
          { productId: "p005", productName: "IT Equipment", optimalPurchaseWindow: "End of Fiscal Year", expectedSavings: 450000, confidence: 0.78 },
        ],
      },
      projectedAnnualSavings: 8_456_789,
      implementationPriority: [
        { opportunity: "Fisher contract renegotiation", impact: 2700000, effort: "medium", timeline: "60 days" },
        { opportunity: "Office supplies consolidation", impact: 850000, effort: "low", timeline: "30 days" },
        { opportunity: "Dell consortium pricing", impact: 75000, effort: "low", timeline: "14 days" },
      ],
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// =====================================================
// 10. Columbia Spending Breakdown
// =====================================================

// GET /spend/columbia-breakdown - Get Columbia's $1.2B spending breakdown
spendAnalyticsRoutes.get("/columbia-breakdown", async (c) => {
  const now = Date.now();
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
  const yearProgress = (now - yearStart) / (365 * 24 * 60 * 60 * 1000);

  const categories = Object.values(SPENDING_CATEGORIES).map(cat => {
    const expectedYtd = cat.annualBudget * yearProgress;
    const variance = 0.95 + Math.random() * 0.1;
    const actualYtd = Math.round(expectedYtd * variance);

    return {
      code: cat.code,
      name: cat.name,
      description: cat.description,
      annualBudget: cat.annualBudget,
      percentOfTotal: cat.percentOfTotal,
      ytdExpected: expectedYtd,
      ytdActual: actualYtd,
      variance: actualYtd - expectedYtd,
      variancePercent: ((actualYtd - expectedYtd) / expectedYtd) * 100,
      status: actualYtd > expectedYtd * 1.05 ? "over" : actualYtd < expectedYtd * 0.95 ? "under" : "on_track",
    };
  });

  const totalYtdActual = categories.reduce((sum, c) => sum + c.ytdActual, 0);
  const totalYtdExpected = categories.reduce((sum, c) => sum + c.ytdExpected, 0);

  return c.json({
    success: true,
    data: {
      university: {
        name: "Columbia University",
        type: "R1",
        region: "Northeast",
      },
      totalAnnualBudget: TOTAL_ANNUAL_SPEND,
      totalAnnualBudgetFormatted: "$1.2B",
      ytdSpend: totalYtdActual,
      ytdExpected: totalYtdExpected,
      ytdVariance: totalYtdActual - totalYtdExpected,
      yearProgress: yearProgress * 100,
      projectedYearEnd: totalYtdActual / yearProgress,
      categories,
      highlights: {
        largestCategory: {
          name: "Research & Lab Supplies",
          budget: 280_000_000,
          percent: 23.3,
        },
        fastestGrowingCategory: {
          name: "IT & Technology",
          growthRate: 8.5,
        },
        bestSavingsOpportunity: {
          name: "Professional Services",
          potentialSavings: 3_200_000,
        },
      },
      generatedAt: now,
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// =====================================================
// Helper Functions
// =====================================================

function getTopVendorsForCategory(categoryCode: string): Array<{ name: string; spend: number }> {
  const vendorsByCategory: Record<string, Array<{ name: string; spend: number }>> = {
    RESEARCH_LAB: [
      { name: "Fisher Scientific", spend: 85_000_000 },
      { name: "VWR International", spend: 65_000_000 },
      { name: "Sigma-Aldrich", spend: 45_000_000 },
    ],
    IT_TECH: [
      { name: "Dell Technologies", spend: 55_000_000 },
      { name: "CDW Government", spend: 38_000_000 },
      { name: "Apple", spend: 25_000_000 },
    ],
    FACILITIES: [
      { name: "Grainger", spend: 42_000_000 },
      { name: "Johnson Controls", spend: 35_000_000 },
      { name: "Siemens", spend: 28_000_000 },
    ],
    MEDICAL: [
      { name: "McKesson", spend: 48_000_000 },
      { name: "Cardinal Health", spend: 38_000_000 },
      { name: "Henry Schein", spend: 25_000_000 },
    ],
    CONSTRUCTION: [
      { name: "Turner Construction", spend: 45_000_000 },
      { name: "Skanska", spend: 35_000_000 },
      { name: "Lendlease", spend: 22_000_000 },
    ],
    PROF_SERVICES: [
      { name: "Deloitte", spend: 28_000_000 },
      { name: "McKinsey", spend: 22_000_000 },
      { name: "PwC", spend: 18_000_000 },
    ],
    OFFICE_ADMIN: [
      { name: "Staples", spend: 22_000_000 },
      { name: "Office Depot", spend: 15_000_000 },
      { name: "Amazon Business", spend: 12_000_000 },
    ],
    FOOD: [
      { name: "Aramark", spend: 28_000_000 },
      { name: "Sodexo", spend: 12_000_000 },
      { name: "Compass Group", spend: 8_000_000 },
    ],
    UTILITIES: [
      { name: "ConEdison", spend: 25_000_000 },
      { name: "National Grid", spend: 12_000_000 },
      { name: "Green Power", spend: 5_000_000 },
    ],
    TRANSPORT: [
      { name: "Enterprise", spend: 12_000_000 },
      { name: "FedEx", spend: 10_000_000 },
      { name: "UPS", spend: 8_000_000 },
    ],
    MARKETING: [
      { name: "Omnicom", spend: 8_000_000 },
      { name: "WPP", spend: 6_000_000 },
      { name: "Local Events Co", spend: 4_000_000 },
    ],
    OTHER: [
      { name: "Various", spend: 8_000_000 },
      { name: "Miscellaneous", spend: 4_000_000 },
      { name: "One-time", spend: 2_000_000 },
    ],
  };

  return vendorsByCategory[categoryCode] || vendorsByCategory.OTHER;
}

export default spendAnalyticsRoutes;
