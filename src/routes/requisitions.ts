import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppContext } from "../types/context";

export const requisitionRoutes = new Hono<AppContext>();

// Schemas
const createRequisitionSchema = z.object({
  department: z.string(),
  budgetCode: z.string(),
  grantNumber: z.string().optional(),
  urgency: z.enum(["standard", "rush", "emergency"]).default("standard"),
  neededByDate: z.string().optional(),
  justification: z.string().optional(),
  sourceChannel: z.enum(["web", "email", "slack", "api"]).default("api"),
  originalRequest: z.string().optional(),
});

const addLineItemSchema = z.object({
  productId: z.string().optional(),
  description: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().positive(),
  vendorId: z.string().optional(),
  vendorSku: z.string().optional(),
});

const approvalActionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  comments: z.string().optional(),
});

// GET /requisitions - List requisitions
requisitionRoutes.get("/", async (c) => {
  const status = c.req.query("status");
  const department = c.req.query("department");
  const limit = parseInt(c.req.query("limit") || "50");

  // TODO: Call Convex to list requisitions
  // const requisitions = await convex.query(api.requisitions.list, { universityId, status, department, limit });

  return c.json({
    success: true,
    data: [
      {
        id: "req_001",
        requisitionNumber: "REQ-2025-00847",
        status: "pending_approval",
        requester: {
          name: "Dr. Smith",
          email: "dr.smith@columbia.edu",
          department: "Chemistry",
        },
        description: "Lab supplies for new grant",
        totalAmount: 1603.0,
        urgency: "standard",
        neededByDate: "2025-01-31",
        submittedAt: "2025-01-15T14:30:00Z",
        approvalStatus: {
          currentStep: 1,
          totalSteps: 2,
          waitingOn: "EHS Approval",
        },
      },
      {
        id: "req_002",
        requisitionNumber: "REQ-2025-00846",
        status: "approved",
        requester: {
          name: "Prof. Johnson",
          email: "johnson@columbia.edu",
          department: "Biology",
        },
        description: "Cell culture supplies",
        totalAmount: 4250.0,
        urgency: "rush",
        submittedAt: "2025-01-14T10:15:00Z",
        approvedAt: "2025-01-15T09:00:00Z",
      },
    ],
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
      pagination: {
        total: 2,
        limit,
        offset: 0,
        hasMore: false,
      },
    },
  });
});

// POST /requisitions - Create requisition
requisitionRoutes.post("/", zValidator("json", createRequisitionSchema), async (c) => {
  const data = c.req.valid("json");
  const user = c.get("user");

  // TODO: Call Convex to create requisition
  // const result = await convex.mutation(api.requisitions.create, {
  //   universityId: user.universityId,
  //   requesterId: user.userId,
  //   ...data,
  // });

  const reqNumber = `REQ-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 99999)).padStart(5, "0")}`;

  return c.json(
    {
      success: true,
      data: {
        id: "req_new",
        requisitionNumber: reqNumber,
        status: "draft",
        ...data,
        lineItems: [],
        subtotal: 0,
        totalAmount: 0,
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

// POST /requisitions/natural - Create from natural language
requisitionRoutes.post("/natural", async (c) => {
  const body = await c.req.json();
  const { message, channel } = body;

  // This would trigger the Requisition Agent to parse the natural language request
  // TODO: Call agent to process natural language
  // const result = await agentClient.invoke("requisition-agent", { message, channel });

  return c.json({
    success: true,
    data: {
      id: "req_natural",
      requisitionNumber: "REQ-2025-00848",
      status: "draft",
      originalRequest: message,
      parsedItems: [
        {
          description: "Pipette Tips 200μl (1000/box)",
          quantity: 10,
          unitPrice: 38.5,
          suggestedVendor: "Fisher Scientific",
        },
        {
          description: "50ml Conical Tubes (500/case)",
          quantity: 5,
          unitPrice: 185.0,
          suggestedVendor: "VWR",
          aiNote: "VWR recommended - saves $140 vs Fisher",
        },
      ],
      estimatedTotal: 1310.0,
      budgetStatus: {
        budgetCode: "extracted from grant number",
        available: 45230,
        afterPurchase: 43920,
        status: "ok",
      },
      nextSteps: [
        "Confirm parsed items",
        "Add budget code if not detected",
        "Submit for approval",
      ],
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
      aiProcessing: {
        agentId: "requisition-agent",
        confidence: 0.92,
        processingTime: 1250,
      },
    },
  });
});

// GET /requisitions/:id - Get requisition details
requisitionRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  // TODO: Call Convex to get requisition with items
  // const requisition = await convex.query(api.requisitions.getWithItems, { requisitionId: id });

  return c.json({
    success: true,
    data: {
      id,
      requisitionNumber: "REQ-2025-00847",
      status: "pending_approval",
      requester: {
        id: "user_001",
        name: "Dr. Smith",
        email: "dr.smith@columbia.edu",
        department: "Chemistry",
      },
      department: "Chemistry",
      budgetCode: "R01-GM123456",
      urgency: "standard",
      neededByDate: "2025-01-31",
      lineItems: [
        {
          lineNumber: 1,
          description: "Pipette Tips 200μl (1000/box)",
          quantity: 10,
          unitPrice: 38.5,
          extendedPrice: 385.0,
          vendor: "Fisher Scientific",
          vendorSku: "02-707-504",
        },
        {
          lineNumber: 2,
          description: "50ml Conical Tubes (500/case)",
          quantity: 5,
          unitPrice: 185.0,
          extendedPrice: 925.0,
          vendor: "VWR",
          vendorSku: "89039-656",
          aiSuggestion: {
            betterPriceVendor: null,
            diverseAlternative: "ChemSource Inc. (MWBE)",
          },
        },
      ],
      subtotal: 1310.0,
      shippingCost: 0,
      taxAmount: 0,
      totalAmount: 1310.0,
      approvals: [
        {
          step: 1,
          approverRole: "Department Manager",
          approver: "Dr. Johnson",
          status: "approved",
          actionAt: "2025-01-15T16:00:00Z",
        },
        {
          step: 2,
          approverRole: "EHS Review",
          approver: "Dr. Martinez",
          status: "pending",
          dueAt: "2025-01-17T14:30:00Z",
        },
      ],
      createdAt: "2025-01-15T14:00:00Z",
      submittedAt: "2025-01-15T14:30:00Z",
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// POST /requisitions/:id/items - Add line item
requisitionRoutes.post(
  "/:id/items",
  zValidator("json", addLineItemSchema),
  async (c) => {
    const id = c.req.param("id");
    const data = c.req.valid("json");

    // TODO: Call Convex to add line item
    // const lineItemId = await convex.mutation(api.requisitions.addLineItem, {
    //   requisitionId: id,
    //   ...data,
    // });

    return c.json(
      {
        success: true,
        data: {
          requisitionId: id,
          lineItem: {
            id: "line_new",
            lineNumber: 1,
            ...data,
            extendedPrice: data.quantity * data.unitPrice,
          },
          newTotal: data.quantity * data.unitPrice,
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

// POST /requisitions/:id/submit - Submit for approval
requisitionRoutes.post("/:id/submit", async (c) => {
  const id = c.req.param("id");

  // TODO: Call Convex to submit requisition
  // const result = await convex.mutation(api.requisitions.submit, { requisitionId: id });

  return c.json({
    success: true,
    data: {
      requisitionId: id,
      status: "pending_approval",
      message: "Requisition submitted for approval",
      approvalWorkflow: [
        {
          step: 1,
          role: "Department Manager",
          approver: "Dr. Johnson",
          status: "pending",
          estimatedTime: "1-2 business days",
        },
        {
          step: 2,
          role: "EHS Review",
          approver: "Dr. Martinez",
          status: "waiting",
          reason: "Contains chemical items",
        },
      ],
      estimatedApprovalDate: new Date(
        Date.now() + 3 * 24 * 60 * 60 * 1000
      ).toISOString(),
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// POST /requisitions/:id/approve - Approve/Reject requisition
requisitionRoutes.post(
  "/:id/approval",
  zValidator("json", approvalActionSchema),
  async (c) => {
    const id = c.req.param("id");
    const { action, comments } = c.req.valid("json");
    const user = c.get("user");

    // TODO: Call Convex to approve/reject
    // if (action === "approve") {
    //   await convex.mutation(api.requisitions.approve, { requisitionId: id, approverId: user.userId, comments });
    // } else {
    //   await convex.mutation(api.requisitions.reject, { requisitionId: id, approverId: user.userId, comments });
    // }

    return c.json({
      success: true,
      data: {
        requisitionId: id,
        action,
        status: action === "approve" ? "approved" : "rejected",
        comments,
        actionBy: user?.email,
        actionAt: new Date().toISOString(),
        nextSteps:
          action === "approve"
            ? ["Ready for PO generation", "Vendor notification pending"]
            : ["Returned to requester for revision"],
      },
      meta: {
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
      },
    });
  }
);

// GET /requisitions/pending-approvals - Get pending approvals for current user
requisitionRoutes.get("/approvals/pending", async (c) => {
  const user = c.get("user");

  // TODO: Call Convex to get pending approvals
  // const approvals = await convex.query(api.requisitions.getPendingApprovals, { approverId: user.userId });

  return c.json({
    success: true,
    data: [
      {
        requisitionId: "req_001",
        requisitionNumber: "REQ-2025-00847",
        requester: "Dr. Smith",
        department: "Chemistry",
        amount: 1603.0,
        urgency: "standard",
        submittedAt: "2025-01-15T14:30:00Z",
        dueAt: "2025-01-17T14:30:00Z",
        hoursRemaining: 24,
        description: "Lab supplies for new grant",
        yourRole: "EHS Reviewer",
        requiresAdditionalApproval: false,
      },
    ],
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
      summary: {
        totalPending: 1,
        totalValue: 1603.0,
        overdueCount: 0,
      },
    },
  });
});

// GET /requisitions/bottlenecks - Get approval bottlenecks
requisitionRoutes.get("/approvals/bottlenecks", async (c) => {
  const user = c.get("user");

  // TODO: Call Convex to get bottlenecks
  // const bottlenecks = await convex.query(api.requisitions.getApprovalBottlenecks, {
  //   universityId: user.universityId,
  // });

  return c.json({
    success: true,
    data: {
      bottlenecks: [
        {
          approverName: "Dr. Martinez",
          approverEmail: "martinez@columbia.edu",
          role: "EHS Director",
          pending: 12,
          overdue: 8,
          totalBlocked: 45230,
          avgWaitTime: "4.2 days",
          status: "On medical leave since Jan 10",
          recommendation: "Configure emergency delegation to Dr. Thompson",
        },
        {
          approverName: "CFO Office",
          pending: 5,
          overdue: 3,
          totalBlocked: 890000,
          avgWaitTime: "6.1 days",
          pattern: "Batch processing on Fridays",
          recommendation: "Implement rolling approval schedule",
        },
      ],
      summary: {
        totalBlocked: 28,
        totalValueBlocked: 1127730,
        averageDelay: "3.8 days",
        estimatedProductivityLoss: 23000,
      },
      recommendedActions: [
        {
          priority: "immediate",
          action: "Configure emergency delegation for Dr. Martinez",
          impact: "Unblock 12 requisitions worth $45,230",
        },
        {
          priority: "this_week",
          action: "Meet with CFO office about rolling approvals",
          impact: "Reduce average wait time by 50%",
        },
      ],
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});
