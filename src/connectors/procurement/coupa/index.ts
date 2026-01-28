/**
 * Coupa Connector
 *
 * Connector implementation for Coupa procurement platform.
 * Supports business spend management features including:
 * - Procurement (Coupa Procure)
 * - Invoicing (Coupa Pay)
 * - Sourcing (Coupa Sourcing)
 * - Contract Lifecycle Management
 * - Spend Analysis
 * - Supplier Management
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
 * Coupa-specific configuration
 */
export interface CoupaConfig extends ConnectorConfig {
  system: "coupa";
  credentials: {
    /** Coupa instance URL */
    instanceUrl: string;
    /** API Key for authentication */
    apiKey: string;
    /** OAuth2 Client ID (optional) */
    clientId?: string;
    /** OAuth2 Client Secret (optional) */
    clientSecret?: string;
    /** OAuth2 Scope */
    scope?: string;
  };
  settings: {
    /** API base URL */
    apiBaseUrl: string;
    /** cXML endpoint for supplier integration */
    cxmlEndpoint?: string;
    /** Default chart of accounts */
    defaultChartOfAccounts?: string;
    /** Default currency */
    defaultCurrency?: string;
    /** Content group for catalog */
    contentGroup?: string;
    /** Enable Coupa Pay features */
    enableCoupaPay?: boolean;
    /** Custom field mappings */
    customFields?: Record<string, string>;
  };
}

/**
 * Coupa Connector
 */
export class CoupaConnector extends BaseProcurementConnector {
  private instanceUrl: string;
  private apiKey: string;
  private baseUrl: string;
  private cxmlEndpoint: string;
  private cxmlHandler: CXMLHandler;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private clientId?: string;
  private clientSecret?: string;

  constructor(config: CoupaConfig) {
    super(config);
    this.instanceUrl = config.credentials.instanceUrl;
    this.apiKey = config.credentials.apiKey;
    this.clientId = config.credentials.clientId;
    this.clientSecret = config.credentials.clientSecret;
    this.baseUrl = config.settings.apiBaseUrl;
    this.cxmlEndpoint = config.settings.cxmlEndpoint || `${this.baseUrl}/cxml/requisition`;
    this.cxmlHandler = new CXMLHandler({
      senderIdentity: config.universityId,
      senderSharedSecret: config.credentials.apiKey,
      senderUserAgent: "TalosProcurement/1.0",
    });
  }

  // ============================================================================
  // Authentication
  // ============================================================================

  private async getAccessToken(): Promise<string> {
    // If using API Key authentication
    if (!this.clientId || !this.clientSecret) {
      return this.apiKey;
    }

    // Check if we have a valid token
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    // OAuth2 authentication
    const response = await fetch(`${this.instanceUrl}/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: "core.common.read core.common.write",
      }),
    });

    if (!response.ok) {
      throw new Error(`Coupa authentication failed: ${response.statusText}`);
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

    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    // Coupa uses either API Key or OAuth Bearer token
    if (this.clientId && this.clientSecret) {
      headers.Authorization = `Bearer ${token}`;
    } else {
      headers["X-COUPA-API-KEY"] = token;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Coupa API error: ${response.status} - ${error}`);
    }

    // Handle empty responses
    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text);
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  async testConnection(): Promise<ConnectorResponse<{ connected: boolean; version?: string }>> {
    try {
      const result = await this.apiRequest<{ success: boolean; api_version: string }>(
        "GET",
        "/api/setup"
      );

      return {
        success: true,
        data: {
          connected: result.success !== false,
          version: result.api_version,
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
        id: number;
        status: string;
        items_processed: number;
        items_created: number;
        items_updated: number;
        items_deleted: number;
        errors: Array<{ item_number: string; message: string }>;
      }>("POST", "/api/catalog_items/batch", {
        catalog: { id: request.catalogId },
        supplier: { id: request.supplierId },
        full_replace: request.fullSync,
        items: request.items?.map(item => ({
          item_number: item.sku,
          name: item.name,
          description: item.description,
          price: item.price,
          currency: { code: item.currency },
          uom: { code: item.unitOfMeasure },
          commodity: item.categoryId ? { id: item.categoryId } : undefined,
          active: true,
        })),
      });

      return {
        success: true,
        data: {
          syncId: String(response.id),
          status: response.status === "complete" ? "completed" : "in_progress",
          itemsProcessed: response.items_processed,
          itemsAdded: response.items_created,
          itemsUpdated: response.items_updated,
          itemsRemoved: response.items_deleted,
          errors: response.errors?.map(e => ({
            itemId: e.item_number,
            code: "SYNC_ERROR",
            message: e.message,
          })) || [],
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
      params.set("offset", String(((options.page || 1) - 1) * (options.pageSize || 50)));
      params.set("limit", String(options.pageSize || 50));
      if (options.category) params.set("commodity[id]", options.category);
      if (options.supplierId) params.set("supplier[id]", options.supplierId);
      if (options.search) params.set("name[contains]", options.search);
      params.set("return_object", "shallow");

      const response = await this.apiRequest<Array<{
        id: number;
        item_number: string;
        name: string;
        description: string;
        price: string;
        currency: { code: string };
        uom: { code: string };
        commodity: { id: number; name: string };
        supplier: { id: number; name: string };
        image_url?: string;
        active: boolean;
        updated_at: string;
      }>>("GET", `/api/catalog_items?${params}`);

      // Get total count
      const countResponse = await this.apiRequest<{ count: number }>(
        "GET",
        `/api/catalog_items/count?${params}`
      );

      const totalPages = Math.ceil(countResponse.count / (options.pageSize || 50));

      return {
        success: true,
        data: {
          items: response.map(item => ({
            id: String(item.id),
            sku: item.item_number,
            name: item.name,
            description: item.description,
            price: parseFloat(item.price),
            currency: item.currency?.code || "USD",
            unitOfMeasure: item.uom?.code || "EA",
            category: {
              id: String(item.commodity?.id || ""),
              name: item.commodity?.name || "Uncategorized",
              path: [],
            },
            supplier: {
              id: String(item.supplier?.id || ""),
              name: item.supplier?.name || "",
            },
            images: item.image_url ? [item.image_url] : [],
            attributes: {},
            availability: item.active ? "in_stock" : "out_of_stock",
            lastUpdated: item.updated_at,
          })),
          pagination: {
            page: options.page || 1,
            pageSize: options.pageSize || 50,
            total: countResponse.count,
            totalPages,
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
      params.set("name[contains]", query);
      params.set("limit", String(options?.maxResults || 20));
      if (options?.category) params.set("commodity[id]", options.category);
      if (options?.supplierId) params.set("supplier[id]", options.supplierId);
      params.set("active", "true");

      const response = await this.apiRequest<Array<{
        id: number;
        item_number: string;
        name: string;
        description: string;
        price: string;
        currency: { code: string };
        uom: { code: string };
        commodity: { id: number; name: string };
        supplier: { id: number; name: string };
      }>>("GET", `/api/catalog_items?${params}`);

      return {
        success: true,
        data: response.map(item => ({
          id: String(item.id),
          sku: item.item_number,
          name: item.name,
          description: item.description,
          price: parseFloat(item.price),
          currency: item.currency?.code || "USD",
          unitOfMeasure: item.uom?.code || "EA",
          category: {
            id: String(item.commodity?.id || ""),
            name: item.commodity?.name || "Uncategorized",
            path: [],
          },
          supplier: {
            id: String(item.supplier?.id || ""),
            name: item.supplier?.name || "",
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
        id: number;
        po_number: string;
        status: string;
        created_at: string;
      }>("POST", "/api/purchase_orders", {
        po_number: order.poNumber,
        order_date: order.orderDate,
        supplier: { id: parseInt(order.supplier.id) },
        ship_to_address: {
          street1: order.shipTo.street1,
          street2: order.shipTo.street2,
          city: order.shipTo.city,
          state: order.shipTo.state,
          postal_code: order.shipTo.postalCode,
          country: { code: order.shipTo.country },
        },
        order_lines: order.lineItems.map((line, idx) => ({
          line_num: idx + 1,
          description: line.description,
          quantity: String(line.quantity),
          price: String(line.unitPrice),
          uom: { code: line.unitOfMeasure },
          total: String(line.totalPrice),
          item: line.catalogItemId ? { id: parseInt(line.catalogItemId) } : undefined,
        })),
        currency: { code: order.currency },
        payment_term: order.paymentTerms ? { code: order.paymentTerms } : undefined,
      });

      return {
        success: true,
        data: {
          ...order,
          id: String(response.id),
          externalId: String(response.id),
          status: this.mapCoupaPOStatus(response.status),
          createdAt: response.created_at,
          updatedAt: response.created_at,
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
      const response = await this.apiRequest<Array<{
        id: number;
        po_number: string;
        order_date: string;
        supplier: { id: number; name: string };
        ship_to_address: {
          street1: string;
          street2?: string;
          city: string;
          state: string;
          postal_code: string;
          country: { code: string };
        };
        order_lines: Array<{
          line_num: number;
          description: string;
          quantity: string;
          price: string;
          uom: { code: string };
          total: string;
        }>;
        total: string;
        currency: { code: string };
        status: string;
        created_at: string;
        updated_at: string;
      }>>(`GET`, `/api/purchase_orders?po_number=${encodeURIComponent(poNumber)}`);

      if (response.length === 0) {
        throw new Error(`Purchase order ${poNumber} not found`);
      }

      const po = response[0];

      return {
        success: true,
        data: {
          id: String(po.id),
          poNumber: po.po_number,
          externalId: String(po.id),
          orderDate: po.order_date,
          supplier: {
            id: String(po.supplier.id),
            name: po.supplier.name,
          },
          shipTo: {
            street1: po.ship_to_address?.street1 || "",
            street2: po.ship_to_address?.street2,
            city: po.ship_to_address?.city || "",
            state: po.ship_to_address?.state || "",
            postalCode: po.ship_to_address?.postal_code || "",
            country: po.ship_to_address?.country?.code || "",
          },
          billTo: { street1: "", city: "", state: "", postalCode: "", country: "" },
          lineItems: po.order_lines.map(line => ({
            lineNumber: line.line_num,
            description: line.description,
            quantity: parseFloat(line.quantity),
            unitPrice: parseFloat(line.price),
            unitOfMeasure: line.uom?.code || "EA",
            totalPrice: parseFloat(line.total),
          })),
          subtotal: parseFloat(po.total),
          tax: 0,
          shipping: 0,
          total: parseFloat(po.total),
          currency: po.currency?.code || "USD",
          status: this.mapCoupaPOStatus(po.status),
          createdAt: po.created_at,
          updatedAt: po.updated_at,
        },
      };
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
      // First get the PO to get its ID
      const poResult = await this.getPurchaseOrder(poNumber);
      if (!poResult.success || !poResult.data) {
        throw new Error(`Purchase order ${poNumber} not found`);
      }

      // Coupa uses specific endpoints for status changes
      const endpoint = this.getCoupaStatusEndpoint(status, poResult.data.id);

      await this.apiRequest("PUT", endpoint, {
        comment: comments,
      });

      return {
        success: true,
        data: {
          ...poResult.data,
          status,
          updatedAt: new Date().toISOString(),
        },
      };
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
      const poResult = await this.getPurchaseOrder(poNumber);
      if (!poResult.success || !poResult.data) {
        throw new Error(`Purchase order ${poNumber} not found`);
      }

      // Coupa uses the transmit endpoint
      const response = await this.apiRequest<{ transmitted: boolean; transmission_id: number }>(
        "PUT",
        `/api/purchase_orders/${poResult.data.id}/transmit`,
        { transmission_method: method || "cxml" }
      );

      return {
        success: true,
        data: {
          sent: response.transmitted,
          confirmationId: String(response.transmission_id),
        },
      };
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
      params.set("offset", String(((options.page || 1) - 1) * (options.pageSize || 50)));
      params.set("limit", String(options.pageSize || 50));
      if (options.status) params.set("status", this.mapToCoupaPOStatus(options.status));
      if (options.supplierId) params.set("supplier[id]", options.supplierId);
      if (options.fromDate) params.set("order_date[gt_or_eq]", options.fromDate);
      if (options.toDate) params.set("order_date[lt_or_eq]", options.toDate);
      params.set("return_object", "shallow");

      const response = await this.apiRequest<Array<{
        id: number;
        po_number: string;
        order_date: string;
        supplier: { id: number; name: string };
        total: string;
        currency: { code: string };
        status: string;
        created_at: string;
        updated_at: string;
      }>>("GET", `/api/purchase_orders?${params}`);

      const countResponse = await this.apiRequest<{ count: number }>(
        "GET",
        `/api/purchase_orders/count?${params}`
      );

      return {
        success: true,
        data: {
          items: response.map(po => ({
            id: String(po.id),
            poNumber: po.po_number,
            externalId: String(po.id),
            orderDate: po.order_date,
            supplier: {
              id: String(po.supplier.id),
              name: po.supplier.name,
            },
            shipTo: { street1: "", city: "", state: "", postalCode: "", country: "" },
            billTo: { street1: "", city: "", state: "", postalCode: "", country: "" },
            lineItems: [],
            subtotal: parseFloat(po.total),
            tax: 0,
            shipping: 0,
            total: parseFloat(po.total),
            currency: po.currency?.code || "USD",
            status: this.mapCoupaPOStatus(po.status),
            createdAt: po.created_at,
            updatedAt: po.updated_at,
          })),
          pagination: {
            page: options.page || 1,
            pageSize: options.pageSize || 50,
            total: countResponse.count,
            totalPages: Math.ceil(countResponse.count / (options.pageSize || 50)),
          },
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
      const response = await this.apiRequest<{
        id: number;
        invoice_number: string;
        status: string;
        created_at: string;
      }>("POST", "/api/invoices", {
        invoice_number: invoice.invoiceNumber,
        invoice_date: invoice.invoiceDate,
        payment_due_date: invoice.dueDate,
        supplier: { id: parseInt(invoice.supplier.id) },
        order_header_num: invoice.poNumber,
        invoice_lines: invoice.lineItems.map((line, idx) => ({
          line_num: idx + 1,
          description: line.description,
          quantity: String(line.quantity),
          price: String(line.unitPrice),
          total: String(line.totalPrice),
        })),
        gross_total: String(invoice.subtotal),
        tax_amount: String(invoice.tax),
        total: String(invoice.total),
        currency: { code: invoice.currency },
      });

      return {
        success: true,
        data: {
          ...invoice,
          id: String(response.id),
          externalId: String(response.id),
          status: this.mapCoupaInvoiceStatus(response.status),
          createdAt: response.created_at,
          updatedAt: response.created_at,
        },
      };
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
      const response = await this.apiRequest<Array<{
        id: number;
        invoice_number: string;
        invoice_date: string;
        payment_due_date: string;
        supplier: { id: number; name: string };
        order_header_num?: string;
        invoice_lines: Array<{
          line_num: number;
          description: string;
          quantity: string;
          price: string;
          total: string;
        }>;
        gross_total: string;
        tax_amount: string;
        total: string;
        currency: { code: string };
        status: string;
        created_at: string;
        updated_at: string;
      }>>(`GET`, `/api/invoices?invoice_number=${encodeURIComponent(invoiceNumber)}`);

      if (response.length === 0) {
        throw new Error(`Invoice ${invoiceNumber} not found`);
      }

      const inv = response[0];

      return {
        success: true,
        data: {
          id: String(inv.id),
          invoiceNumber: inv.invoice_number,
          externalId: String(inv.id),
          invoiceDate: inv.invoice_date,
          dueDate: inv.payment_due_date,
          supplier: {
            id: String(inv.supplier.id),
            name: inv.supplier.name,
          },
          poNumber: inv.order_header_num,
          lineItems: inv.invoice_lines.map(line => ({
            lineNumber: line.line_num,
            description: line.description,
            quantity: parseFloat(line.quantity),
            unitPrice: parseFloat(line.price),
            totalPrice: parseFloat(line.total),
          })),
          subtotal: parseFloat(inv.gross_total),
          tax: parseFloat(inv.tax_amount),
          total: parseFloat(inv.total),
          currency: inv.currency?.code || "USD",
          status: this.mapCoupaInvoiceStatus(inv.status),
          createdAt: inv.created_at,
          updatedAt: inv.updated_at,
        },
      };
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
      const invoiceResult = await this.getInvoice(invoiceNumber);
      if (!invoiceResult.success || !invoiceResult.data) {
        throw new Error(`Invoice ${invoiceNumber} not found`);
      }

      // Coupa performs automatic matching - we trigger it
      await this.apiRequest(
        "PUT",
        `/api/invoices/${invoiceResult.data.id}/match`
      );

      return {
        success: true,
        data: {
          ...invoiceResult.data,
          status: "matched",
          updatedAt: new Date().toISOString(),
        },
      };
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
      params.set("offset", String(((options.page || 1) - 1) * (options.pageSize || 50)));
      params.set("limit", String(options.pageSize || 50));
      if (options.status) params.set("status", this.mapToCoupaInvoiceStatus(options.status));
      if (options.supplierId) params.set("supplier[id]", options.supplierId);
      if (options.poNumber) params.set("order_header_num", options.poNumber);
      if (options.fromDate) params.set("invoice_date[gt_or_eq]", options.fromDate);
      if (options.toDate) params.set("invoice_date[lt_or_eq]", options.toDate);
      params.set("return_object", "shallow");

      const response = await this.apiRequest<Array<{
        id: number;
        invoice_number: string;
        invoice_date: string;
        payment_due_date: string;
        supplier: { id: number; name: string };
        total: string;
        currency: { code: string };
        status: string;
        created_at: string;
      }>>("GET", `/api/invoices?${params}`);

      const countResponse = await this.apiRequest<{ count: number }>(
        "GET",
        `/api/invoices/count?${params}`
      );

      return {
        success: true,
        data: {
          items: response.map(inv => ({
            id: String(inv.id),
            invoiceNumber: inv.invoice_number,
            externalId: String(inv.id),
            invoiceDate: inv.invoice_date,
            dueDate: inv.payment_due_date,
            supplier: {
              id: String(inv.supplier.id),
              name: inv.supplier.name,
            },
            lineItems: [],
            subtotal: parseFloat(inv.total),
            tax: 0,
            total: parseFloat(inv.total),
            currency: inv.currency?.code || "USD",
            status: this.mapCoupaInvoiceStatus(inv.status),
            createdAt: inv.created_at,
            updatedAt: inv.created_at,
          })),
          pagination: {
            page: options.page || 1,
            pageSize: options.pageSize || 50,
            total: countResponse.count,
            totalPages: Math.ceil(countResponse.count / (options.pageSize || 50)),
          },
        },
      };
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
      const response = await this.apiRequest<{
        id: number;
        requisition_number: string;
        status: string;
        created_at: string;
      }>("POST", "/api/requisitions", {
        requisition_header: {
          name: requisition.description,
          requested_by: { id: parseInt(requisition.requester.id) },
          need_by_date: requisition.needByDate,
          justification: requisition.justification,
        },
        requisition_lines: requisition.lineItems.map((line, idx) => ({
          line_num: idx + 1,
          description: line.description,
          quantity: String(line.quantity),
          unit_price: String(line.estimatedPrice),
          uom: { code: line.unitOfMeasure },
          item: line.catalogItemId ? { id: parseInt(line.catalogItemId) } : undefined,
          need_by_date: line.needByDate,
        })),
        currency: { code: requisition.currency },
      });

      return {
        success: true,
        data: {
          ...requisition,
          id: String(response.id),
          requisitionNumber: response.requisition_number,
          externalId: String(response.id),
          status: this.mapCoupaReqStatus(response.status),
          createdAt: response.created_at,
          updatedAt: response.created_at,
        },
      };
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
      const response = await this.apiRequest<Array<{
        id: number;
        requisition_number: string;
        requisition_header: {
          name: string;
          requested_by: { id: number; fullname: string; email: string };
          need_by_date?: string;
          justification?: string;
        };
        requisition_lines: Array<{
          line_num: number;
          description: string;
          quantity: string;
          unit_price: string;
          uom: { code: string };
          total: string;
        }>;
        total: string;
        currency: { code: string };
        status: string;
        created_at: string;
        updated_at: string;
      }>>(`GET`, `/api/requisitions?requisition_number=${encodeURIComponent(requisitionNumber)}`);

      if (response.length === 0) {
        throw new Error(`Requisition ${requisitionNumber} not found`);
      }

      const req = response[0];

      return {
        success: true,
        data: {
          id: String(req.id),
          requisitionNumber: req.requisition_number,
          externalId: String(req.id),
          description: req.requisition_header.name,
          requester: {
            id: String(req.requisition_header.requested_by.id),
            name: req.requisition_header.requested_by.fullname,
            email: req.requisition_header.requested_by.email,
          },
          lineItems: req.requisition_lines.map(line => ({
            lineNumber: line.line_num,
            description: line.description,
            quantity: parseFloat(line.quantity),
            unitOfMeasure: line.uom?.code || "EA",
            estimatedPrice: parseFloat(line.unit_price),
          })),
          totalEstimatedCost: parseFloat(req.total),
          currency: req.currency?.code || "USD",
          status: this.mapCoupaReqStatus(req.status),
          needByDate: req.requisition_header.need_by_date,
          justification: req.requisition_header.justification,
          createdAt: req.created_at,
          updatedAt: req.updated_at,
        },
      };
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
      const reqResult = await this.getRequisition(requisitionNumber);
      if (!reqResult.success || !reqResult.data) {
        throw new Error(`Requisition ${requisitionNumber} not found`);
      }

      await this.apiRequest("PUT", `/api/requisitions/${reqResult.data.id}/submit`);

      return {
        success: true,
        data: {
          ...reqResult.data,
          status: "pending_approval",
          updatedAt: new Date().toISOString(),
        },
      };
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
      const reqResult = await this.getRequisition(requisitionNumber);
      if (!reqResult.success || !reqResult.data) {
        throw new Error(`Requisition ${requisitionNumber} not found`);
      }

      await this.apiRequest(
        "PUT",
        `/api/requisitions/${reqResult.data.id}/${decision}`,
        { reason: comments }
      );

      return {
        success: true,
        data: {
          ...reqResult.data,
          status: decision === "approve" ? "approved" : "rejected",
          updatedAt: new Date().toISOString(),
        },
      };
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
      const reqResult = await this.getRequisition(requisitionNumber);
      if (!reqResult.success || !reqResult.data) {
        throw new Error(`Requisition ${requisitionNumber} not found`);
      }

      const response = await this.apiRequest<{ purchase_order: { id: number; po_number: string } }>(
        "PUT",
        `/api/requisitions/${reqResult.data.id}/create_po`
      );

      return this.getPurchaseOrder(response.purchase_order.po_number);
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
      params.set("offset", String(((options.page || 1) - 1) * (options.pageSize || 50)));
      params.set("limit", String(options.pageSize || 50));
      if (options.status) params.set("status", this.mapToCoupaReqStatus(options.status));
      if (options.requesterId) params.set("requested_by[id]", options.requesterId);
      params.set("return_object", "shallow");

      const response = await this.apiRequest<Array<{
        id: number;
        requisition_number: string;
        requisition_header: {
          name: string;
          requested_by: { id: number; fullname: string; email: string };
        };
        total: string;
        currency: { code: string };
        status: string;
        created_at: string;
      }>>("GET", `/api/requisitions?${params}`);

      const countResponse = await this.apiRequest<{ count: number }>(
        "GET",
        `/api/requisitions/count?${params}`
      );

      return {
        success: true,
        data: {
          items: response.map(req => ({
            id: String(req.id),
            requisitionNumber: req.requisition_number,
            externalId: String(req.id),
            description: req.requisition_header.name,
            requester: {
              id: String(req.requisition_header.requested_by.id),
              name: req.requisition_header.requested_by.fullname,
              email: req.requisition_header.requested_by.email,
            },
            lineItems: [],
            totalEstimatedCost: parseFloat(req.total),
            currency: req.currency?.code || "USD",
            status: this.mapCoupaReqStatus(req.status),
            createdAt: req.created_at,
            updatedAt: req.created_at,
          })),
          pagination: {
            page: options.page || 1,
            pageSize: options.pageSize || 50,
            total: countResponse.count,
            totalPages: Math.ceil(countResponse.count / (options.pageSize || 50)),
          },
        },
      };
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
      const response = await this.apiRequest<{
        id: number;
        name: string;
        number: string;
        status: string;
        primary_address: {
          street1: string;
          street2?: string;
          city: string;
          state: string;
          postal_code: string;
          country: { code: string };
        };
        primary_contact: {
          name_given: string;
          name_family: string;
          email: string;
          phone_work: string;
        };
        tax_id: string;
        payment_term: { code: string };
        diversity_certifications: Array<{
          certification_type: string;
          certification_number: string;
          expiration_date: string;
        }>;
      }>("GET", `/api/suppliers/${supplierIdOrCode}`);

      return {
        success: true,
        data: {
          id: String(response.id),
          name: response.name,
          code: response.number,
          status: response.status === "active" ? "active" : "inactive",
          address: response.primary_address ? {
            street1: response.primary_address.street1,
            street2: response.primary_address.street2,
            city: response.primary_address.city,
            state: response.primary_address.state,
            postalCode: response.primary_address.postal_code,
            country: response.primary_address.country?.code || "",
          } : undefined,
          contacts: response.primary_contact ? [{
            name: `${response.primary_contact.name_given} ${response.primary_contact.name_family}`,
            email: response.primary_contact.email,
            phone: response.primary_contact.phone_work,
            isPrimary: true,
          }] : [],
          taxId: response.tax_id,
          paymentTerms: response.payment_term?.code,
          diversityCertifications: response.diversity_certifications?.map(cert => ({
            type: cert.certification_type,
            certificationNumber: cert.certification_number,
            expirationDate: cert.expiration_date,
          })),
        },
      };
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
      params.set("name[contains]", query);
      params.set("limit", String(options?.maxResults || 20));
      params.set("status", "active");

      const response = await this.apiRequest<Array<{
        id: number;
        name: string;
        number: string;
        status: string;
      }>>("GET", `/api/suppliers?${params}`);

      return {
        success: true,
        data: response.map(s => ({
          id: String(s.id),
          name: s.name,
          code: s.number,
          status: s.status === "active" ? "active" : "inactive",
          contacts: [],
        })),
      };
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
      params.set("offset", String(((options.page || 1) - 1) * (options.pageSize || 50)));
      params.set("limit", String(options.pageSize || 50));
      if (options.status) params.set("status", options.status);
      params.set("return_object", "shallow");

      const response = await this.apiRequest<Array<{
        id: number;
        name: string;
        number: string;
        status: string;
      }>>("GET", `/api/suppliers?${params}`);

      const countResponse = await this.apiRequest<{ count: number }>(
        "GET",
        `/api/suppliers/count?${params}`
      );

      return {
        success: true,
        data: {
          items: response.map(s => ({
            id: String(s.id),
            name: s.name,
            code: s.number,
            status: s.status === "active" ? "active" : "inactive",
            contacts: [],
          })),
          pagination: {
            page: options.page || 1,
            pageSize: options.pageSize || 50,
            total: countResponse.count,
            totalPages: Math.ceil(countResponse.count / (options.pageSize || 50)),
          },
        },
      };
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
      // Get supplier punchout site configuration
      const punchoutSite = await this.apiRequest<{
        id: number;
        punchout_url: string;
        shared_secret: string;
        supplier_domain: string;
      }>("GET", `/api/suppliers/${options.supplierId}/punchout_site`);

      const buyerCookie = `COUPA-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Generate cXML PunchoutSetupRequest
      const setupRequest = this.cxmlHandler.generatePunchoutSetupRequest({
        buyerCookie,
        browserFormPost: options.returnUrl,
        supplierDomain: punchoutSite.supplier_domain,
        userId: options.userId,
        userEmail: options.userEmail,
        userName: options.userName,
      });

      // Send to supplier
      const response = await fetch(punchoutSite.punchout_url, {
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
        sessionId: buyerCookie,
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
  // Helper Methods
  // ============================================================================

  private getCoupaStatusEndpoint(status: POStatus, poId: string): string {
    const statusEndpoints: Record<POStatus, string> = {
      draft: `/api/purchase_orders/${poId}`,
      pending: `/api/purchase_orders/${poId}/submit_for_approval`,
      approved: `/api/purchase_orders/${poId}/approve`,
      sent: `/api/purchase_orders/${poId}/transmit`,
      acknowledged: `/api/purchase_orders/${poId}`,
      partially_received: `/api/purchase_orders/${poId}`,
      received: `/api/purchase_orders/${poId}/receive`,
      cancelled: `/api/purchase_orders/${poId}/cancel`,
      closed: `/api/purchase_orders/${poId}/close`,
    };
    return statusEndpoints[status] || `/api/purchase_orders/${poId}`;
  }

  private mapCoupaPOStatus(status: string): POStatus {
    const statusMap: Record<string, POStatus> = {
      draft: "draft",
      pending_approval: "pending",
      approved: "approved",
      issued: "sent",
      transmitted: "sent",
      acknowledged: "acknowledged",
      soft_closed: "partially_received",
      received: "received",
      cancelled: "cancelled",
      closed: "closed",
    };
    return statusMap[status.toLowerCase()] || "draft";
  }

  private mapToCoupaPOStatus(status: POStatus): string {
    const statusMap: Record<POStatus, string> = {
      draft: "draft",
      pending: "pending_approval",
      approved: "approved",
      sent: "issued",
      acknowledged: "acknowledged",
      partially_received: "soft_closed",
      received: "received",
      cancelled: "cancelled",
      closed: "closed",
    };
    return statusMap[status] || "draft";
  }

  private mapCoupaInvoiceStatus(status: string): InvoiceStatus {
    const statusMap: Record<string, InvoiceStatus> = {
      draft: "draft",
      pending_approval: "pending_approval",
      approved: "approved",
      disputed: "disputed",
      void: "cancelled",
      paid: "paid",
    };
    return statusMap[status.toLowerCase()] || "draft";
  }

  private mapToCoupaInvoiceStatus(status: InvoiceStatus): string {
    const statusMap: Record<InvoiceStatus, string> = {
      draft: "draft",
      submitted: "pending_approval",
      pending_approval: "pending_approval",
      approved: "approved",
      matched: "approved",
      paid: "paid",
      rejected: "disputed",
      disputed: "disputed",
      cancelled: "void",
    };
    return statusMap[status] || "draft";
  }

  private mapCoupaReqStatus(status: string): RequisitionStatus {
    const statusMap: Record<string, RequisitionStatus> = {
      draft: "draft",
      pending_approval: "pending_approval",
      approved: "approved",
      denied: "rejected",
      ordered: "ordered",
      partially_received: "partially_ordered",
      received: "ordered",
      soft_closed: "ordered",
      closed: "ordered",
    };
    return statusMap[status.toLowerCase()] || "draft";
  }

  private mapToCoupaReqStatus(status: RequisitionStatus): string {
    const statusMap: Record<RequisitionStatus, string> = {
      draft: "draft",
      submitted: "pending_approval",
      pending_approval: "pending_approval",
      approved: "approved",
      rejected: "denied",
      ordered: "ordered",
      cancelled: "draft",
      partially_ordered: "partially_received",
    };
    return statusMap[status] || "draft";
  }
}

export default CoupaConnector;
