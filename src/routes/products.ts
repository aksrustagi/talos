import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppContext } from "../types/context";

export const productRoutes = new Hono<AppContext>();

// Schemas
const createProductSchema = z.object({
  canonicalId: z.string().optional(),
  name: z.string().min(1).max(500),
  description: z.string(),
  categoryPath: z.array(z.string()),
  manufacturer: z.string(),
  manufacturerPartNumber: z.string(),
  unspscCode: z.string().optional(),
  specifications: z.record(z.any()).optional(),
  compliance: z
    .object({
      diversityCertified: z.boolean().default(false),
      sustainabilityRating: z.string().optional(),
      grantEligible: z.boolean().default(true),
      hazardClass: z.string().optional(),
      exportControlled: z.boolean().default(false),
    })
    .optional(),
});

const searchParamsSchema = z.object({
  q: z.string().optional(),
  manufacturer: z.string().optional(),
  category: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

// GET /products - Search products
productRoutes.get("/", async (c) => {
  const query = c.req.query("q");
  const manufacturer = c.req.query("manufacturer");
  const category = c.req.query("category");
  const limit = parseInt(c.req.query("limit") || "20");
  const offset = parseInt(c.req.query("offset") || "0");

  // TODO: Call Convex to search products
  // const products = await convex.query(api.products.search, { query, manufacturer, category, limit });

  return c.json({
    success: true,
    data: [],
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
      pagination: {
        total: 0,
        limit,
        offset,
        hasMore: false,
      },
    },
  });
});

// POST /products - Create a product
productRoutes.post("/", zValidator("json", createProductSchema), async (c) => {
  const data = c.req.valid("json");

  // Generate canonical ID if not provided
  const canonicalId = data.canonicalId || `PROD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // TODO: Call Convex to create product
  // const productId = await convex.mutation(api.products.create, { ...data, canonicalId });

  return c.json(
    {
      success: true,
      data: {
        id: "product_placeholder",
        canonicalId,
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

// GET /products/:id - Get product by ID
productRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  // TODO: Call Convex to get product with listings
  // const product = await convex.query(api.products.getWithListings, { productId: id });

  return c.json({
    success: true,
    data: {
      id,
      canonicalId: `PROD-${id}`,
      name: "50ml Conical Centrifuge Tubes",
      description: "Polypropylene, sterile, with caps",
      categoryPath: ["Lab Supplies", "Plasticware", "Tubes"],
      manufacturer: "Corning",
      manufacturerPartNumber: "430829",
      specifications: {
        volume: "50ml",
        material: "Polypropylene",
        sterile: true,
        graduated: true,
      },
      listings: [
        {
          vendorId: "vendor_fisher",
          vendorName: "Fisher Scientific",
          vendorSku: "14-959-53A",
          price: 42.0,
          packSize: 100,
          pricePerUnit: 0.42,
          availability: "in_stock",
          leadTimeDays: 2,
        },
        {
          vendorId: "vendor_vwr",
          vendorName: "VWR",
          vendorSku: "89039-656",
          price: 38.5,
          packSize: 100,
          pricePerUnit: 0.385,
          availability: "in_stock",
          leadTimeDays: 3,
        },
      ],
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// GET /products/:id/compare - Compare prices across vendors
productRoutes.get("/:id/compare", async (c) => {
  const id = c.req.param("id");

  // TODO: Call Convex to compare prices
  // const comparison = await convex.query(api.priceIntelligence.compareVendorPrices, { productId: id });

  return c.json({
    success: true,
    data: {
      productId: id,
      productName: "50ml Conical Centrifuge Tubes",
      comparison: [
        {
          rank: 1,
          vendor: "USA Scientific",
          sku: "1500-1211",
          pricePerUnit: 0.34,
          packSize: 100,
          totalPrice: 34.0,
          availability: "limited",
          leadTimeDays: 10,
          savings: "19% below average",
        },
        {
          rank: 2,
          vendor: "Greiner",
          sku: "227261",
          pricePerUnit: 0.36,
          packSize: 100,
          totalPrice: 36.0,
          availability: "in_stock",
          leadTimeDays: 7,
          savings: "14% below average",
        },
        {
          rank: 3,
          vendor: "VWR",
          sku: "89039-656",
          pricePerUnit: 0.385,
          packSize: 100,
          totalPrice: 38.5,
          availability: "in_stock",
          leadTimeDays: 3,
          savings: "8% below average",
        },
      ],
      summary: {
        lowestPrice: 0.34,
        highestPrice: 0.52,
        averagePrice: 0.42,
        priceSpread: "35%",
        vendorCount: 7,
        bestValue: "VWR (good price + fast delivery)",
      },
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// GET /products/:id/equivalents - Get equivalent products
productRoutes.get("/:id/equivalents", async (c) => {
  const id = c.req.param("id");

  // TODO: Call Convex to get equivalents
  // const equivalents = await convex.query(api.products.getEquivalentsWithListings, { productId: id });

  return c.json({
    success: true,
    data: {
      primaryProduct: {
        id,
        name: "50ml Conical Centrifuge Tubes",
        manufacturer: "Corning",
      },
      equivalents: [
        {
          id: "eq_1",
          name: "50ml Conical Tubes",
          manufacturer: "Fisher Scientific",
          mpn: "14-959-53A",
          equivalenceConfidence: 0.98,
          specifications: {
            volume: "50ml",
            material: "Polypropylene",
            sterile: true,
          },
          bestPrice: 0.42,
          bestVendor: "Fisher",
        },
        {
          id: "eq_2",
          name: "50ml PP Centrifuge Tubes",
          manufacturer: "Thermo",
          mpn: "339652",
          equivalenceConfidence: 0.95,
          specifications: {
            volume: "50ml",
            material: "Polypropylene",
            sterile: true,
          },
          bestPrice: 0.41,
          bestVendor: "Thermo Direct",
        },
      ],
      totalEquivalents: 7,
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// GET /products/:id/history - Get price history
productRoutes.get("/:id/history", async (c) => {
  const id = c.req.param("id");
  const days = parseInt(c.req.query("days") || "90");
  const vendorId = c.req.query("vendorId");

  // TODO: Call Convex to get price history
  // const history = await convex.query(api.priceIntelligence.getPriceHistory, { productId: id, days, vendorId });

  return c.json({
    success: true,
    data: {
      productId: id,
      period: { days },
      current: 0.42,
      minimum: 0.38,
      maximum: 0.52,
      average: 0.44,
      trend: "stable",
      history: [
        { date: "2024-10-01", price: 0.44 },
        { date: "2024-11-01", price: 0.45 },
        { date: "2024-12-01", price: 0.43 },
        { date: "2025-01-01", price: 0.42 },
      ],
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// POST /products/bulk - Bulk create products (catalog import)
productRoutes.post("/bulk", async (c) => {
  const body = await c.req.json();
  const products = body.products || [];

  // TODO: Call Convex to bulk create products
  // const ids = await convex.mutation(api.products.bulkCreate, { products });

  return c.json({
    success: true,
    data: {
      imported: products.length,
      created: products.length,
      updated: 0,
      failed: 0,
      errors: [],
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// GET /products/categories - Get product categories
productRoutes.get("/categories/tree", async (c) => {
  return c.json({
    success: true,
    data: [
      {
        name: "Lab Supplies",
        count: 125000,
        children: [
          {
            name: "Plasticware",
            count: 15000,
            children: [
              { name: "Tubes", count: 3000 },
              { name: "Plates", count: 2500 },
              { name: "Pipette Tips", count: 4000 },
            ],
          },
          {
            name: "Chemicals",
            count: 45000,
            children: [
              { name: "Solvents", count: 8000 },
              { name: "Reagents", count: 20000 },
              { name: "Buffers", count: 5000 },
            ],
          },
          {
            name: "Equipment",
            count: 12000,
          },
        ],
      },
      {
        name: "Office Supplies",
        count: 85000,
        children: [
          { name: "Paper Products", count: 15000 },
          { name: "Writing Instruments", count: 8000 },
          { name: "Filing & Storage", count: 12000 },
        ],
      },
      {
        name: "IT Equipment",
        count: 45000,
        children: [
          { name: "Computers", count: 8000 },
          { name: "Peripherals", count: 15000 },
          { name: "Networking", count: 5000 },
        ],
      },
    ],
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});
