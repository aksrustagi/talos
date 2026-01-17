import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppContext } from "../types/context";

export const priceRoutes = new Hono<AppContext>();

// Schemas
const createAlertSchema = z.object({
  productId: z.string(),
  alertType: z.enum([
    "price_drop",
    "price_increase",
    "target_price",
    "contract_violation",
    "better_price_found",
  ]),
  threshold: z.number().optional(),
  targetPrice: z.number().optional(),
});

// GET /prices/alerts - Get active price alerts
priceRoutes.get("/alerts", async (c) => {
  const user = c.get("user");

  // TODO: Call Convex to get alerts
  // const alerts = await convex.query(api.priceIntelligence.getActiveAlerts, { userId: user.userId });

  return c.json({
    success: true,
    data: [
      {
        id: "alert_001",
        productId: "prod_tubes",
        productName: "50ml Conical Tubes",
        alertType: "target_price",
        targetPrice: 0.4,
        currentPrice: 0.47,
        isActive: true,
        triggeredCount: 0,
        hmmPrediction: {
          probability: 0.62,
          expectedDate: "2025-02-28",
          confidence: 0.78,
        },
      },
      {
        id: "alert_002",
        productId: "prod_tips",
        productName: "Pipette Tips 200μl",
        alertType: "price_increase",
        threshold: 10,
        currentPrice: 0.038,
        isActive: true,
        triggeredCount: 2,
        lastTriggeredAt: "2025-01-10T08:00:00Z",
      },
    ],
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// POST /prices/alerts - Create price alert
priceRoutes.post("/alerts", zValidator("json", createAlertSchema), async (c) => {
  const data = c.req.valid("json");
  const user = c.get("user");

  // TODO: Call Convex to create alert
  // const alertId = await convex.mutation(api.priceIntelligence.createAlert, {
  //   universityId: user.universityId,
  //   userId: user.userId,
  //   ...data,
  // });

  return c.json(
    {
      success: true,
      data: {
        id: "alert_new",
        ...data,
        isActive: true,
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

// GET /prices/notifications - Get unacknowledged notifications
priceRoutes.get("/notifications", async (c) => {
  const limit = parseInt(c.req.query("limit") || "50");

  // TODO: Call Convex to get notifications
  // const notifications = await convex.query(api.priceIntelligence.getUnacknowledgedNotifications, { limit });

  return c.json({
    success: true,
    data: [
      {
        id: "notif_001",
        alertId: "alert_002",
        productId: "prod_tubes",
        productName: "50ml Conical Tubes",
        vendorName: "Fisher Scientific",
        previousPrice: 0.42,
        currentPrice: 0.47,
        changePercent: 11.9,
        alertLevel: "high",
        message: "Price increased by 11.9% - above your 10% threshold",
        recommendedAction:
          "VWR offers equivalent at $0.385 - switch saves $1,020/year",
        annualImpact: 600,
        acknowledged: false,
        createdAt: "2025-01-15T08:00:00Z",
      },
    ],
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
      unacknowledgedCount: 1,
    },
  });
});

// POST /prices/notifications/:id/acknowledge - Acknowledge notification
priceRoutes.post("/notifications/:id/acknowledge", async (c) => {
  const id = c.req.param("id");

  // TODO: Call Convex to acknowledge
  // await convex.mutation(api.priceIntelligence.acknowledgeNotification, { notificationId: id });

  return c.json({
    success: true,
    data: {
      notificationId: id,
      acknowledged: true,
      acknowledgedAt: new Date().toISOString(),
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// GET /prices/state/:productId - Get HMM price state prediction
priceRoutes.get("/state/:productId", async (c) => {
  const productId = c.req.param("productId");

  // TODO: Call Convex to get price state
  // const state = await convex.query(api.priceIntelligence.getLatestPriceState, { productId });

  return c.json({
    success: true,
    data: {
      productId,
      productName: "50ml Conical Tubes",
      currentState: "rising",
      stateProbability: 0.78,
      predictions: {
        day7: { price: 0.48, confidence: 0.82 },
        day30: { price: 0.46, confidence: 0.71 },
        day90: { price: 0.44, confidence: 0.65 },
      },
      observedEmissions: {
        priceChange: 0.03,
        volumeIndicator: 0.6,
        seasonalIndicator: 0.8,
        newsIndicator: 0.2,
      },
      recommendation: "wait",
      waitUntil: "2025-03-01",
      expectedSavings: 3600,
      reasoning:
        "Price currently in RISING state but model predicts transition to DECLINING within 45 days. Historical pattern shows Q1 promotional pricing.",
      historicalAccuracy: 0.82,
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
      modelVersion: "hmm-v2.1",
    },
  });
});

// GET /prices/trends - Get price trends analysis
priceRoutes.get("/trends", async (c) => {
  const category = c.req.query("category");
  const days = parseInt(c.req.query("days") || "90");

  return c.json({
    success: true,
    data: {
      period: { days },
      category: category || "all",
      summary: {
        averageChange: 2.3,
        itemsIncreased: 4521,
        itemsDecreased: 1234,
        itemsStable: 12456,
      },
      byCategory: [
        {
          category: "Lab Supplies",
          averageChange: 3.1,
          topIncreases: [
            { product: "Pipette Tips", change: 8.2 },
            { product: "Conical Tubes", change: 6.5 },
          ],
          topDecreases: [
            { product: "Nitrile Gloves", change: -12.3 },
            { product: "Petri Dishes", change: -3.2 },
          ],
        },
        {
          category: "Office Supplies",
          averageChange: 1.8,
        },
        {
          category: "IT Equipment",
          averageChange: -2.1,
        },
      ],
      seasonalPatterns: [
        {
          pattern: "Q1 Budget Flush",
          period: "Jan-Feb",
          effect: "Prices 5-8% higher due to demand",
        },
        {
          pattern: "Fiscal Year End Deals",
          period: "May-Jun",
          effect: "Best prices of the year",
        },
        {
          pattern: "Back to School",
          period: "Jul-Aug",
          effect: "Office supplies spike 10-15%",
        },
      ],
      recommendations: [
        {
          category: "Lab Plasticware",
          action: "Buy now",
          reason: "Entering PEAK state, defer only 6-week buffer orders",
        },
        {
          category: "Gloves/PPE",
          action: "Stock up",
          reason: "Prices at 2-year low, expected to rise in Q2",
        },
      ],
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// GET /prices/savings - Get savings summary
priceRoutes.get("/savings", async (c) => {
  const user = c.get("user");
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");

  // TODO: Call Convex to get savings summary
  // const summary = await convex.query(api.priceIntelligence.getSavingsSummary, {
  //   universityId: user.universityId,
  //   startDate: startDate ? parseInt(startDate) : undefined,
  //   endDate: endDate ? parseInt(endDate) : undefined,
  // });

  return c.json({
    success: true,
    data: {
      totalSavings: 1250000,
      verifiedSavings: 980000,
      period: "Last 12 months",
      byType: {
        price_reduction: { count: 234, amount: 450000 },
        vendor_switch: { count: 89, amount: 320000 },
        contract_negotiation: { count: 12, amount: 280000 },
        timing_optimization: { count: 45, amount: 85000 },
        error_recovery: { count: 67, amount: 78000 },
        early_pay_discount: { count: 156, amount: 37000 },
      },
      byAgent: {
        "price-watch": { count: 234, amount: 450000 },
        "price-compare": { count: 89, amount: 320000 },
        "contract-validator": { count: 67, amount: 78000 },
        "negotiation-optimizer": { count: 12, amount: 280000 },
        "historical-price": { count: 45, amount: 85000 },
        "payment-optimizer": { count: 156, amount: 37000 },
      },
      monthlyTrend: [
        { month: "2024-02", savings: 85000 },
        { month: "2024-03", savings: 92000 },
        { month: "2024-04", savings: 98000 },
        { month: "2024-05", savings: 125000 },
        { month: "2024-06", savings: 110000 },
        { month: "2024-07", savings: 95000 },
        { month: "2024-08", savings: 88000 },
        { month: "2024-09", savings: 102000 },
        { month: "2024-10", savings: 115000 },
        { month: "2024-11", savings: 130000 },
        { month: "2024-12", savings: 118000 },
        { month: "2025-01", savings: 92000 },
      ],
      roi: {
        platformCost: 360000,
        totalSavings: 1250000,
        netBenefit: 890000,
        roiPercent: 347,
      },
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// POST /prices/record - Record a price observation
priceRoutes.post("/record", async (c) => {
  const body = await c.req.json();
  const { productId, vendorId, price, pricePerUnit, listPrice, source } = body;

  // TODO: Call Convex to record price
  // const priceHistoryId = await convex.mutation(api.priceIntelligence.recordPrice, {
  //   productId,
  //   vendorId,
  //   price,
  //   pricePerUnit,
  //   listPrice,
  //   source,
  // });

  return c.json(
    {
      success: true,
      data: {
        id: "price_record_new",
        productId,
        vendorId,
        price,
        pricePerUnit,
        recordedAt: new Date().toISOString(),
      },
      meta: {
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
      },
    },
    201
  );
});

// GET /prices/benchmark/:productId - Get network price benchmark
priceRoutes.get("/benchmark/:productId", async (c) => {
  const productId = c.req.param("productId");

  return c.json({
    success: true,
    data: {
      productId,
      productName: "Dell Latitude 5540",
      yourPrice: 1199,
      networkBenchmark: {
        minimum: 1089,
        maximum: 1199,
        average: 1115,
        median: 1112,
        percentile: 95,
        positionNote: "You're paying 7.5% above network average",
      },
      networkPrices: [
        { university: "MIT", price: 1089, volume: 2500, contractDate: "2024-08" },
        { university: "Stanford", price: 1095, volume: 3200, contractDate: "2024-06" },
        { university: "Duke", price: 1112, volume: 1800, contractDate: "2024-09" },
        { university: "Princeton", price: 1145, volume: 900, contractDate: "2024-03" },
        { university: "You (Columbia)", price: 1199, volume: 1200, contractDate: "2023-11" },
      ],
      recommendation: {
        action: "Renegotiate contract",
        targetPrice: 1089,
        potentialSavings: 132000,
        leverage: [
          "MIT's $1,089 pricing as benchmark",
          "Dell fiscal year ends Jan 31",
          "Offer volume increase to 1,500 units",
        ],
      },
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
      dataSource: "knowledge-graph",
      universitiesInNetwork: 23,
    },
  });
});
