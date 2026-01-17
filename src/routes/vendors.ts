import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppContext } from "../types/context";

export const vendorRoutes = new Hono<AppContext>();

// Schemas
const createVendorSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(20),
  type: z.enum(["distributor", "manufacturer", "reseller"]),
  categories: z.array(z.string()),
  diversityStatus: z
    .array(z.enum(["MWBE", "WBE", "MBE", "SBE", "SDVOSB", "HUBZone", "LGBT"]))
    .optional(),
  contact: z.object({
    email: z.string().email(),
    phone: z.string().optional(),
    accountRep: z.string().optional(),
    address: z.string().optional(),
  }),
});

// GET /vendors - List vendors
vendorRoutes.get("/", async (c) => {
  const type = c.req.query("type");
  const category = c.req.query("category");
  const diverseOnly = c.req.query("diverseOnly") === "true";

  // TODO: Call Convex to list vendors
  // const vendors = await convex.query(api.vendors.list, { type, category, diverseOnly });

  return c.json({
    success: true,
    data: [
      {
        id: "vendor_fisher",
        name: "Fisher Scientific",
        code: "FISHER",
        type: "distributor",
        categories: ["Lab Supplies", "Chemicals", "Equipment"],
        diversityStatus: [],
        performance: {
          overallScore: 92,
          onTimeRate: 0.96,
          invoiceAccuracy: 0.98,
        },
        contractStatus: "active",
      },
      {
        id: "vendor_vwr",
        name: "VWR International",
        code: "VWR",
        type: "distributor",
        categories: ["Lab Supplies", "Chemicals"],
        diversityStatus: [],
        performance: {
          overallScore: 90,
          onTimeRate: 0.94,
          invoiceAccuracy: 0.97,
        },
        contractStatus: "active",
      },
      {
        id: "vendor_chemsource",
        name: "ChemSource Inc.",
        code: "CHEMSRC",
        type: "distributor",
        categories: ["Chemicals", "Solvents"],
        diversityStatus: ["MWBE", "SBE"],
        performance: {
          overallScore: 88,
          onTimeRate: 0.96,
          invoiceAccuracy: 0.99,
        },
        contractStatus: "active",
      },
    ],
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
      pagination: {
        total: 3,
        limit: 50,
        offset: 0,
        hasMore: false,
      },
    },
  });
});

// POST /vendors - Create vendor
vendorRoutes.post("/", zValidator("json", createVendorSchema), async (c) => {
  const data = c.req.valid("json");

  // TODO: Call Convex to create vendor
  // const vendorId = await convex.mutation(api.vendors.create, data);

  return c.json(
    {
      success: true,
      data: {
        id: "vendor_new",
        ...data,
        createdAt: new Date().toISOString(),
      },
      meta: {
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
      },
    },
    201
  );
});

// GET /vendors/:id - Get vendor by ID
vendorRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  // TODO: Call Convex to get vendor
  // const vendor = await convex.query(api.vendors.get, { id });

  return c.json({
    success: true,
    data: {
      id,
      name: "Fisher Scientific",
      code: "FISHER",
      type: "distributor",
      categories: ["Lab Supplies", "Chemicals", "Equipment"],
      diversityStatus: [],
      certifications: ["ISO 9001", "ISO 14001"],
      sustainability: {
        rating: "A",
        certifications: ["LEED", "Carbon Neutral"],
      },
      contact: {
        email: "orders@fisher.com",
        phone: "1-800-766-7000",
        accountRep: "John Smith",
      },
      integration: {
        type: "cxml",
        syncStatus: "active",
        lastSyncAt: new Date().toISOString(),
      },
      performance: {
        overallScore: 92,
        priceScore: 85,
        qualityScore: 95,
        deliveryScore: 94,
        serviceScore: 90,
        complianceScore: 96,
        onTimeRate: 0.96,
        defectRate: 0.005,
        invoiceAccuracy: 0.98,
      },
      riskScore: 15,
      riskFactors: [],
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// GET /vendors/:id/scorecard - Get vendor scorecard
vendorRoutes.get("/:id/scorecard", async (c) => {
  const id = c.req.param("id");

  // TODO: Call Convex to get vendor scorecard
  // const scorecard = await convex.query(api.vendors.getScorecard, { vendorId: id });

  return c.json({
    success: true,
    data: {
      vendorId: id,
      vendorName: "Fisher Scientific",
      period: "Last 12 months",
      metrics: {
        totalOrders: 487,
        totalSpend: 1250000,
        onTimeRate: 0.96,
        invoiceExceptionRate: 0.02,
        avgLeadTime: 2.3,
        qualityIssues: 4,
      },
      performance: {
        overall: { score: 92, trend: "stable" },
        price: { score: 85, trend: "declining", note: "3% price increase observed" },
        quality: { score: 95, trend: "improving" },
        delivery: { score: 94, trend: "stable" },
        service: { score: 90, trend: "stable" },
        compliance: { score: 96, trend: "improving" },
      },
      comparisonToNetwork: {
        position: "Top 10%",
        avgScore: 87,
        bestInCategory: "VWR (94)",
      },
      recommendations: [
        "Renegotiate pricing - current rates 3% above network average",
        "Increase order consolidation to reduce shipping costs",
        "Consider for strategic partnership in lab supplies",
      ],
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// GET /vendors/diverse - Search diverse suppliers
vendorRoutes.get("/search/diverse", async (c) => {
  const category = c.req.query("category");
  const diversityTypes = c.req.query("types")?.split(",");

  // TODO: Call Convex to search diverse suppliers
  // const vendors = await convex.query(api.vendors.searchDiverse, { category, diversityTypes });

  return c.json({
    success: true,
    data: [
      {
        id: "vendor_chemsource",
        name: "ChemSource Inc.",
        diversityStatus: ["MWBE", "SBE"],
        categories: ["Chemicals", "Solvents"],
        owner: "Maria Rodriguez (Hispanic-owned)",
        location: "Newark, NJ",
        yearsInBusiness: 12,
        performance: {
          overallScore: 88,
          onTimeRate: 0.96,
        },
        contractStatus: "active",
        recommendation:
          "Excellent option for solvents. Can handle $100K+ annual volume.",
      },
      {
        id: "vendor_sigmasci",
        name: "Sigma Scientific",
        diversityStatus: ["WBE"],
        categories: ["Biochemicals", "Reagents"],
        owner: "Women-owned",
        location: "Boston, MA",
        yearsInBusiness: 8,
        performance: {
          overallScore: 85,
          onTimeRate: 0.94,
        },
        contractStatus: "active",
        recommendation: "Strong in specialty reagents. Growing capabilities.",
      },
    ],
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
      diversitySpendAnalysis: {
        currentSpend: 67450,
        targetSpend: 133500,
        gap: 66050,
        targetPercent: 15,
        currentPercent: 7.6,
      },
    },
  });
});

// GET /vendors/:id/risk - Get vendor risk assessment
vendorRoutes.get("/:id/risk", async (c) => {
  const id = c.req.param("id");

  return c.json({
    success: true,
    data: {
      vendorId: id,
      vendorName: "Fisher Scientific",
      assessmentDate: new Date().toISOString(),
      overallRiskScore: 15,
      riskLevel: "low",
      riskFactors: [
        {
          factor: "Financial Health",
          score: 10,
          weight: 0.3,
          details: "Parent company Thermo Fisher has strong financials",
        },
        {
          factor: "Supply Chain",
          score: 20,
          weight: 0.25,
          details: "Multiple distribution centers provide redundancy",
        },
        {
          factor: "Geographic",
          score: 15,
          weight: 0.15,
          details: "US-based operations, minimal international exposure",
        },
        {
          factor: "Dependency",
          score: 25,
          weight: 0.2,
          details: "High dependency on Thermo Fisher for some products",
        },
        {
          factor: "Compliance",
          score: 5,
          weight: 0.1,
          details: "Excellent regulatory compliance record",
        },
      ],
      supplyChainRisks: [
        {
          description: "Lab plastics supply depends on 3M Texas facility",
          probability: 0.15,
          impact: "medium",
          mitigationStrategy:
            "Pre-order 6-week buffer during hurricane season",
        },
      ],
      recommendations: [
        "Maintain current relationship",
        "Consider secondary supplier for high-volume plastics",
        "Schedule annual business review",
      ],
      nextReviewDate: new Date(
        Date.now() + 90 * 24 * 60 * 60 * 1000
      ).toISOString(),
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// PUT /vendors/:id/performance - Update vendor performance
vendorRoutes.put("/:id/performance", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  // TODO: Call Convex to update performance
  // await convex.mutation(api.vendors.updatePerformance, { vendorId: id, performance: body });

  return c.json({
    success: true,
    data: {
      vendorId: id,
      performance: body,
      updatedAt: new Date().toISOString(),
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});
