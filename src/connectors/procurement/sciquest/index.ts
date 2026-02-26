/**
 * SciQuest/JAGGAER ONE Connector
 *
 * Connector implementation for SciQuest (now JAGGAER ONE) procurement platform.
 * Supports higher education specific features including:
 * - Advanced eProcurement workflows
 * - Contract management integration
 * - Supplier relationship management
 * - Analytics and reporting
 * - Mobile procurement
 */

import { BaseProcurementConnector } from "../base/connector";
import { CXMLHandler } from "../base/cxml-handler";
import type {
  ConnectorConfig,
  ConnectorResponse,
  PaginatedResponse,
  CatalogItem,
  CatalogSyncRequest,
  CatalogSyncResult,
  PurchaseOrder,
  POStatus,
  Invoice,
  InvoiceStatus,
  Requisition,
  RequisitionStatus,
  Supplier,
  PunchoutSession,
  PunchoutCart,
} from "../base/types";

/**
 * SciQuest-specific configuration
 */
export interface SciQuestConfig extends ConnectorConfig {
  system: "sciquest";
  credentials: {
    /** API Key for REST API access */
    apiKey: string;
    /** API Secret */
    apiSecret: string;
    /** Organization identifier */
    orgId: string;
    /** Environment: production, sandbox, test */
    environment: "production" | "sandbox" | "test";
  };
  settings: {
    /** REST API base URL */
    apiBaseUrl: string;
    /** cXML endpoint for punchout */
    cxmlEndpoint?: string;
    /** Network ID for suppliers */
    networkId?: string;
    /** Default currency */
    defaultCurrency?: string;
    /** Enable advanced analytics */
    enableAnalytics?: boolean;
    /** Custom field mappings */
    customFields?: Record<string, string>;
    /** Approval workflow configuration */
    approvalConfig?: {
      /** Auto-approve below threshold */
      autoApproveThreshold?: number;
      /** Require receipts for matching */
      requireReceipts?: boolean;
    };
  };
}

/**
 * SciQuest/JAGGAER ONE Connector
 */
export class SciQuestConnector extends BaseProcurementConnector {
  private apiKey: string;
  private apiSecret: string;
  private orgId: string;
  private baseUrl: string;
  private cxmlEndpoint: string;
  private cxmlHandler: CXMLHandler;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(config: SciQuestConfig) {
    super(config);
    this.apiKey = config.credentials.apiKey;
    this.apiSecret = config.credentials.apiSecret;
    this.orgId = config.credentials.orgId;
    this.baseUrl = config.settings.apiBaseUrl;
    this.cxmlEndpoint = config.settings.cxmlEndpoint || `${this.baseUrl}/cxml`;
    this.cxmlHandler = new CXMLHandler({
      senderIdentity: config.credentials.orgId,
      senderSharedSecret: config.credentials.apiSecret,
      senderUserAgent: "TalosProcurement/1.0",
    });
  }

  // ============================================================================
  // Authentication
  // ============================================================================

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    const response = await fetch(`${this.baseUrl}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.apiKey,
        client_secret: this.apiSecret,
        scope: "procurement.read procurement.write",
      }),
    });

    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.statusText}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = new Date(Date.now() + (data.expires_in - 60) * 1000);
    return this.accessToken;
  }

  private async apiRequest<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Organization-Id": this.orgId,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`SciQuest API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  async testConnection(): Promise<ConnectorResponse<{ connected: boolean; version?: string }>> {
    try {
      const result = await this.apiRequest<{ status: string; version: string }>(
        "GET",
        "/api/v2/system/health"
      );

      return {
        success: true,
        data: {
          connected: result.status === "healthy",
          version: result.version,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "CONNECTION_FAILED",
          message: error instanceof Error ? error.message : "Connection test failed",
        },
      };
    }
  }

  // ============================================================================
  // Catalog Operations
  // ============================================================================

  async syncCatalog(request: CatalogSyncRequest): Promise<ConnectorResponse<CatalogSyncResult>> {
    try {
      const response = await this.apiRequest<{
        syncId: string;
        itemsProcessed: number;
        itemsAdded: number;
        itemsUpdated: number;
        itemsRemoved: number;
        errors: Array<{ sku: string; error: string }>;
      }>("POST", "/api/v2/catalog/sync", {
        supplierId: request.supplierId,
        catalogId: request.catalogId,
        fullSync: request.fullSync,
        items: request.items,
      });

      return {
        success: true,
        data: {
          syncId: response.syncId,
          status: "completed",
          itemsProcessed: response.itemsProcessed,
          itemsAdded: response.itemsAdded,
          itemsUpdated: response.itemsUpdated,
          itemsRemoved: response.itemsRemoved,
          errors: response.errors.map(e => ({
            itemId: e.sku,
            code: "SYNC_ERROR",
            message: e.error,
          })),
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "CATALOG_SYNC_FAILED",
          message: error instanceof Error ? error.message : "Catalog sync failed",
        },
      };
    }
  }

  async getCatalogItems(options: {
    page?: number;
    pageSize?: number;
    category?: string;
    supplierId?: string;
    search?: string;
  }): Promise<ConnectorResponse<PaginatedResponse<CatalogItem>>> {
    try {
      const params = new URLSearchParams();
      params.set("page", String(options.page || 1));
      params.set("pageSize", String(options.pageSize || 50));
      if (options.category) params.set("category", options.category);
      if (options.supplierId) params.set("supplierId", options.supplierId);
      if (options.search) params.set("q", options.search);

      const response = await this.apiRequest<{
        items: Array<{
          id: string;
          sku: string;
          name: string;
          description: string;
          price: number;
          currency: string;
          uom: string;
          category: { id: string; name: string; path: string[] };
          supplier: { id: string; name: string };
          images: string[];
          attributes: Record<string, string>;
          contractId?: string;
          availability: string;
        }>;
        pagination: { page: number; pageSize: number; total: number; totalPages: number };
      }>("GET", `/api/v2/catalog/items?${params}`);

      return {
        success: true,
        data: {
          items: response.items.map(item => ({
            id: item.id,
            sku: item.sku,
            name: item.name,
            description: item.description,
            price: item.price,
            currency: item.currency,
            unitOfMeasure: item.uom,
            category: {
              id: item.category.id,
              name: item.category.name,
              path: item.category.path,
            },
            supplier: {
              id: item.supplier.id,
              name: item.supplier.name,
            },
            images: item.images,
            attributes: item.attributes,
            contractId: item.contractId,
            availability: item.availability as "in_stock" | "out_of_stock" | "limited",
            lastUpdated: new Date().toISOString(),
          })),
          pagination: {
            page: response.pagination.page,
            pageSize: response.pagination.pageSize,
            total: response.pagination.total,
            totalPages: response.pagination.totalPages,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "CATALOG_FETCH_FAILED",
          message: error instanceof Error ? error.message : "Failed to fetch catalog items",
        },
      };
    }
  }

  async searchCatalog(
    query: string,
    options?: { category?: string; supplierId?: string; maxResults?: number }
  ): Promise<ConnectorResponse<CatalogItem[]>> {
    try {
      const params = new URLSearchParams();
      params.set("q", query);
      params.set("limit", String(options?.maxResults || 20));
      if (options?.category) params.set("category", options.category);
      if (options?.supplierId) params.set("supplierId", options.supplierId);

      const response = await this.apiRequest<{
        results: Array<{
          id: string;
          sku: string;
          name: string;
          description: string;
          price: number;
          currency: string;
          uom: string;
          category: { id: string; name: string };
          supplier: { id: string; name: string };
          score: number;
        }>;
      }>("GET", `/api/v2/catalog/search?${params}`);

      return {
        success: true,
        data: response.results.map(item => ({
          id: item.id,
          sku: item.sku,
          name: item.name,
          description: item.description,
          price: item.price,
          currency: item.currency,
          unitOfMeasure: item.uom,
          category: {
            id: item.category.id,
            name: item.category.name,
            path: [],
          },
          supplier: {
            id: item.supplier.id,
            name: item.supplier.name,
          },
          images: [],
          attributes: {},
          availability: "in_stock",
          lastUpdated: new Date().toISOString(),
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "SEARCH_FAILED",
          message: error instanceof Error ? error.message : "Catalog search failed",
        },
      };
    }
  }

  // ============================================================================
  // Purchase Order Operations
  // ============================================================================

  async createPurchaseOrder(
    order: Omit<PurchaseOrder, "id" | "externalId" | "createdAt" | "updatedAt">
  ): Promise<ConnectorResponse<PurchaseOrder>> {
    try {
      const response = await this.apiRequest<{
        id: string;
        poNumber: string;
        externalId: string;
        status: string;
        createdAt: string;
      }>("POST", "/api/v2/purchase-orders", {
        poNumber: order.poNumber,
        orderDate: order.orderDate,
        supplier: order.supplier,
        shipTo: order.shipTo,
        billTo: order.billTo,
        lineItems: order.lineItems,
        subtotal: order.subtotal,
        tax: order.tax,
        shipping: order.shipping,
        total: order.total,
        currency: order.currency,
        paymentTerms: order.paymentTerms,
        notes: order.notes,
        customFields: order.customFields,
      });

      return {
        success: true,
        data: {
          ...order,
          id: response.id,
          externalId: response.externalId,
          status: response.status as POStatus,
          createdAt: response.createdAt,
          updatedAt: response.createdAt,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "PO_CREATE_FAILED",
          message: error instanceof Error ? error.message : "Failed to create purchase order",
        },
      };
    }
  }

  async getPurchaseOrder(poNumber: string): Promise<ConnectorResponse<PurchaseOrder>> {
    try {
      const response = await this.apiRequest<PurchaseOrder>(
        "GET",
        `/api/v2/purchase-orders/${encodeURIComponent(poNumber)}`
      );

      return { success: true, data: response };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "PO_NOT_FOUND",
          message: error instanceof Error ? error.message : "Purchase order not found",
        },
      };
    }
  }

  async updatePurchaseOrderStatus(
    poNumber: string,
    status: POStatus,
    comments?: string
  ): Promise<ConnectorResponse<PurchaseOrder>> {
    try {
      const response = await this.apiRequest<PurchaseOrder>(
        "PATCH",
        `/api/v2/purchase-orders/${encodeURIComponent(poNumber)}/status`,
        { status, comments }
      );

      return { success: true, data: response };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "PO_UPDATE_FAILED",
          message: error instanceof Error ? error.message : "Failed to update PO status",
        },
      };
    }
  }

  async sendPurchaseOrder(
    poNumber: string,
    method?: "cxml" | "edi" | "email"
  ): Promise<ConnectorResponse<{ sent: boolean; confirmationId?: string }>> {
    try {
      const response = await this.apiRequest<{ sent: boolean; confirmationId: string }>(
        "POST",
        `/api/v2/purchase-orders/${encodeURIComponent(poNumber)}/send`,
        { method: method || "cxml" }
      );

      return { success: true, data: response };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "PO_SEND_FAILED",
          message: error instanceof Error ? error.message : "Failed to send PO",
        },
      };
    }
  }

  async listPurchaseOrders(options: {
    page?: number;
    pageSize?: number;
    status?: POStatus;
    supplierId?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<ConnectorResponse<PaginatedResponse<PurchaseOrder>>> {
    try {
      const params = new URLSearchParams();
      params.set("page", String(options.page || 1));
      params.set("pageSize", String(options.pageSize || 50));
      if (options.status) params.set("status", options.status);
      if (options.supplierId) params.set("supplierId", options.supplierId);
      if (options.fromDate) params.set("fromDate", options.fromDate);
      if (options.toDate) params.set("toDate", options.toDate);

      const response = await this.apiRequest<{
        items: PurchaseOrder[];
        pagination: { page: number; pageSize: number; total: number; totalPages: number };
      }>("GET", `/api/v2/purchase-orders?${params}`);

      return {
        success: true,
        data: {
          items: response.items,
          pagination: response.pagination,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "PO_LIST_FAILED",
          message: error instanceof Error ? error.message : "Failed to list purchase orders",
        },
      };
    }
  }

  // ============================================================================
  // Invoice Operations
  // ============================================================================

  async createInvoice(
    invoice: Omit<Invoice, "id" | "externalId" | "createdAt" | "updatedAt">
  ): Promise<ConnectorResponse<Invoice>> {
    try {
      const response = await this.apiRequest<Invoice>("POST", "/api/v2/invoices", invoice);
      return { success: true, data: response };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "INVOICE_CREATE_FAILED",
          message: error instanceof Error ? error.message : "Failed to create invoice",
        },
      };
    }
  }

  async getInvoice(invoiceNumber: string): Promise<ConnectorResponse<Invoice>> {
    try {
      const response = await this.apiRequest<Invoice>(
        "GET",
        `/api/v2/invoices/${encodeURIComponent(invoiceNumber)}`
      );
      return { success: true, data: response };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "INVOICE_NOT_FOUND",
          message: error instanceof Error ? error.message : "Invoice not found",
        },
      };
    }
  }

  async matchInvoice(invoiceNumber: string): Promise<ConnectorResponse<Invoice>> {
    try {
      const response = await this.apiRequest<Invoice>(
        "POST",
        `/api/v2/invoices/${encodeURIComponent(invoiceNumber)}/match`
      );
      return { success: true, data: response };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "INVOICE_MATCH_FAILED",
          message: error instanceof Error ? error.message : "Invoice matching failed",
        },
      };
    }
  }

  async listInvoices(options: {
    page?: number;
    pageSize?: number;
    status?: InvoiceStatus;
    supplierId?: string;
    poNumber?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<ConnectorResponse<PaginatedResponse<Invoice>>> {
    try {
      const params = new URLSearchParams();
      params.set("page", String(options.page || 1));
      params.set("pageSize", String(options.pageSize || 50));
      if (options.status) params.set("status", options.status);
      if (options.supplierId) params.set("supplierId", options.supplierId);
      if (options.poNumber) params.set("poNumber", options.poNumber);
      if (options.fromDate) params.set("fromDate", options.fromDate);
      if (options.toDate) params.set("toDate", options.toDate);

      const response = await this.apiRequest<{
        items: Invoice[];
        pagination: { page: number; pageSize: number; total: number; totalPages: number };
      }>("GET", `/api/v2/invoices?${params}`);

      return { success: true, data: response };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "INVOICE_LIST_FAILED",
          message: error instanceof Error ? error.message : "Failed to list invoices",
        },
      };
    }
  }

  // ============================================================================
  // Requisition Operations
  // ============================================================================

  async createRequisition(
    requisition: Omit<Requisition, "id" | "externalId" | "createdAt" | "updatedAt">
  ): Promise<ConnectorResponse<Requisition>> {
    try {
      const response = await this.apiRequest<Requisition>(
        "POST",
        "/api/v2/requisitions",
        requisition
      );
      return { success: true, data: response };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "REQ_CREATE_FAILED",
          message: error instanceof Error ? error.message : "Failed to create requisition",
        },
      };
    }
  }

  async getRequisition(requisitionNumber: string): Promise<ConnectorResponse<Requisition>> {
    try {
      const response = await this.apiRequest<Requisition>(
        "GET",
        `/api/v2/requisitions/${encodeURIComponent(requisitionNumber)}`
      );
      return { success: true, data: response };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "REQ_NOT_FOUND",
          message: error instanceof Error ? error.message : "Requisition not found",
        },
      };
    }
  }

  async submitRequisition(requisitionNumber: string): Promise<ConnectorResponse<Requisition>> {
    try {
      const response = await this.apiRequest<Requisition>(
        "POST",
        `/api/v2/requisitions/${encodeURIComponent(requisitionNumber)}/submit`
      );
      return { success: true, data: response };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "REQ_SUBMIT_FAILED",
          message: error instanceof Error ? error.message : "Failed to submit requisition",
        },
      };
    }
  }

  async processRequisitionApproval(
    requisitionNumber: string,
    decision: "approve" | "reject",
    comments?: string
  ): Promise<ConnectorResponse<Requisition>> {
    try {
      const response = await this.apiRequest<Requisition>(
        "POST",
        `/api/v2/requisitions/${encodeURIComponent(requisitionNumber)}/approval`,
        { decision, comments }
      );
      return { success: true, data: response };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "REQ_APPROVAL_FAILED",
          message: error instanceof Error ? error.message : "Failed to process approval",
        },
      };
    }
  }

  async convertRequisitionToPO(requisitionNumber: string): Promise<ConnectorResponse<PurchaseOrder>> {
    try {
      const response = await this.apiRequest<PurchaseOrder>(
        "POST",
        `/api/v2/requisitions/${encodeURIComponent(requisitionNumber)}/convert`
      );
      return { success: true, data: response };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "REQ_CONVERT_FAILED",
          message: error instanceof Error ? error.message : "Failed to convert requisition to PO",
        },
      };
    }
  }

  async listRequisitions(options: {
    page?: number;
    pageSize?: number;
    status?: RequisitionStatus;
    requesterId?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<ConnectorResponse<PaginatedResponse<Requisition>>> {
    try {
      const params = new URLSearchParams();
      params.set("page", String(options.page || 1));
      params.set("pageSize", String(options.pageSize || 50));
      if (options.status) params.set("status", options.status);
      if (options.requesterId) params.set("requesterId", options.requesterId);
      if (options.fromDate) params.set("fromDate", options.fromDate);
      if (options.toDate) params.set("toDate", options.toDate);

      const response = await this.apiRequest<{
        items: Requisition[];
        pagination: { page: number; pageSize: number; total: number; totalPages: number };
      }>("GET", `/api/v2/requisitions?${params}`);

      return { success: true, data: response };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "REQ_LIST_FAILED",
          message: error instanceof Error ? error.message : "Failed to list requisitions",
        },
      };
    }
  }

  // ============================================================================
  // Supplier Operations
  // ============================================================================

  async getSupplier(supplierIdOrCode: string): Promise<ConnectorResponse<Supplier>> {
    try {
      const response = await this.apiRequest<Supplier>(
        "GET",
        `/api/v2/suppliers/${encodeURIComponent(supplierIdOrCode)}`
      );
      return { success: true, data: response };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "SUPPLIER_NOT_FOUND",
          message: error instanceof Error ? error.message : "Supplier not found",
        },
      };
    }
  }

  async searchSuppliers(
    query: string,
    options?: { diversityCertification?: string; maxResults?: number }
  ): Promise<ConnectorResponse<Supplier[]>> {
    try {
      const params = new URLSearchParams();
      params.set("q", query);
      params.set("limit", String(options?.maxResults || 20));
      if (options?.diversityCertification) {
        params.set("certification", options.diversityCertification);
      }

      const response = await this.apiRequest<{ suppliers: Supplier[] }>(
        "GET",
        `/api/v2/suppliers/search?${params}`
      );

      return { success: true, data: response.suppliers };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "SUPPLIER_SEARCH_FAILED",
          message: error instanceof Error ? error.message : "Supplier search failed",
        },
      };
    }
  }

  async listSuppliers(options: {
    page?: number;
    pageSize?: number;
    status?: string;
    category?: string;
  }): Promise<ConnectorResponse<PaginatedResponse<Supplier>>> {
    try {
      const params = new URLSearchParams();
      params.set("page", String(options.page || 1));
      params.set("pageSize", String(options.pageSize || 50));
      if (options.status) params.set("status", options.status);
      if (options.category) params.set("category", options.category);

      const response = await this.apiRequest<{
        items: Supplier[];
        pagination: { page: number; pageSize: number; total: number; totalPages: number };
      }>("GET", `/api/v2/suppliers?${params}`);

      return { success: true, data: response };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "SUPPLIER_LIST_FAILED",
          message: error instanceof Error ? error.message : "Failed to list suppliers",
        },
      };
    }
  }

  // ============================================================================
  // Punchout Operations
  // ============================================================================

  async initiatePunchout(options: {
    supplierId: string;
    userId: string;
    userEmail: string;
    userName: string;
    returnUrl: string;
  }): Promise<ConnectorResponse<PunchoutSession>> {
    try {
      // Get supplier punchout configuration
      const supplierConfig = await this.apiRequest<{
        punchoutUrl: string;
        identity: string;
        sharedSecret: string;
      }>("GET", `/api/v2/suppliers/${options.supplierId}/punchout-config`);

      // Generate cXML PunchoutSetupRequest
      const setupRequest = this.cxmlHandler.generatePunchoutSetupRequest({
        buyerCookie: `TALOS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        browserFormPost: options.returnUrl,
        supplierDomain: supplierConfig.identity,
        userId: options.userId,
        userEmail: options.userEmail,
        userName: options.userName,
      });

      // Send to supplier
      const response = await fetch(supplierConfig.punchoutUrl, {
        method: "POST",
        headers: { "Content-Type": "application/xml" },
        body: setupRequest,
      });

      const responseXml = await response.text();
      const parsed = this.cxmlHandler.parsePunchoutSetupResponse(responseXml);

      if (!parsed.success || !parsed.startPageUrl) {
        throw new Error(parsed.errorMessage || "Punchout setup failed");
      }

      const session: PunchoutSession = {
        sessionId: parsed.buyerCookie || `session-${Date.now()}`,
        supplierId: options.supplierId,
        userId: options.userId,
        status: "active",
        startPageUrl: parsed.startPageUrl,
        returnUrl: options.returnUrl,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };

      return { success: true, data: session };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "PUNCHOUT_FAILED",
          message: error instanceof Error ? error.message : "Punchout initiation failed",
        },
      };
    }
  }

  async processPunchoutCart(
    sessionId: string,
    cartData: string
  ): Promise<ConnectorResponse<PunchoutCart>> {
    try {
      const cart = this.cxmlHandler.parsePunchoutOrderMessage(cartData);

      if (!cart) {
        throw new Error("Failed to parse cart data");
      }

      // Store the cart for later requisition creation
      await this.apiRequest("POST", "/api/v2/punchout/carts", {
        sessionId,
        cart,
      });

      return { success: true, data: cart };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "CART_PROCESS_FAILED",
          message: error instanceof Error ? error.message : "Cart processing failed",
        },
      };
    }
  }

  // ============================================================================
  // SciQuest-Specific Operations
  // ============================================================================

  /**
   * Get spend analytics for the organization
   */
  async getSpendAnalytics(options: {
    fromDate: string;
    toDate: string;
    groupBy?: "supplier" | "category" | "department";
  }): Promise<ConnectorResponse<{
    totalSpend: number;
    breakdown: Array<{ name: string; amount: number; percentage: number }>;
  }>> {
    try {
      const params = new URLSearchParams();
      params.set("fromDate", options.fromDate);
      params.set("toDate", options.toDate);
      if (options.groupBy) params.set("groupBy", options.groupBy);

      const response = await this.apiRequest<{
        totalSpend: number;
        breakdown: Array<{ name: string; amount: number; percentage: number }>;
      }>("GET", `/api/v2/analytics/spend?${params}`);

      return { success: true, data: response };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "ANALYTICS_FAILED",
          message: error instanceof Error ? error.message : "Failed to get spend analytics",
        },
      };
    }
  }

  /**
   * Get contract utilization metrics
   */
  async getContractUtilization(contractId?: string): Promise<ConnectorResponse<{
    contracts: Array<{
      id: string;
      name: string;
      totalValue: number;
      utilizedValue: number;
      utilizationPercentage: number;
      expirationDate: string;
    }>;
  }>> {
    try {
      const endpoint = contractId
        ? `/api/v2/contracts/${contractId}/utilization`
        : "/api/v2/contracts/utilization";

      const response = await this.apiRequest<{
        contracts: Array<{
          id: string;
          name: string;
          totalValue: number;
          utilizedValue: number;
          utilizationPercentage: number;
          expirationDate: string;
        }>;
      }>("GET", endpoint);

      return { success: true, data: response };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "CONTRACT_UTIL_FAILED",
          message: error instanceof Error ? error.message : "Failed to get contract utilization",
        },
      };
    }
  }
}

export default SciQuestConnector;
