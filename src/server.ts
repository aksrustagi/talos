import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { secureHeaders } from "hono/secure-headers";

// Routes
import { universityRoutes } from "./routes/universities";
import { productRoutes } from "./routes/products";
import { vendorRoutes } from "./routes/vendors";
import { requisitionRoutes } from "./routes/requisitions";
import { priceRoutes } from "./routes/prices";
import { agentRoutes } from "./routes/agents";
import { intelligenceRoutes } from "./routes/intelligence";
import { webhookRoutes } from "./routes/webhooks";
import { spendAnalyticsRoutes } from "./routes/spendAnalytics";
import { unimarketRoutes } from "./routes/unimarket";

// Middleware
import { authMiddleware } from "./middleware/auth";
import { rateLimiter } from "./middleware/rateLimiter";
import { errorHandler } from "./middleware/errorHandler";

// Types
import type { AppContext } from "./types/context";

const app = new Hono<AppContext>();

// Global middleware
app.use("*", logger());
app.use("*", cors());
app.use("*", prettyJSON());
app.use("*", secureHeaders());
app.use("*", errorHandler);

// Health check (no auth required)
app.get("/health", (c) => {
  return c.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    service: "talos-procurement-ai",
  });
});

// API info
app.get("/", (c) => {
  return c.json({
    name: "Talos - University Procurement AI Platform",
    version: "1.0.0",
    description: "Comprehensive AI-powered procurement platform for universities",
    documentation: "/docs",
    endpoints: {
      universities: "/api/v1/universities",
      products: "/api/v1/products",
      vendors: "/api/v1/vendors",
      requisitions: "/api/v1/requisitions",
      prices: "/api/v1/prices",
      agents: "/api/v1/agents",
      intelligence: "/api/v1/intelligence",
      webhooks: "/api/v1/webhooks",
      spend: "/api/v1/spend",
      unimarket: "/api/v1/unimarket",
    },
    pricing: {
      flat: "$30,000/month",
      performance: "36% of verified savings",
      hybrid: "$15,000/month + 20% of savings above $1M",
      trial: "45 days free",
    },
  });
});

// Apply rate limiting to API routes
app.use("/api/*", rateLimiter);

// Apply auth to API routes (except some public endpoints)
app.use("/api/*", authMiddleware);

// Mount API routes
const api = app.basePath("/api/v1");

api.route("/universities", universityRoutes);
api.route("/products", productRoutes);
api.route("/vendors", vendorRoutes);
api.route("/requisitions", requisitionRoutes);
api.route("/prices", priceRoutes);
api.route("/agents", agentRoutes);
api.route("/intelligence", intelligenceRoutes);
api.route("/webhooks", webhookRoutes);
api.route("/spend", spendAnalyticsRoutes);
api.route("/unimarket", unimarketRoutes);

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: "Not Found",
      message: `Route ${c.req.method} ${c.req.path} not found`,
      availableEndpoints: [
        "/api/v1/universities",
        "/api/v1/products",
        "/api/v1/vendors",
        "/api/v1/requisitions",
        "/api/v1/prices",
        "/api/v1/agents",
        "/api/v1/intelligence",
        "/api/v1/spend",
        "/api/v1/unimarket",
      ],
    },
    404
  );
});

// Start server
const port = parseInt(process.env.PORT || "3000");

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   🏛️  TALOS - University Procurement AI Platform                 ║
║                                                                  ║
║   Comprehensive AI-powered procurement intelligence              ║
║   30 AI agents • 6 Intelligence Systems • Full automation        ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║   Server starting on port ${port}                                    ║
║   Environment: ${process.env.NODE_ENV || "development"}                               ║
╚══════════════════════════════════════════════════════════════════╝
`);

serve({
  fetch: app.fetch,
  port,
});

export default app;
export type AppType = typeof app;
