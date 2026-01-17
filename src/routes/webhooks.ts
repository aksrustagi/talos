import { Hono } from "hono";
import type { AppContext } from "../types/context";

export const webhookRoutes = new Hono<AppContext>();

// POST /webhooks/vendor/:vendorCode/catalog - Receive catalog updates from vendors
webhookRoutes.post("/vendor/:vendorCode/catalog", async (c) => {
  const vendorCode = c.req.param("vendorCode");
  const body = await c.req.json();

  // Validate webhook signature if provided
  const signature = c.req.header("X-Webhook-Signature");

  // TODO: Process catalog update
  // 1. Validate signature
  // 2. Parse catalog data
  // 3. Trigger Catalog Sync Agent

  console.log(`Received catalog webhook from ${vendorCode}`);

  return c.json({
    success: true,
    data: {
      vendorCode,
      received: true,
      processingId: `proc_${Date.now()}`,
      status: "queued",
      estimatedProcessingTime: "5-10 minutes",
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
});

// POST /webhooks/vendor/:vendorCode/invoice - Receive invoices from vendors
webhookRoutes.post("/vendor/:vendorCode/invoice", async (c) => {
  const vendorCode = c.req.param("vendorCode");
  const body = await c.req.json();

  // TODO: Process invoice
  // 1. Validate cXML/EDI format
  // 2. Store invoice
  // 3. Trigger Invoice Matching Agent

  return c.json({
    success: true,
    data: {
      vendorCode,
      invoiceId: body.invoiceNumber || "unknown",
      received: true,
      status: "queued_for_matching",
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
});

// POST /webhooks/vendor/:vendorCode/shipment - Receive shipment updates
webhookRoutes.post("/vendor/:vendorCode/shipment", async (c) => {
  const vendorCode = c.req.param("vendorCode");
  const body = await c.req.json();

  // TODO: Process shipment update
  // 1. Update order status
  // 2. Notify requester if delivered
  // 3. Trigger Receipt Agent

  return c.json({
    success: true,
    data: {
      vendorCode,
      trackingNumber: body.trackingNumber,
      status: body.status,
      received: true,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
});

// POST /webhooks/slack/events - Receive Slack events (purchase requests)
webhookRoutes.post("/slack/events", async (c) => {
  const body = await c.req.json();

  // Handle Slack URL verification challenge
  if (body.type === "url_verification") {
    return c.json({ challenge: body.challenge });
  }

  // Handle events
  if (body.type === "event_callback") {
    const event = body.event;

    // Handle app_mention or message events
    if (event.type === "app_mention" || event.type === "message") {
      // Check if it's a purchase request
      const text = event.text?.toLowerCase() || "";

      if (
        text.includes("order") ||
        text.includes("buy") ||
        text.includes("need") ||
        text.includes("purchase")
      ) {
        // TODO: Trigger Requisition Agent
        console.log(`Slack purchase request: ${event.text}`);

        // Return success - we'll process async
        return c.json({ ok: true });
      }
    }
  }

  return c.json({ ok: true });
});

// POST /webhooks/slack/commands - Handle Slack slash commands
webhookRoutes.post("/slack/commands", async (c) => {
  const formData = await c.req.parseBody();
  const command = formData.command;
  const text = formData.text;
  const userId = formData.user_id;
  const channelId = formData.channel_id;
  const responseUrl = formData.response_url;

  // Handle different commands
  switch (command) {
    case "/purchase":
      // Trigger Requisition Agent
      return c.json({
        response_type: "in_channel",
        text: `🛒 Processing your purchase request: "${text}"`,
        attachments: [
          {
            text: "I'm analyzing your request and will provide a summary shortly...",
            color: "#36a64f",
          },
        ],
      });

    case "/price-check":
      // Trigger Price Compare Agent
      return c.json({
        response_type: "ephemeral",
        text: `🔍 Checking prices for: "${text}"`,
        attachments: [
          {
            text: "Searching across all vendors...",
            color: "#439FE0",
          },
        ],
      });

    case "/approval-status":
      // Check approval status
      return c.json({
        response_type: "ephemeral",
        text: "📋 Your pending approvals:",
        attachments: [
          {
            text: "Loading approval queue...",
            color: "#f2c744",
          },
        ],
      });

    default:
      return c.json({
        response_type: "ephemeral",
        text: `Unknown command: ${command}`,
      });
  }
});

// POST /webhooks/email/inbound - Receive inbound emails (purchase requests)
webhookRoutes.post("/email/inbound", async (c) => {
  const body = await c.req.json();
  const { from, to, subject, body: emailBody, attachments } = body;

  // Check if this is a purchase request email
  const isPurchaseRequest =
    to.includes("purchase") ||
    subject?.toLowerCase().includes("order") ||
    subject?.toLowerCase().includes("request");

  if (isPurchaseRequest) {
    // TODO: Trigger Requisition Agent with email content
    console.log(`Email purchase request from ${from}: ${subject}`);

    return c.json({
      success: true,
      data: {
        received: true,
        type: "purchase_request",
        from,
        subject,
        processingId: `email_${Date.now()}`,
        status: "processing",
      },
    });
  }

  // If it's not a purchase request, acknowledge but don't process
  return c.json({
    success: true,
    data: {
      received: true,
      type: "ignored",
      reason: "Not identified as purchase request",
    },
  });
});

// POST /webhooks/erp/:system/sync - Receive sync data from ERP systems
webhookRoutes.post("/erp/:system/sync", async (c) => {
  const system = c.req.param("system");
  const body = await c.req.json();
  const { dataType, records } = body;

  // Validate API key
  const apiKey = c.req.header("X-API-Key");
  if (!apiKey) {
    return c.json(
      { success: false, error: "Missing API key" },
      401
    );
  }

  // Process based on data type
  switch (dataType) {
    case "purchase_orders":
      // TODO: Sync PO data
      break;
    case "invoices":
      // TODO: Sync invoice data
      break;
    case "budgets":
      // TODO: Sync budget data
      break;
    case "users":
      // TODO: Sync user data
      break;
  }

  return c.json({
    success: true,
    data: {
      system,
      dataType,
      recordsReceived: records?.length || 0,
      status: "synced",
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
});

// POST /webhooks/temporal/callback - Receive Temporal workflow callbacks
webhookRoutes.post("/temporal/callback", async (c) => {
  const body = await c.req.json();
  const { workflowId, eventType, result, error } = body;

  // Handle different event types
  switch (eventType) {
    case "workflow_completed":
      console.log(`Workflow ${workflowId} completed:`, result);
      // TODO: Update agent execution status in Convex
      break;
    case "workflow_failed":
      console.error(`Workflow ${workflowId} failed:`, error);
      // TODO: Handle failure, notify relevant parties
      break;
    case "activity_completed":
      console.log(`Activity in ${workflowId} completed`);
      break;
  }

  return c.json({ received: true });
});

// GET /webhooks/health - Webhook endpoint health check
webhookRoutes.get("/health", async (c) => {
  return c.json({
    status: "healthy",
    endpoints: {
      vendor_catalog: "active",
      vendor_invoice: "active",
      vendor_shipment: "active",
      slack_events: "active",
      slack_commands: "active",
      email_inbound: "active",
      erp_sync: "active",
      temporal_callback: "active",
    },
    timestamp: new Date().toISOString(),
  });
});
