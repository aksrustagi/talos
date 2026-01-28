/**
 * UniMarket Integration Routes
 *
 * API endpoints for UniMarket marketplace integration including:
 * - Product catalog search and sync
 * - Shopping cart operations
 * - Purchase order management
 * - Invoice processing
 * - PunchOut sessions
 * - Webhooks for real-time updates
 */

import { Hono } from "hono";
import type { AppContext } from "../types/context";
import {
  createUniMarketClient,
  UniMarketIntegration,
  UniMarketConfig,
} from "../integrations/unimarket";

export const unimarketRoutes = new Hono<AppContext>();

// Get UniMarket client from environment config
function getUniMarketClient(): UniMarketIntegration {
  const config: UniMarketConfig = {
    baseUrl: process.env.UNIMARKET_BASE_URL || "https://api.unimarket.com/v2",
    apiKey: process.env.UNIMARKET_API_KEY || "",
    apiSecret: process.env.UNIMARKET_API_SECRET || "",
    organizationId: process.env.UNIMARKET_ORG_ID || "",
    environment: (process.env.UNIMARKET_ENV as "sandbox" | "production") || "production",
    webhookSecret: process.env.UNIMARKET_WEBHOOK_SECRET,
    timeout: parseInt(process.env.UNIMARKET_TIMEOUT || "30000"),
  };
  return createUniMarketClient(config);
}

// ============================================
// Product Catalog Endpoints
// ============================================

// GET /unimarket/products/search - Search products
unimarketRoutes.get("/products/search", async (c) => {
  const query = c.req.query("q") || "";
  const category = c.req.query("category");
  const vendor = c.req.query("vendor");
  const priceMin = c.req.query("priceMin") ? parseFloat(c.req.query("priceMin")!) : undefined;
  const priceMax = c.req.query("priceMax") ? parseFloat(c.req.query("priceMax")!) : undefined;
  const inStockOnly = c.req.query("inStockOnly") === "true";
  const certifications = c.req.query("certifications")?.split(",");
  const page = parseInt(c.req.query("page") || "1");
  const pageSize = parseInt(c.req.query("pageSize") || "50");

  const client = getUniMarketClient();
  const result = await client.searchProducts(query, {
    category,
    vendor,
    priceMin,
    priceMax,
    inStockOnly,
    certifications,
    page,
    pageSize,
  });

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
    meta: {
      query,
      pagination: result.meta?.pagination,
      timestamp: new Date().toISOString(),
    },
  });
});

// GET /unimarket/products/:productId - Get product details
unimarketRoutes.get("/products/:productId", async (c) => {
  const productId = c.req.param("productId");
  const client = getUniMarketClient();
  const result = await client.getProduct(productId);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 404);
  }

  return c.json({
    success: true,
    data: result.data,
  });
});

// GET /unimarket/products/:productId/pricing - Get product pricing
unimarketRoutes.get("/products/:productId/pricing", async (c) => {
  const productId = c.req.param("productId");
  const quantity = c.req.query("quantity") ? parseInt(c.req.query("quantity")!) : undefined;

  const client = getUniMarketClient();
  const result = await client.getProductPricing(productId, quantity);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
  });
});

// GET /unimarket/products/:productId/compare - Compare prices across vendors
unimarketRoutes.get("/products/:productId/compare", async (c) => {
  const productId = c.req.param("productId");
  const client = getUniMarketClient();
  const result = await client.compareProductPrices(productId);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
  });
});

// POST /unimarket/catalog/sync - Trigger catalog sync
unimarketRoutes.post("/catalog/sync", async (c) => {
  const body = await c.req.json();
  const { vendorId, fullSync, since } = body;

  const client = getUniMarketClient();
  const result = await client.syncCatalog(vendorId, { fullSync, since });

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
    meta: {
      message: "Catalog sync initiated",
      timestamp: new Date().toISOString(),
    },
  });
});

// GET /unimarket/catalog/sync/:syncId - Get sync status
unimarketRoutes.get("/catalog/sync/:syncId", async (c) => {
  const syncId = c.req.param("syncId");
  const client = getUniMarketClient();
  const result = await client.getCatalogSyncStatus(syncId);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
  });
});

// ============================================
// Shopping Cart Endpoints
// ============================================

// POST /unimarket/cart - Create new cart
unimarketRoutes.post("/cart", async (c) => {
  const body = await c.req.json();
  const { userId } = body;

  if (!userId) {
    return c.json({ success: false, error: { code: "INVALID_INPUT", message: "userId is required" } }, 400);
  }

  const client = getUniMarketClient();
  const result = await client.createCart(userId);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
  }, 201);
});

// GET /unimarket/cart/:cartId - Get cart
unimarketRoutes.get("/cart/:cartId", async (c) => {
  const cartId = c.req.param("cartId");
  const client = getUniMarketClient();
  const result = await client.getCart(cartId);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 404);
  }

  return c.json({
    success: true,
    data: result.data,
  });
});

// POST /unimarket/cart/:cartId/items - Add item to cart
unimarketRoutes.post("/cart/:cartId/items", async (c) => {
  const cartId = c.req.param("cartId");
  const body = await c.req.json();

  const client = getUniMarketClient();
  const result = await client.addToCart(cartId, body);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
  });
});

// PUT /unimarket/cart/:cartId/items/:productId - Update cart item
unimarketRoutes.put("/cart/:cartId/items/:productId", async (c) => {
  const cartId = c.req.param("cartId");
  const productId = c.req.param("productId");
  const body = await c.req.json();

  const client = getUniMarketClient();
  const result = await client.updateCartItem(cartId, productId, body.quantity);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
  });
});

// DELETE /unimarket/cart/:cartId/items/:productId - Remove item from cart
unimarketRoutes.delete("/cart/:cartId/items/:productId", async (c) => {
  const cartId = c.req.param("cartId");
  const productId = c.req.param("productId");

  const client = getUniMarketClient();
  const result = await client.removeFromCart(cartId, productId);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
  });
});

// POST /unimarket/cart/:cartId/submit - Submit cart for ordering
unimarketRoutes.post("/cart/:cartId/submit", async (c) => {
  const cartId = c.req.param("cartId");
  const body = await c.req.json();

  const client = getUniMarketClient();
  const result = await client.submitCart(cartId, body);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
    meta: {
      message: "Cart submitted successfully",
      timestamp: new Date().toISOString(),
    },
  });
});

// ============================================
// Purchase Order Endpoints
// ============================================

// POST /unimarket/orders - Create purchase order
unimarketRoutes.post("/orders", async (c) => {
  const body = await c.req.json();

  const client = getUniMarketClient();
  const result = await client.createPurchaseOrder(body);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
  }, 201);
});

// GET /unimarket/orders - List purchase orders
unimarketRoutes.get("/orders", async (c) => {
  const status = c.req.query("status");
  const vendorId = c.req.query("vendorId");
  const fromDate = c.req.query("fromDate");
  const toDate = c.req.query("toDate");
  const page = parseInt(c.req.query("page") || "1");
  const pageSize = parseInt(c.req.query("pageSize") || "50");

  const client = getUniMarketClient();
  const result = await client.getPurchaseOrders({
    status,
    vendorId,
    fromDate,
    toDate,
    page,
    pageSize,
  });

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
    meta: {
      pagination: result.meta?.pagination,
      timestamp: new Date().toISOString(),
    },
  });
});

// GET /unimarket/orders/:poNumber - Get purchase order
unimarketRoutes.get("/orders/:poNumber", async (c) => {
  const poNumber = c.req.param("poNumber");
  const client = getUniMarketClient();
  const result = await client.getPurchaseOrder(poNumber);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 404);
  }

  return c.json({
    success: true,
    data: result.data,
  });
});

// PATCH /unimarket/orders/:poNumber/status - Update order status
unimarketRoutes.patch("/orders/:poNumber/status", async (c) => {
  const poNumber = c.req.param("poNumber");
  const body = await c.req.json();

  const client = getUniMarketClient();
  const result = await client.updatePurchaseOrderStatus(poNumber, body.status, body.notes);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
  });
});

// POST /unimarket/orders/:poNumber/cancel - Cancel order
unimarketRoutes.post("/orders/:poNumber/cancel", async (c) => {
  const poNumber = c.req.param("poNumber");
  const body = await c.req.json();

  const client = getUniMarketClient();
  const result = await client.cancelPurchaseOrder(poNumber, body.reason);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
  });
});

// POST /unimarket/orders/:poNumber/transmit - Transmit order to vendor
unimarketRoutes.post("/orders/:poNumber/transmit", async (c) => {
  const poNumber = c.req.param("poNumber");
  const body = await c.req.json();

  const client = getUniMarketClient();
  const result = await client.transmitPurchaseOrder(poNumber, body.method || "api");

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
  });
});

// GET /unimarket/orders/:poNumber/tracking - Get order tracking
unimarketRoutes.get("/orders/:poNumber/tracking", async (c) => {
  const poNumber = c.req.param("poNumber");
  const client = getUniMarketClient();
  const result = await client.getOrderTracking(poNumber);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
  });
});

// ============================================
// Invoice Endpoints
// ============================================

// GET /unimarket/invoices - List invoices
unimarketRoutes.get("/invoices", async (c) => {
  const status = c.req.query("status");
  const vendorId = c.req.query("vendorId");
  const poNumber = c.req.query("poNumber");
  const fromDate = c.req.query("fromDate");
  const toDate = c.req.query("toDate");
  const page = parseInt(c.req.query("page") || "1");
  const pageSize = parseInt(c.req.query("pageSize") || "50");

  const client = getUniMarketClient();
  const result = await client.getInvoices({
    status,
    vendorId,
    poNumber,
    fromDate,
    toDate,
    page,
    pageSize,
  });

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
    meta: {
      pagination: result.meta?.pagination,
      timestamp: new Date().toISOString(),
    },
  });
});

// GET /unimarket/invoices/:invoiceNumber - Get invoice
unimarketRoutes.get("/invoices/:invoiceNumber", async (c) => {
  const invoiceNumber = c.req.param("invoiceNumber");
  const client = getUniMarketClient();
  const result = await client.getInvoice(invoiceNumber);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 404);
  }

  return c.json({
    success: true,
    data: result.data,
  });
});

// POST /unimarket/invoices/:invoiceNumber/match - Match invoice
unimarketRoutes.post("/invoices/:invoiceNumber/match", async (c) => {
  const invoiceNumber = c.req.param("invoiceNumber");
  const client = getUniMarketClient();
  const result = await client.matchInvoice(invoiceNumber);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
  });
});

// POST /unimarket/invoices/:invoiceNumber/approve - Approve invoice
unimarketRoutes.post("/invoices/:invoiceNumber/approve", async (c) => {
  const invoiceNumber = c.req.param("invoiceNumber");
  const body = await c.req.json();

  const client = getUniMarketClient();
  const result = await client.approveInvoice(invoiceNumber, body.approverId, body.notes);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
  });
});

// POST /unimarket/invoices/:invoiceNumber/dispute - Dispute invoice
unimarketRoutes.post("/invoices/:invoiceNumber/dispute", async (c) => {
  const invoiceNumber = c.req.param("invoiceNumber");
  const body = await c.req.json();

  const client = getUniMarketClient();
  const result = await client.disputeInvoice(invoiceNumber, body.reason, body.lineNumbers);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
  });
});

// ============================================
// PunchOut Endpoints
// ============================================

// POST /unimarket/punchout/sessions - Initiate PunchOut
unimarketRoutes.post("/punchout/sessions", async (c) => {
  const body = await c.req.json();
  const { vendorId, userId, returnUrl, operation, existingCartId } = body;

  const client = getUniMarketClient();
  const result = await client.initiatePunchOut(vendorId, userId, returnUrl, {
    operation,
    existingCartId,
  });

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
  }, 201);
});

// GET /unimarket/punchout/sessions/:sessionId - Get PunchOut session
unimarketRoutes.get("/punchout/sessions/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const client = getUniMarketClient();
  const result = await client.getPunchOutSession(sessionId);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 404);
  }

  return c.json({
    success: true,
    data: result.data,
  });
});

// POST /unimarket/punchout/sessions/:sessionId/complete - Complete PunchOut
unimarketRoutes.post("/punchout/sessions/:sessionId/complete", async (c) => {
  const sessionId = c.req.param("sessionId");
  const contentType = c.req.header("content-type") || "";

  let cartData: string;
  if (contentType.includes("application/xml") || contentType.includes("text/xml")) {
    cartData = await c.req.text();
  } else {
    const body = await c.req.json();
    cartData = body.cartData;
  }

  const client = getUniMarketClient();
  const result = await client.completePunchOut(sessionId, cartData);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
  });
});

// ============================================
// Vendor Endpoints
// ============================================

// GET /unimarket/vendors - List vendors
unimarketRoutes.get("/vendors", async (c) => {
  const category = c.req.query("category");
  const diversityStatus = c.req.query("diversityStatus")?.split(",");
  const certifications = c.req.query("certifications")?.split(",");
  const page = parseInt(c.req.query("page") || "1");
  const pageSize = parseInt(c.req.query("pageSize") || "50");

  const client = getUniMarketClient();
  const result = await client.getVendors({
    category,
    diversityStatus,
    certifications,
    page,
    pageSize,
  });

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
    meta: {
      pagination: result.meta?.pagination,
      timestamp: new Date().toISOString(),
    },
  });
});

// GET /unimarket/vendors/:vendorId - Get vendor details
unimarketRoutes.get("/vendors/:vendorId", async (c) => {
  const vendorId = c.req.param("vendorId");
  const client = getUniMarketClient();
  const result = await client.getVendor(vendorId);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 404);
  }

  return c.json({
    success: true,
    data: result.data,
  });
});

// GET /unimarket/vendors/:vendorId/performance - Get vendor performance
unimarketRoutes.get("/vendors/:vendorId/performance", async (c) => {
  const vendorId = c.req.param("vendorId");
  const client = getUniMarketClient();
  const result = await client.getVendorPerformance(vendorId);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
  });
});

// ============================================
// Inventory Endpoints
// ============================================

// POST /unimarket/inventory/check - Check inventory
unimarketRoutes.post("/inventory/check", async (c) => {
  const body = await c.req.json();

  const client = getUniMarketClient();
  const result = await client.checkInventory(body.items);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
  });
});

// POST /unimarket/inventory/subscribe - Subscribe to inventory updates
unimarketRoutes.post("/inventory/subscribe", async (c) => {
  const body = await c.req.json();

  const client = getUniMarketClient();
  const result = await client.subscribeToInventoryUpdates(body.productIds, body.webhookUrl);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
  }, 201);
});

// ============================================
// Contract Endpoints
// ============================================

// GET /unimarket/contracts - List contracts
unimarketRoutes.get("/contracts", async (c) => {
  const vendorId = c.req.query("vendorId");
  const status = c.req.query("status") as "active" | "expired" | "pending" | undefined;
  const expiringWithinDays = c.req.query("expiringWithinDays")
    ? parseInt(c.req.query("expiringWithinDays")!)
    : undefined;

  const client = getUniMarketClient();
  const result = await client.getContracts({
    vendorId,
    status,
    expiringWithinDays,
  });

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
  });
});

// GET /unimarket/contracts/price/:vendorId/:productId - Get contract price
unimarketRoutes.get("/contracts/price/:vendorId/:productId", async (c) => {
  const vendorId = c.req.param("vendorId");
  const productId = c.req.param("productId");
  const quantity = c.req.query("quantity") ? parseInt(c.req.query("quantity")!) : undefined;

  const client = getUniMarketClient();
  const result = await client.getContractPrice(productId, vendorId, quantity);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
  });
});

// ============================================
// Reports Endpoints
// ============================================

// GET /unimarket/reports/spend - Get spend report
unimarketRoutes.get("/reports/spend", async (c) => {
  const fromDate = c.req.query("fromDate");
  const toDate = c.req.query("toDate");
  const groupBy = c.req.query("groupBy") as "vendor" | "category" | "department" | "month" | undefined;

  if (!fromDate || !toDate) {
    return c.json({
      success: false,
      error: { code: "INVALID_INPUT", message: "fromDate and toDate are required" },
    }, 400);
  }

  const client = getUniMarketClient();
  const result = await client.getSpendReport({ fromDate, toDate, groupBy });

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
  });
});

// GET /unimarket/reports/savings - Get savings report
unimarketRoutes.get("/reports/savings", async (c) => {
  const fromDate = c.req.query("fromDate");
  const toDate = c.req.query("toDate");

  if (!fromDate || !toDate) {
    return c.json({
      success: false,
      error: { code: "INVALID_INPUT", message: "fromDate and toDate are required" },
    }, 400);
  }

  const client = getUniMarketClient();
  const result = await client.getSavingsReport({ fromDate, toDate });

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.data,
  });
});

// ============================================
// Webhook Endpoints
// ============================================

// POST /unimarket/webhooks - Receive UniMarket webhooks
unimarketRoutes.post("/webhooks", async (c) => {
  const signature = c.req.header("X-UniMarket-Signature");
  const payload = await c.req.text();

  const client = getUniMarketClient();

  // Verify signature if webhook secret is configured
  if (process.env.UNIMARKET_WEBHOOK_SECRET) {
    if (!signature || !client.verifyWebhookSignature(payload, signature)) {
      return c.json({
        success: false,
        error: { code: "INVALID_SIGNATURE", message: "Invalid webhook signature" },
      }, 401);
    }
  }

  const event = client.parseWebhookEvent(payload);
  if (!event) {
    return c.json({
      success: false,
      error: { code: "INVALID_PAYLOAD", message: "Invalid webhook payload" },
    }, 400);
  }

  // Process different event types
  console.log(`UniMarket webhook received: ${event.eventType}`, {
    eventId: event.eventId,
    timestamp: event.timestamp,
  });

  switch (event.eventType) {
    case "catalog.updated":
    case "catalog.product.added":
    case "catalog.product.removed":
    case "catalog.price.changed":
      // Trigger Catalog Sync Agent
      console.log("Catalog event - triggering sync agent");
      break;

    case "order.created":
    case "order.confirmed":
    case "order.shipped":
    case "order.delivered":
    case "order.cancelled":
      // Update order status and notify
      console.log("Order event - updating status");
      break;

    case "invoice.received":
    case "invoice.matched":
    case "invoice.exception":
      // Trigger Invoice Matching Agent
      console.log("Invoice event - triggering matching agent");
      break;

    case "inventory.updated":
      // Update product availability
      console.log("Inventory event - updating availability");
      break;

    case "punchout.completed":
      // Process PunchOut cart
      console.log("PunchOut completed - processing cart");
      break;

    default:
      console.log(`Unknown event type: ${event.eventType}`);
  }

  return c.json({
    success: true,
    data: {
      received: true,
      eventId: event.eventId,
      eventType: event.eventType,
    },
  });
});

// GET /unimarket/health - Health check
unimarketRoutes.get("/health", async (c) => {
  return c.json({
    status: "healthy",
    service: "unimarket-integration",
    endpoints: {
      products: "active",
      cart: "active",
      orders: "active",
      invoices: "active",
      punchout: "active",
      vendors: "active",
      inventory: "active",
      contracts: "active",
      reports: "active",
      webhooks: "active",
    },
    timestamp: new Date().toISOString(),
  });
});

export default unimarketRoutes;
