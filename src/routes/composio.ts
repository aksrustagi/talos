/**
 * Composio API Routes
 *
 * API routes for managing Composio integrations:
 * - App connections (OAuth)
 * - Tool discovery
 * - Tool execution
 * - Usage metrics
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppContext } from "../types/context";
import {
  composioService,
  composioToolProvider,
  ToolCategory,
  TOOL_BUNDLES,
  PROCUREMENT_TOOL_PRESETS,
} from "../services/composio";

export const composioRoutes = new Hono<AppContext>();

// ============================================================================
// Schemas
// ============================================================================

const initiateConnectionSchema = z.object({
  appName: z.string(),
  redirectUrl: z.string().url().optional(),
  scopes: z.array(z.string()).optional(),
});

const executeToolSchema = z.object({
  toolName: z.string(),
  params: z.record(z.any()),
  timeout: z.number().optional(),
});

const getToolsSchema = z.object({
  apps: z.array(z.string()).optional(),
  category: z.string().optional(),
  toolNames: z.array(z.string()).optional(),
});

// ============================================================================
// Connection Management Routes
// ============================================================================

// GET /composio/apps - List available apps
composioRoutes.get("/apps", async (c) => {
  const apps = await composioService.getAvailableApps();

  // Group apps by category
  const categories = Object.values(ToolCategory);
  const groupedApps: Record<string, string[]> = {};

  for (const category of categories) {
    groupedApps[category] = composioService.getAppsByCategory(category as any);
  }

  return c.json({
    success: true,
    data: {
      allApps: apps,
      byCategory: groupedApps,
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
      totalApps: apps.length,
    },
  });
});

// GET /composio/connections - List connected apps for entity
composioRoutes.get("/connections", async (c) => {
  const user = c.get("user");
  const entityId = c.req.query("entityId") || user?.universityId || "default";

  try {
    const connections = await composioService.getConnections(entityId);

    return c.json({
      success: true,
      data: {
        entityId,
        connections,
        connectedApps: connections.map(conn => conn.appName),
      },
      meta: {
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
        totalConnections: connections.length,
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "CONNECTION_ERROR",
        message: error instanceof Error ? error.message : "Failed to get connections",
      },
    }, 500);
  }
});

// POST /composio/connections - Initiate a new connection
composioRoutes.post(
  "/connections",
  zValidator("json", initiateConnectionSchema),
  async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const entityId = user?.universityId || "default";

    try {
      const result = await composioService.initiateConnection({
        entityId,
        appName: input.appName as any,
        redirectUrl: input.redirectUrl,
        scopes: input.scopes,
      });

      return c.json({
        success: true,
        data: {
          connectionId: result.connectionId,
          authUrl: result.authUrl,
          expiresAt: result.expiresAt,
          instructions: `Redirect user to authUrl to complete OAuth flow`,
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
          code: "CONNECTION_INIT_ERROR",
          message: error instanceof Error ? error.message : "Failed to initiate connection",
        },
      }, 500);
    }
  }
);

// DELETE /composio/connections/:connectionId - Disconnect an app
composioRoutes.delete("/connections/:connectionId", async (c) => {
  const user = c.get("user");
  const connectionId = c.req.param("connectionId");
  const entityId = user?.universityId || "default";

  try {
    await composioService.disconnectApp(connectionId, entityId);

    return c.json({
      success: true,
      data: {
        connectionId,
        disconnected: true,
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
        code: "DISCONNECT_ERROR",
        message: error instanceof Error ? error.message : "Failed to disconnect app",
      },
    }, 500);
  }
});

// GET /composio/connections/:appName/status - Check if app is connected
composioRoutes.get("/connections/:appName/status", async (c) => {
  const user = c.get("user");
  const appName = c.req.param("appName");
  const entityId = user?.universityId || "default";

  try {
    const isConnected = await composioService.isAppConnected(appName as any, entityId);

    return c.json({
      success: true,
      data: {
        appName,
        isConnected,
        entityId,
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
        code: "STATUS_CHECK_ERROR",
        message: error instanceof Error ? error.message : "Failed to check connection status",
      },
    }, 500);
  }
});

// ============================================================================
// Tool Discovery Routes
// ============================================================================

// GET /composio/tools - Get available tools
composioRoutes.get("/tools", async (c) => {
  const user = c.get("user");
  const entityId = c.req.query("entityId") || user?.universityId || "default";
  const category = c.req.query("category");
  const app = c.req.query("app");

  try {
    const tools = await composioService.getTools({
      category: category as any,
      apps: app ? [app as any] : undefined,
      entityId,
    });

    return c.json({
      success: true,
      data: {
        tools: tools.map(t => ({
          name: t.name,
          displayName: t.displayName,
          description: t.description,
          appName: t.appName,
          category: t.category,
        })),
      },
      meta: {
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
        totalTools: tools.length,
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "TOOLS_ERROR",
        message: error instanceof Error ? error.message : "Failed to get tools",
      },
    }, 500);
  }
});

// GET /composio/tools/:toolName - Get specific tool details
composioRoutes.get("/tools/:toolName", async (c) => {
  const user = c.get("user");
  const toolName = c.req.param("toolName");
  const entityId = user?.universityId || "default";

  try {
    const tools = await composioService.getTools({
      toolNames: [toolName],
      entityId,
    });

    if (tools.length === 0) {
      return c.json({
        success: false,
        error: {
          code: "TOOL_NOT_FOUND",
          message: `Tool '${toolName}' not found`,
        },
      }, 404);
    }

    return c.json({
      success: true,
      data: tools[0],
      meta: {
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "TOOL_ERROR",
        message: error instanceof Error ? error.message : "Failed to get tool",
      },
    }, 500);
  }
});

// GET /composio/bundles - List available tool bundles
composioRoutes.get("/bundles", async (c) => {
  return c.json({
    success: true,
    data: {
      bundles: Object.entries(TOOL_BUNDLES).map(([key, bundle]) => ({
        id: key,
        name: bundle.name,
        description: bundle.description,
        categories: bundle.categories,
        apps: bundle.apps,
        toolCount: bundle.tools.length,
      })),
      presets: Object.keys(PROCUREMENT_TOOL_PRESETS),
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// GET /composio/bundles/:bundleName - Get tools from a bundle
composioRoutes.get("/bundles/:bundleName", async (c) => {
  const user = c.get("user");
  const bundleName = c.req.param("bundleName");
  const entityId = user?.universityId || "default";

  try {
    const tools = await composioToolProvider.getToolBundle(
      bundleName as keyof typeof TOOL_BUNDLES,
      entityId
    );

    return c.json({
      success: true,
      data: {
        bundle: bundleName,
        tools: tools.map((t: any) => ({
          name: t.name,
          description: t.description,
        })),
      },
      meta: {
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
        totalTools: tools.length,
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "BUNDLE_ERROR",
        message: error instanceof Error ? error.message : "Failed to get bundle",
      },
    }, 500);
  }
});

// ============================================================================
// Tool Execution Routes
// ============================================================================

// POST /composio/execute - Execute a tool
composioRoutes.post(
  "/execute",
  zValidator("json", executeToolSchema),
  async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const entityId = user?.universityId || "default";

    try {
      const result = await composioService.executeTool(
        input.toolName,
        input.params,
        {
          entityId,
          timeout: input.timeout,
        }
      );

      return c.json({
        success: result.success,
        data: result.data,
        error: result.error,
        meta: {
          requestId: c.get("requestId"),
          timestamp: new Date().toISOString(),
          toolName: result.toolName,
          appName: result.appName,
          executionTime: result.executionTime,
        },
      }, result.success ? 200 : 500);
    } catch (error) {
      return c.json({
        success: false,
        error: {
          code: "EXECUTION_ERROR",
          message: error instanceof Error ? error.message : "Failed to execute tool",
        },
      }, 500);
    }
  }
);

// ============================================================================
// Metrics Routes
// ============================================================================

// GET /composio/metrics - Get tool usage metrics
composioRoutes.get("/metrics", async (c) => {
  const metrics = composioService.getMetrics();

  // Calculate summary stats
  const totalExecutions = metrics.reduce((sum, m) => sum + m.executionCount, 0);
  const totalSuccesses = metrics.reduce((sum, m) => sum + m.successCount, 0);
  const avgExecutionTime =
    metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.averageExecutionTime, 0) / metrics.length
      : 0;

  return c.json({
    success: true,
    data: {
      summary: {
        totalTools: metrics.length,
        totalExecutions,
        successRate: totalExecutions > 0 ? totalSuccesses / totalExecutions : 0,
        averageExecutionTime: Math.round(avgExecutionTime),
      },
      byTool: metrics.map(m => ({
        toolName: m.toolName,
        appName: m.appName,
        executions: m.executionCount,
        successRate: m.executionCount > 0 ? m.successCount / m.executionCount : 0,
        avgTime: Math.round(m.averageExecutionTime),
        lastUsed: m.lastExecutedAt,
      })),
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// POST /composio/cache/clear - Clear tool cache
composioRoutes.post("/cache/clear", async (c) => {
  composioService.clearCache();

  return c.json({
    success: true,
    data: {
      cacheCleared: true,
    },
    meta: {
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
  });
});

// ============================================================================
// Agent Tool Routes
// ============================================================================

// GET /composio/agents/:agentId/tools - Get tools configured for an agent
composioRoutes.get("/agents/:agentId/tools", async (c) => {
  const user = c.get("user");
  const agentId = c.req.param("agentId");
  const entityId = user?.universityId || "default";

  try {
    // Import dynamically to avoid circular deps
    const { composioLangGraphAdapter } = await import("../services/composio");
    const tools = await composioLangGraphAdapter.getToolsForAgent(agentId, entityId);

    return c.json({
      success: true,
      data: {
        agentId,
        tools: tools.map((t: any) => ({
          name: t.name,
          description: t.description,
        })),
      },
      meta: {
        requestId: c.get("requestId"),
        timestamp: new Date().toISOString(),
        totalTools: tools.length,
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "AGENT_TOOLS_ERROR",
        message: error instanceof Error ? error.message : "Failed to get agent tools",
      },
    }, 500);
  }
});

export default composioRoutes;
