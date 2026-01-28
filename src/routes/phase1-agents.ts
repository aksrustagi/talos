/**
 * Phase 1 Agents API Routes
 *
 * API routes for the 8 Phase 1 Core Agents:
 * - LangGraph + Inngest: #1 Catalog, #2 Price, #3 Vendor, #6 Email, #8 License
 * - Temporal: #4 Policy Compliance, #5 Approval Routing, #7 Payment Reconciliation
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppContext } from "../types/context";

// LangGraph agents
import {
  Phase1Agents,
  listPhase1Agents,
  getPhase1Agent,
  runCatalogIntelligenceAgent,
  runPriceDiscoveryAgent,
  runVendorIntelligenceAgent,
  runEmailCommunicationAgent,
  runSoftwareLicenseAgent,
} from "../agents/phase1";

// Temporal client and workflows
import {
  startWorkflow,
  getWorkflowHandle,
  queryWorkflow,
  signalWorkflow,
  describeWorkflow,
} from "../temporal/client";

import {
  policyComplianceWorkflow,
} from "../temporal/workflows/policy-compliance";

import {
  approvalRoutingWorkflow,
} from "../temporal/workflows/approval-routing";

import {
  paymentReconciliationWorkflow,
} from "../temporal/workflows/payment-reconciliation";

export const phase1AgentRoutes = new Hono<AppContext>();

// ============================================================================
// Schemas
// ============================================================================

const catalogIntelligenceSchema = z.object({
  query: z.string().min(1),
  universityId: z.string().optional(),
  options: z.object({
    includeInactive: z.boolean().optional(),
    maxResults: z.number().optional(),
  }).optional(),
});

const priceDiscoverySchema = z.object({
  items: z.array(z.object({
    productId: z.string(),
    productName: z.string(),
    currentPrice: z.number().optional(),
  })).optional(),
  universityId: z.string().optional(),
});

const vendorIntelligenceSchema = z.object({
  vendorId: z.string().optional(),
  vendorName: z.string().optional(),
  assessmentType: z.enum(["full", "quick", "risk-only"]).optional(),
  universityId: z.string().optional(),
});

const emailCommunicationSchema = z.object({
  email: z.object({
    id: z.string(),
    from: z.string(),
    to: z.string(),
    subject: z.string(),
    body: z.string(),
    receivedAt: z.string(),
    attachments: z.array(z.object({
      name: z.string(),
      contentType: z.string(),
      size: z.number(),
    })).optional(),
  }),
  universityId: z.string().optional(),
});

const softwareLicenseSchema = z.object({
  action: z.enum(["check-usage", "analyze-optimization", "renewal-analysis"]),
  licenseIds: z.array(z.string()).optional(),
  universityId: z.string().optional(),
});

const policyComplianceSchema = z.object({
  requisition: z.object({
    id: z.string(),
    universityId: z.string(),
    departmentId: z.string(),
    requesterId: z.string(),
    items: z.array(z.object({
      productId: z.string(),
      productName: z.string(),
      quantity: z.number(),
      unitPrice: z.number(),
      category: z.string(),
      vendorId: z.string(),
    })),
    totalAmount: z.number(),
    grantId: z.string().optional(),
    grantName: z.string().optional(),
    justification: z.string().optional(),
    urgency: z.enum(["normal", "urgent", "emergency"]).optional(),
  }),
});

const approvalRoutingSchema = z.object({
  requisitionId: z.string(),
  universityId: z.string(),
  departmentId: z.string(),
  requesterId: z.string(),
  requesterName: z.string(),
  amount: z.number(),
  category: z.string(),
  items: z.array(z.object({
    name: z.string(),
    quantity: z.number(),
    unitPrice: z.number(),
  })),
  grantFunded: z.boolean().optional(),
  grantPIId: z.string().optional(),
  justification: z.string().optional(),
});

const paymentReconciliationSchema = z.object({
  invoice: z.object({
    id: z.string(),
    vendorId: z.string(),
    vendorName: z.string(),
    invoiceNumber: z.string(),
    invoiceDate: z.string(),
    dueDate: z.string(),
    lineItems: z.array(z.object({
      description: z.string(),
      quantity: z.number(),
      unitPrice: z.number(),
      totalPrice: z.number(),
      poLineNumber: z.number().optional(),
    })),
    subtotal: z.number(),
    tax: z.number(),
    total: z.number(),
    paymentTerms: z.string().optional(),
    earlyPayDiscount: z.object({
      percentage: z.number(),
      daysToQualify: z.number(),
    }).optional(),
  }),
  universityId: z.string(),
});

const workflowActionSchema = z.object({
  action: z.enum(["approve", "reject", "return", "delegate", "resolve"]),
  approverId: z.string().optional(),
  delegateToId: z.string().optional(),
  reason: z.string().optional(),
  resolution: z.any().optional(),
});

// ============================================================================
// General Routes
// ============================================================================

// GET /phase1 - List all Phase 1 agents
phase1AgentRoutes.get("/", async (c) => {
  const agents = listPhase1Agents();

  return c.json({
    success: true,
    data: {
      name: "Phase 1 Core Agents",
      description: "8 foundational agents for university procurement",
      agents: agents.map(a => ({
        id: a.id,
        name: a.name,
        runtime: a.runtime,
        description: a.description,
      })),
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
      totalAgents: agents.length,
    },
  });
});

// GET /phase1/:agentId - Get specific agent details
phase1AgentRoutes.get("/:agentId", async (c) => {
  const agentId = c.req.param("agentId") as keyof typeof Phase1Agents;
  const agent = getPhase1Agent(agentId);

  if (!agent) {
    return c.json({
      success: false,
      error: {
        code: "AGENT_NOT_FOUND",
        message: `Agent '${agentId}' not found`,
      },
    }, 404);
  }

  return c.json({
    success: true,
    data: {
      id: agent.id,
      name: agent.name,
      runtime: agent.runtime,
      description: agent.description,
      isActive: true,
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// ============================================================================
// LangGraph Agent Routes
// ============================================================================

// POST /phase1/catalog-intelligence/invoke
phase1AgentRoutes.post(
  "/catalog-intelligence/invoke",
  zValidator("json", catalogIntelligenceSchema),
  async (c) => {
    const input = c.req.valid("json");
    const user = c.get("user");

    try {
      const result = await runCatalogIntelligenceAgent({
        query: input.query,
        universityId: input.universityId || user?.universityId || "",
        options: input.options,
      });

      return c.json({
        success: true,
        data: result,
        meta: {
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
          agentId: "catalog-intelligence",
        },
      });
    } catch (error) {
      return c.json({
        success: false,
        error: {
          code: "AGENT_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      }, 500);
    }
  }
);

// POST /phase1/price-discovery/invoke
phase1AgentRoutes.post(
  "/price-discovery/invoke",
  zValidator("json", priceDiscoverySchema),
  async (c) => {
    const input = c.req.valid("json");
    const user = c.get("user");

    try {
      const result = await runPriceDiscoveryAgent({
        items: input.items || [],
        universityId: input.universityId || user?.universityId || "",
      });

      return c.json({
        success: true,
        data: result,
        meta: {
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
          agentId: "price-discovery",
        },
      });
    } catch (error) {
      return c.json({
        success: false,
        error: {
          code: "AGENT_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      }, 500);
    }
  }
);

// POST /phase1/vendor-intelligence/invoke
phase1AgentRoutes.post(
  "/vendor-intelligence/invoke",
  zValidator("json", vendorIntelligenceSchema),
  async (c) => {
    const input = c.req.valid("json");
    const user = c.get("user");

    try {
      const result = await runVendorIntelligenceAgent({
        vendorId: input.vendorId,
        vendorName: input.vendorName,
        assessmentType: input.assessmentType || "full",
        universityId: input.universityId || user?.universityId || "",
      });

      return c.json({
        success: true,
        data: result,
        meta: {
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
          agentId: "vendor-intelligence",
        },
      });
    } catch (error) {
      return c.json({
        success: false,
        error: {
          code: "AGENT_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      }, 500);
    }
  }
);

// POST /phase1/email-communication/invoke
phase1AgentRoutes.post(
  "/email-communication/invoke",
  zValidator("json", emailCommunicationSchema),
  async (c) => {
    const input = c.req.valid("json");
    const user = c.get("user");

    try {
      const result = await runEmailCommunicationAgent({
        email: input.email,
        universityId: input.universityId || user?.universityId || "",
      });

      return c.json({
        success: true,
        data: result,
        meta: {
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
          agentId: "email-communication",
        },
      });
    } catch (error) {
      return c.json({
        success: false,
        error: {
          code: "AGENT_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      }, 500);
    }
  }
);

// POST /phase1/software-license/invoke
phase1AgentRoutes.post(
  "/software-license/invoke",
  zValidator("json", softwareLicenseSchema),
  async (c) => {
    const input = c.req.valid("json");
    const user = c.get("user");

    try {
      const result = await runSoftwareLicenseAgent({
        action: input.action,
        licenseIds: input.licenseIds,
        universityId: input.universityId || user?.universityId || "",
      });

      return c.json({
        success: true,
        data: result,
        meta: {
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
          agentId: "software-license",
        },
      });
    } catch (error) {
      return c.json({
        success: false,
        error: {
          code: "AGENT_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      }, 500);
    }
  }
);

// ============================================================================
// Temporal Workflow Routes
// ============================================================================

// POST /phase1/policy-compliance/start
phase1AgentRoutes.post(
  "/policy-compliance/start",
  zValidator("json", policyComplianceSchema),
  async (c) => {
    const input = c.req.valid("json");

    try {
      const workflowId = `compliance-${input.requisition.id}-${Date.now()}`;
      const result = await startWorkflow(policyComplianceWorkflow, {
        taskQueue: "procurement-agents",
        workflowId,
        args: [input.requisition],
      });

      return c.json({
        success: true,
        data: {
          workflowId: result.workflowId,
          runId: result.runId,
          status: "started",
        },
        meta: {
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
          agentId: "policy-compliance",
        },
      });
    } catch (error) {
      return c.json({
        success: false,
        error: {
          code: "WORKFLOW_START_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      }, 500);
    }
  }
);

// POST /phase1/approval-routing/start
phase1AgentRoutes.post(
  "/approval-routing/start",
  zValidator("json", approvalRoutingSchema),
  async (c) => {
    const input = c.req.valid("json");

    try {
      const workflowId = `approval-${input.requisitionId}-${Date.now()}`;
      const result = await startWorkflow(approvalRoutingWorkflow, {
        taskQueue: "procurement-agents",
        workflowId,
        args: [input],
      });

      return c.json({
        success: true,
        data: {
          workflowId: result.workflowId,
          runId: result.runId,
          status: "started",
        },
        meta: {
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
          agentId: "approval-routing",
        },
      });
    } catch (error) {
      return c.json({
        success: false,
        error: {
          code: "WORKFLOW_START_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      }, 500);
    }
  }
);

// POST /phase1/payment-reconciliation/start
phase1AgentRoutes.post(
  "/payment-reconciliation/start",
  zValidator("json", paymentReconciliationSchema),
  async (c) => {
    const input = c.req.valid("json");

    try {
      const workflowId = `reconciliation-${input.invoice.id}-${Date.now()}`;
      const result = await startWorkflow(paymentReconciliationWorkflow, {
        taskQueue: "procurement-agents",
        workflowId,
        args: [input.invoice, input.universityId],
      });

      return c.json({
        success: true,
        data: {
          workflowId: result.workflowId,
          runId: result.runId,
          status: "started",
        },
        meta: {
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
          agentId: "payment-reconciliation",
        },
      });
    } catch (error) {
      return c.json({
        success: false,
        error: {
          code: "WORKFLOW_START_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      }, 500);
    }
  }
);

// ============================================================================
// Workflow Status and Interaction Routes
// ============================================================================

// GET /phase1/workflows/:workflowId - Get workflow status
phase1AgentRoutes.get("/workflows/:workflowId", async (c) => {
  const workflowId = c.req.param("workflowId");

  try {
    const description = await describeWorkflow(workflowId);

    return c.json({
      success: true,
      data: {
        workflowId,
        status: description.status.name,
        type: description.workflowType,
        startTime: description.startTime,
        closeTime: description.closeTime,
        executionTime: description.executionTime,
      },
      meta: {
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "WORKFLOW_NOT_FOUND",
        message: error instanceof Error ? error.message : "Workflow not found",
      },
    }, 404);
  }
});

// POST /phase1/workflows/:workflowId/signal - Send signal to workflow
phase1AgentRoutes.post(
  "/workflows/:workflowId/signal",
  zValidator("json", workflowActionSchema),
  async (c) => {
    const workflowId = c.req.param("workflowId");
    const input = c.req.valid("json");
    const user = c.get("user");

    try {
      // Determine signal based on action
      let signalName: string;
      let signalArgs: any[];

      switch (input.action) {
        case "approve":
          signalName = "approveSignal";
          signalArgs = [{
            approverId: input.approverId || user?.userId,
            decision: "approved",
            comments: input.reason,
            timestamp: new Date().toISOString(),
          }];
          break;
        case "reject":
          signalName = "rejectSignal";
          signalArgs = [{
            approverId: input.approverId || user?.userId,
            decision: "rejected",
            reason: input.reason,
            timestamp: new Date().toISOString(),
          }];
          break;
        case "return":
          signalName = "returnSignal";
          signalArgs = [{
            approverId: input.approverId || user?.userId,
            reason: input.reason,
            timestamp: new Date().toISOString(),
          }];
          break;
        case "delegate":
          signalName = "delegateSignal";
          signalArgs = [{
            delegatorId: input.approverId || user?.userId,
            delegateToId: input.delegateToId,
            reason: input.reason,
            timestamp: new Date().toISOString(),
          }];
          break;
        case "resolve":
          signalName = "resolveDiscrepancySignal";
          signalArgs = [{
            resolution: input.resolution,
            resolvedBy: user?.userId,
            timestamp: new Date().toISOString(),
          }];
          break;
        default:
          return c.json({
            success: false,
            error: {
              code: "INVALID_ACTION",
              message: `Unknown action: ${input.action}`,
            },
          }, 400);
      }

      await signalWorkflow(workflowId, signalName, signalArgs);

      return c.json({
        success: true,
        data: {
          workflowId,
          action: input.action,
          signalSent: signalName,
        },
        meta: {
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      return c.json({
        success: false,
        error: {
          code: "SIGNAL_ERROR",
          message: error instanceof Error ? error.message : "Failed to send signal",
        },
      }, 500);
    }
  }
);

// GET /phase1/workflows/:workflowId/query/:queryName - Query workflow state
phase1AgentRoutes.get("/workflows/:workflowId/query/:queryName", async (c) => {
  const workflowId = c.req.param("workflowId");
  const queryName = c.req.param("queryName");

  try {
    const result = await queryWorkflow(workflowId, queryName);

    return c.json({
      success: true,
      data: result,
      meta: {
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
        workflowId,
        query: queryName,
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "QUERY_ERROR",
        message: error instanceof Error ? error.message : "Failed to query workflow",
      },
    }, 500);
  }
});

export default phase1AgentRoutes;
