import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppContext } from "../types/context";
import { requirePermission } from "../middleware/auth";

export const universityRoutes = new Hono<AppContext>();

// Schemas
const createUniversitySchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(["R1", "R2", "liberal_arts", "community"]),
  region: z.string().min(1),
  annualSpend: z.number().positive(),
  settings: z
    .object({
      diversityTarget: z.number().min(0).max(100).default(15),
      sustainabilityTarget: z.number().min(0).max(100).default(10),
      autoApprovalLimit: z.number().min(0).default(500),
      timezone: z.string().default("America/New_York"),
    })
    .optional(),
});

const updateSubscriptionSchema = z.object({
  plan: z.enum(["flat", "performance", "hybrid", "trial"]),
  monthlyFee: z.number().min(0),
  savingsSharePercent: z.number().min(0).max(100),
  startDate: z.number(),
  endDate: z.number().optional(),
  cap: z.number().optional(),
});

// GET /universities - List all universities
universityRoutes.get("/", async (c) => {
  const type = c.req.query("type") as any;
  const region = c.req.query("region");

  // TODO: Call Convex to list universities
  // const universities = await convex.query(api.universities.list, { type, region });

  return c.json({
    success: true,
    data: [],
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
      pagination: {
        total: 0,
        limit: 50,
        offset: 0,
        hasMore: false,
      },
    },
  });
});

// POST /universities - Create a new university
universityRoutes.post(
  "/",
  requirePermission("write:all"),
  zValidator("json", createUniversitySchema),
  async (c) => {
    const data = c.req.valid("json");

    // TODO: Call Convex to create university
    // const universityId = await convex.mutation(api.universities.create, data);

    return c.json(
      {
        success: true,
        data: {
          id: "university_placeholder",
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
  }
);

// GET /universities/:id - Get university by ID
universityRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  // TODO: Call Convex to get university
  // const university = await convex.query(api.universities.get, { id });

  return c.json({
    success: true,
    data: {
      id,
      name: "Example University",
      type: "R1",
      region: "Northeast",
      annualSpend: 120000000,
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// GET /universities/:id/dashboard - Get dashboard stats
universityRoutes.get("/:id/dashboard", async (c) => {
  const id = c.req.param("id");

  // TODO: Call Convex to get dashboard stats
  // const stats = await convex.query(api.universities.getDashboardStats, { universityId: id });

  return c.json({
    success: true,
    data: {
      universityId: id,
      totalSavings: 1250000,
      verifiedSavings: 980000,
      savingsPercent: 3.2,
      pendingRequisitions: 23,
      pendingApprovalValue: 156000,
      activeAlerts: 5,
      criticalAlerts: 1,
      newAnomalies: 3,
      agentActivity: {
        executionsToday: 142,
        savingsFoundToday: 12500,
      },
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// PUT /universities/:id/subscription - Update subscription
universityRoutes.put(
  "/:id/subscription",
  requirePermission("write:all"),
  zValidator("json", updateSubscriptionSchema),
  async (c) => {
    const id = c.req.param("id");
    const data = c.req.valid("json");

    // TODO: Call Convex to update subscription
    // await convex.mutation(api.universities.updateSubscription, { id, ...data });

    return c.json({
      success: true,
      data: {
        universityId: id,
        subscription: data,
        updatedAt: new Date().toISOString(),
      },
      meta: {
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
      },
    });
  }
);

// GET /universities/pricing - Get pricing options
universityRoutes.get("/pricing/options", async (c) => {
  return c.json({
    success: true,
    data: {
      flat: {
        name: "Flat Subscription",
        price: "$30,000/month ($360K/year)",
        features: [
          "All 30 AI agents",
          "Unlimited users",
          "Full knowledge graph access",
          "Priority support",
          "Quarterly business reviews",
        ],
        bestFor: "Universities wanting predictable costs",
        breakEven: "Need to save >$360K/year",
      },
      performance: {
        name: "Performance-Based",
        price: "36% of verified cost savings",
        features: [
          "Same features as Flat",
          "Third-party savings verification available",
          "Quarterly true-up billing",
          "Cap at $1.5M/year",
        ],
        bestFor: "Risk-averse procurement teams",
        upside: "If we save $10M, we earn $3.6M",
      },
      hybrid: {
        name: "Hybrid",
        price: "$15,000/month base + 20% of savings above $1M",
        features: [
          "Guaranteed base revenue",
          "Aligned incentives",
          "Cap at $1M/year total",
        ],
        bestFor: "Pilot programs expanding to full deployment",
      },
      trial: {
        name: "45-Day Free Trial",
        price: "Free",
        phases: [
          {
            name: "Discovery (Week 1-2)",
            activities: [
              "Ingest top 10 vendor catalogs",
              "Connect to procurement system",
              "Deploy 5 core agents",
            ],
            deliverable: "Initial savings opportunity report",
          },
          {
            name: "Activation (Week 3-4)",
            activities: [
              "Enable price alerts",
              "Start invoice matching",
              "Deploy category agents",
            ],
            deliverable: "First verified savings captured",
          },
          {
            name: "Proof (Week 5-6)",
            activities: [
              "Full savings report",
              "ROI model",
              "Executive presentation",
            ],
            deliverable: "Business case for full deployment",
          },
        ],
        conversionTarget: "80%",
        expectedSavings: "$200K-$500K during trial",
      },
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// GET /universities/:id/trial - Get trial progress
universityRoutes.get("/:id/trial", async (c) => {
  const id = c.req.param("id");

  // TODO: Call Convex to get trial progress
  // const progress = await convex.query(api.trialProgress.get, { universityId: id });

  return c.json({
    success: true,
    data: {
      universityId: id,
      phase: "activation",
      week: 3,
      startDate: "2025-01-01",
      endDate: "2025-02-14",
      daysRemaining: 28,
      milestones: [
        { name: "Catalog ingestion", completed: true, completedAt: "2025-01-05" },
        { name: "System connection", completed: true, completedAt: "2025-01-07" },
        { name: "Core agents deployed", completed: true, completedAt: "2025-01-10" },
        { name: "Initial savings report", completed: true, completedAt: "2025-01-14" },
        { name: "Price alerts enabled", completed: true, completedAt: "2025-01-16" },
        { name: "Invoice matching started", completed: false },
        { name: "Category agents deployed", completed: false },
        { name: "Final savings report", completed: false },
        { name: "Executive presentation", completed: false },
      ],
      metrics: {
        vendorsCataloged: 8,
        productsIndexed: 125000,
        agentsDeployed: 12,
        savingsIdentified: 450000,
        savingsCaptured: 125000,
      },
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});
