/**
 * Procurement Connectors API Routes
 *
 * REST API for managing procurement system connectors:
 * - Connector configuration and registration
 * - Connection testing and health checks
 * - Cross-system catalog search
 * - Unified operations across connectors
 */

import { Hono } from "hono";
import {
  procurementConnectorService,
  type ConnectorConfig,
  type ProcurementSystem,
  type POStatus,
  type InvoiceStatus,
} from "../connectors/procurement";

export const connectorRoutes = new Hono();

// ============================================================================
// System Information
// ============================================================================

/**
 * GET /systems
 * Get all available procurement systems
 */
connectorRoutes.get("/systems", (c) => {
  try {
    const systems = procurementConnectorService.getAvailableSystems();
    return c.json({
      success: true,
      data: systems,
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "SYSTEMS_FETCH_FAILED",
        message: error instanceof Error ? error.message : "Failed to fetch systems",
      },
    }, 500);
  }
});

/**
 * GET /systems/:system/features
 * Get features supported by a system
 */
connectorRoutes.get("/systems/:system/features", (c) => {
  try {
    const system = c.req.param("system") as ProcurementSystem;
    const features = procurementConnectorService.getSystemFeatures(system);
    return c.json({
      success: true,
      data: { system, features },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "FEATURES_FETCH_FAILED",
        message: error instanceof Error ? error.message : "Failed to fetch features",
      },
    }, 500);
  }
});

// ============================================================================
// Configuration Management
// ============================================================================

/**
 * POST /configs
 * Register a new connector configuration
 */
connectorRoutes.post("/configs", async (c) => {
  try {
    const config: ConnectorConfig = await c.req.json();

    if (!config.id || !config.system || !config.universityId || !config.credentials) {
      return c.json({
        success: false,
        error: {
          code: "INVALID_CONFIG",
          message: "Missing required fields: id, system, universityId, credentials",
        },
      }, 400);
    }

    procurementConnectorService.registerConfig(config);

    return c.json({
      success: true,
      data: {
        id: config.id,
        system: config.system,
        universityId: config.universityId,
        message: "Connector configuration registered successfully",
      },
    }, 201);
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "CONFIG_REGISTER_FAILED",
        message: error instanceof Error ? error.message : "Failed to register configuration",
      },
    }, 500);
  }
});

/**
 * GET /configs/:connectorId
 * Get a connector configuration (credentials masked)
 */
connectorRoutes.get("/configs/:connectorId", (c) => {
  try {
    const config = procurementConnectorService.getConfig(c.req.param("connectorId"));

    if (!config) {
      return c.json({
        success: false,
        error: {
          code: "CONFIG_NOT_FOUND",
          message: `Configuration not found: ${c.req.param("connectorId")}`,
        },
      }, 404);
    }

    const maskedConfig = {
      ...config,
      credentials: Object.fromEntries(
        Object.entries(config.credentials).map(([key, value]) => [
          key,
          typeof value === "string" ? "********" : value,
        ])
      ),
    };

    return c.json({
      success: true,
      data: maskedConfig,
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "CONFIG_FETCH_FAILED",
        message: error instanceof Error ? error.message : "Failed to fetch configuration",
      },
    }, 500);
  }
});

/**
 * GET /configs/university/:universityId
 * Get all configurations for a university
 */
connectorRoutes.get("/configs/university/:universityId", (c) => {
  try {
    const configs = procurementConnectorService.getConfigsForUniversity(
      c.req.param("universityId")
    );

    const maskedConfigs = configs.map((config) => ({
      ...config,
      credentials: Object.fromEntries(
        Object.entries(config.credentials).map(([key, value]) => [
          key,
          typeof value === "string" ? "********" : value,
        ])
      ),
    }));

    return c.json({
      success: true,
      data: maskedConfigs,
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "CONFIGS_FETCH_FAILED",
        message: error instanceof Error ? error.message : "Failed to fetch configurations",
      },
    }, 500);
  }
});

/**
 * DELETE /configs/:connectorId
 * Remove a connector configuration
 */
connectorRoutes.delete("/configs/:connectorId", (c) => {
  try {
    const removed = procurementConnectorService.removeConfig(c.req.param("connectorId"));

    if (!removed) {
      return c.json({
        success: false,
        error: {
          code: "CONFIG_NOT_FOUND",
          message: `Configuration not found: ${c.req.param("connectorId")}`,
        },
      }, 404);
    }

    return c.json({
      success: true,
      data: {
        id: c.req.param("connectorId"),
        message: "Configuration removed successfully",
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "CONFIG_REMOVE_FAILED",
        message: error instanceof Error ? error.message : "Failed to remove configuration",
      },
    }, 500);
  }
});

// ============================================================================
// Connection Testing
// ============================================================================

/**
 * POST /:connectorId/test
 * Test connection for a specific connector
 */
connectorRoutes.post("/:connectorId/test", async (c) => {
  try {
    const result = await procurementConnectorService.testConnection(c.req.param("connectorId"));
    return c.json(result);
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "CONNECTION_TEST_FAILED",
        message: error instanceof Error ? error.message : "Connection test failed",
      },
    }, 500);
  }
});

/**
 * POST /university/:universityId/test-all
 * Test all connections for a university
 */
connectorRoutes.post("/university/:universityId/test-all", async (c) => {
  try {
    const results = await procurementConnectorService.testAllConnections(
      c.req.param("universityId")
    );
    return c.json({
      success: true,
      data: results,
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "CONNECTIONS_TEST_FAILED",
        message: error instanceof Error ? error.message : "Connection tests failed",
      },
    }, 500);
  }
});

// ============================================================================
// Catalog Operations
// ============================================================================

/**
 * POST /:connectorId/catalog/sync
 * Sync catalog for a connector
 */
connectorRoutes.post("/:connectorId/catalog/sync", async (c) => {
  try {
    const body = await c.req.json();
    const result = await procurementConnectorService.syncCatalog(
      c.req.param("connectorId"),
      body
    );
    return c.json(result);
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "CATALOG_SYNC_FAILED",
        message: error instanceof Error ? error.message : "Catalog sync failed",
      },
    }, 500);
  }
});

/**
 * GET /:connectorId/catalog
 * Get catalog items from a connector
 */
connectorRoutes.get("/:connectorId/catalog", async (c) => {
  try {
    const query = c.req.query();
    const options = {
      page: query.page ? parseInt(query.page) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize) : undefined,
      category: query.category || undefined,
      supplierId: query.supplierId || undefined,
      search: query.search || undefined,
    };

    const result = await procurementConnectorService.getCatalogItems(
      c.req.param("connectorId"),
      options
    );
    return c.json(result);
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "CATALOG_FETCH_FAILED",
        message: error instanceof Error ? error.message : "Failed to fetch catalog",
      },
    }, 500);
  }
});

/**
 * GET /university/:universityId/catalog/search
 * Search catalog across all connectors for a university
 */
connectorRoutes.get("/university/:universityId/catalog/search", async (c) => {
  try {
    const query = c.req.query();
    const searchQuery = query.q;

    if (!searchQuery) {
      return c.json({
        success: false,
        error: {
          code: "MISSING_QUERY",
          message: "Search query (q) is required",
        },
      }, 400);
    }

    const options = {
      systems: query.systems
        ? query.systems.split(",") as ProcurementSystem[]
        : undefined,
      category: query.category || undefined,
      maxResultsPerSystem: query.maxResults
        ? parseInt(query.maxResults)
        : undefined,
    };

    const result = await procurementConnectorService.searchCatalog(
      c.req.param("universityId"),
      searchQuery,
      options
    );

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "CATALOG_SEARCH_FAILED",
        message: error instanceof Error ? error.message : "Catalog search failed",
      },
    }, 500);
  }
});

// ============================================================================
// Purchase Order Operations
// ============================================================================

/**
 * POST /:connectorId/purchase-orders
 * Create a purchase order
 */
connectorRoutes.post("/:connectorId/purchase-orders", async (c) => {
  try {
    const body = await c.req.json();
    const result = await procurementConnectorService.createPurchaseOrder(
      c.req.param("connectorId"),
      body
    );
    return c.json(result, 201);
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "PO_CREATE_FAILED",
        message: error instanceof Error ? error.message : "Failed to create purchase order",
      },
    }, 500);
  }
});

/**
 * GET /:connectorId/purchase-orders/:poNumber
 * Get a purchase order
 */
connectorRoutes.get("/:connectorId/purchase-orders/:poNumber", async (c) => {
  try {
    const result = await procurementConnectorService.getPurchaseOrder(
      c.req.param("connectorId"),
      c.req.param("poNumber")
    );
    return c.json(result);
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "PO_FETCH_FAILED",
        message: error instanceof Error ? error.message : "Failed to fetch purchase order",
      },
    }, 500);
  }
});

/**
 * PATCH /:connectorId/purchase-orders/:poNumber/status
 * Update purchase order status
 */
connectorRoutes.patch("/:connectorId/purchase-orders/:poNumber/status", async (c) => {
  try {
    const { status, comments } = await c.req.json();
    if (!status) {
      return c.json({
        success: false,
        error: {
          code: "MISSING_STATUS",
          message: "Status is required",
        },
      }, 400);
    }

    const result = await procurementConnectorService.updatePurchaseOrderStatus(
      c.req.param("connectorId"),
      c.req.param("poNumber"),
      status as POStatus,
      comments
    );
    return c.json(result);
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "PO_UPDATE_FAILED",
        message: error instanceof Error ? error.message : "Failed to update purchase order",
      },
    }, 500);
  }
});

/**
 * POST /:connectorId/purchase-orders/:poNumber/send
 * Send purchase order to supplier
 */
connectorRoutes.post("/:connectorId/purchase-orders/:poNumber/send", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const result = await procurementConnectorService.sendPurchaseOrder(
      c.req.param("connectorId"),
      c.req.param("poNumber"),
      body.method
    );
    return c.json(result);
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "PO_SEND_FAILED",
        message: error instanceof Error ? error.message : "Failed to send purchase order",
      },
    }, 500);
  }
});

/**
 * GET /:connectorId/purchase-orders
 * List purchase orders
 */
connectorRoutes.get("/:connectorId/purchase-orders", async (c) => {
  try {
    const query = c.req.query();
    const options = {
      page: query.page ? parseInt(query.page) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize) : undefined,
      status: query.status as POStatus | undefined,
      supplierId: query.supplierId || undefined,
      fromDate: query.fromDate || undefined,
      toDate: query.toDate || undefined,
    };

    const result = await procurementConnectorService.listPurchaseOrders(
      c.req.param("connectorId"),
      options
    );
    return c.json(result);
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "PO_LIST_FAILED",
        message: error instanceof Error ? error.message : "Failed to list purchase orders",
      },
    }, 500);
  }
});

// ============================================================================
// Invoice Operations
// ============================================================================

/**
 * POST /:connectorId/invoices
 * Create an invoice
 */
connectorRoutes.post("/:connectorId/invoices", async (c) => {
  try {
    const body = await c.req.json();
    const result = await procurementConnectorService.createInvoice(
      c.req.param("connectorId"),
      body
    );
    return c.json(result, 201);
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "INVOICE_CREATE_FAILED",
        message: error instanceof Error ? error.message : "Failed to create invoice",
      },
    }, 500);
  }
});

/**
 * GET /:connectorId/invoices/:invoiceNumber
 * Get an invoice
 */
connectorRoutes.get("/:connectorId/invoices/:invoiceNumber", async (c) => {
  try {
    const result = await procurementConnectorService.getInvoice(
      c.req.param("connectorId"),
      c.req.param("invoiceNumber")
    );
    return c.json(result);
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "INVOICE_FETCH_FAILED",
        message: error instanceof Error ? error.message : "Failed to fetch invoice",
      },
    }, 500);
  }
});

/**
 * POST /:connectorId/invoices/:invoiceNumber/match
 * Match an invoice (3-way match)
 */
connectorRoutes.post("/:connectorId/invoices/:invoiceNumber/match", async (c) => {
  try {
    const result = await procurementConnectorService.matchInvoice(
      c.req.param("connectorId"),
      c.req.param("invoiceNumber")
    );
    return c.json(result);
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "INVOICE_MATCH_FAILED",
        message: error instanceof Error ? error.message : "Invoice matching failed",
      },
    }, 500);
  }
});

/**
 * GET /:connectorId/invoices
 * List invoices
 */
connectorRoutes.get("/:connectorId/invoices", async (c) => {
  try {
    const query = c.req.query();
    const options = {
      page: query.page ? parseInt(query.page) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize) : undefined,
      status: query.status as InvoiceStatus | undefined,
      supplierId: query.supplierId || undefined,
      poNumber: query.poNumber || undefined,
      fromDate: query.fromDate || undefined,
      toDate: query.toDate || undefined,
    };

    const result = await procurementConnectorService.listInvoices(
      c.req.param("connectorId"),
      options
    );
    return c.json(result);
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "INVOICE_LIST_FAILED",
        message: error instanceof Error ? error.message : "Failed to list invoices",
      },
    }, 500);
  }
});

// ============================================================================
// Requisition Operations
// ============================================================================

/**
 * POST /:connectorId/requisitions
 * Create a requisition
 */
connectorRoutes.post("/:connectorId/requisitions", async (c) => {
  try {
    const body = await c.req.json();
    const result = await procurementConnectorService.createRequisition(
      c.req.param("connectorId"),
      body
    );
    return c.json(result, 201);
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "REQ_CREATE_FAILED",
        message: error instanceof Error ? error.message : "Failed to create requisition",
      },
    }, 500);
  }
});

/**
 * POST /:connectorId/requisitions/:reqNumber/submit
 * Submit requisition for approval
 */
connectorRoutes.post("/:connectorId/requisitions/:reqNumber/submit", async (c) => {
  try {
    const result = await procurementConnectorService.submitRequisition(
      c.req.param("connectorId"),
      c.req.param("reqNumber")
    );
    return c.json(result);
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "REQ_SUBMIT_FAILED",
        message: error instanceof Error ? error.message : "Failed to submit requisition",
      },
    }, 500);
  }
});

/**
 * POST /:connectorId/requisitions/:reqNumber/approve
 * Approve a requisition
 */
connectorRoutes.post("/:connectorId/requisitions/:reqNumber/approve", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const result = await procurementConnectorService.processRequisitionApproval(
      c.req.param("connectorId"),
      c.req.param("reqNumber"),
      "approve",
      body.comments
    );
    return c.json(result);
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "REQ_APPROVE_FAILED",
        message: error instanceof Error ? error.message : "Failed to approve requisition",
      },
    }, 500);
  }
});

/**
 * POST /:connectorId/requisitions/:reqNumber/reject
 * Reject a requisition
 */
connectorRoutes.post("/:connectorId/requisitions/:reqNumber/reject", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const result = await procurementConnectorService.processRequisitionApproval(
      c.req.param("connectorId"),
      c.req.param("reqNumber"),
      "reject",
      body.comments
    );
    return c.json(result);
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "REQ_REJECT_FAILED",
        message: error instanceof Error ? error.message : "Failed to reject requisition",
      },
    }, 500);
  }
});

/**
 * POST /:connectorId/requisitions/:reqNumber/convert
 * Convert requisition to purchase order
 */
connectorRoutes.post("/:connectorId/requisitions/:reqNumber/convert", async (c) => {
  try {
    const result = await procurementConnectorService.convertRequisitionToPO(
      c.req.param("connectorId"),
      c.req.param("reqNumber")
    );
    return c.json(result);
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "REQ_CONVERT_FAILED",
        message: error instanceof Error ? error.message : "Failed to convert requisition to PO",
      },
    }, 500);
  }
});

// ============================================================================
// Supplier Operations
// ============================================================================

/**
 * GET /:connectorId/suppliers/:supplierId
 * Get a supplier
 */
connectorRoutes.get("/:connectorId/suppliers/:supplierId", async (c) => {
  try {
    const result = await procurementConnectorService.getSupplier(
      c.req.param("connectorId"),
      c.req.param("supplierId")
    );
    return c.json(result);
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "SUPPLIER_FETCH_FAILED",
        message: error instanceof Error ? error.message : "Failed to fetch supplier",
      },
    }, 500);
  }
});

/**
 * GET /university/:universityId/suppliers/search
 * Search suppliers across all connectors for a university
 */
connectorRoutes.get("/university/:universityId/suppliers/search", async (c) => {
  try {
    const query = c.req.query();
    const searchQuery = query.q;

    if (!searchQuery) {
      return c.json({
        success: false,
        error: {
          code: "MISSING_QUERY",
          message: "Search query (q) is required",
        },
      }, 400);
    }

    const options = {
      systems: query.systems
        ? query.systems.split(",") as ProcurementSystem[]
        : undefined,
      diversityCertification: query.diversityCertification || undefined,
      maxResultsPerSystem: query.maxResults
        ? parseInt(query.maxResults)
        : undefined,
    };

    const result = await procurementConnectorService.searchSuppliers(
      c.req.param("universityId"),
      searchQuery,
      options
    );

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "SUPPLIER_SEARCH_FAILED",
        message: error instanceof Error ? error.message : "Supplier search failed",
      },
    }, 500);
  }
});

// ============================================================================
// Punchout Operations
// ============================================================================

/**
 * POST /:connectorId/punchout/initiate
 * Initiate a punchout session
 */
connectorRoutes.post("/:connectorId/punchout/initiate", async (c) => {
  try {
    const { supplierId, userId, userEmail, userName, returnUrl } = await c.req.json();

    if (!supplierId || !userId || !userEmail || !userName || !returnUrl) {
      return c.json({
        success: false,
        error: {
          code: "MISSING_PARAMS",
          message: "Required: supplierId, userId, userEmail, userName, returnUrl",
        },
      }, 400);
    }

    const result = await procurementConnectorService.initiatePunchout(
      c.req.param("connectorId"),
      { supplierId, userId, userEmail, userName, returnUrl }
    );
    return c.json(result);
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "PUNCHOUT_INITIATE_FAILED",
        message: error instanceof Error ? error.message : "Punchout initiation failed",
      },
    }, 500);
  }
});

/**
 * POST /:connectorId/punchout/cart
 * Process punchout cart return
 */
connectorRoutes.post("/:connectorId/punchout/cart", async (c) => {
  try {
    const { sessionId, cartData } = await c.req.json();

    if (!sessionId || !cartData) {
      return c.json({
        success: false,
        error: {
          code: "MISSING_PARAMS",
          message: "Required: sessionId, cartData",
        },
      }, 400);
    }

    const result = await procurementConnectorService.processPunchoutCart(
      c.req.param("connectorId"),
      sessionId,
      cartData
    );
    return c.json(result);
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "PUNCHOUT_CART_FAILED",
        message: error instanceof Error ? error.message : "Cart processing failed",
      },
    }, 500);
  }
});

export default connectorRoutes;
