/**
 * SAP Ariba Connector
 *
 * Connector implementation for SAP Ariba procurement platform.
 * Supports enterprise procurement features including:
 * - Ariba Network integration
 * - Guided Buying
 * - Strategic Sourcing
 * - Contract Management
 * - Supplier Management
 * - Invoice Management
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
 * SAP Ariba-specific configuration
 */
export interface AribaConfig extends ConnectorConfig {
  system: "ariba";
  credentials: {
    /** Ariba Network ID (ANID) */
    anid: string;
    /** API Key */
    apiKey: string;
    /** API Secret */
    apiSecret?: string;
    /** OAuth Client ID */
    clientId?: string;
    /** OAuth Client Secret */
    clientSecret?: string;
    /** Realm ID for multi-tenant */
    realm: string;
  };
  settings: {
    /** API base URL */
    apiBaseUrl: string;
    /** cXML endpoint */
    cxmlEndpoint?: string;
    /** Ariba Network endpoint */
    networkEndpoint?: string;
    /** Data center region */
    dataCenter: "us" | "eu" | "apac";
    /** Default currency */
    defaultCurrency?: string;
    /** Enable Guided Buying */
    enableGuidedBuying?: boolean;
    /** Commodity code mapping */
    commodityCodeMapping?: Record<string, string>;
  };
}

/**
 * SAP Ariba Connector
 */
export class AribaConnector extends BaseProcurementConnector {
  private anid: string;
  private apiKey: string;
  private realm: string;
  private baseUrl: string;
  private cxmlEndpoint: string;
  private networkEndpoint: string;
  private cxmlHandler: CXMLHandler;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private clientId?: string;
  private clientSecret?: string;

  constructor(config: AribaConfig) {
    super(config);
    this.anid = config.credentials.anid;
    this.apiKey = config.credentials.apiKey;
    this.realm = config.credentials.realm;
    this.clientId = config.credentials.clientId;
    this.clientSecret = config.credentials.clientSecret;
    this.baseUrl = config.settings.apiBaseUrl;
    this.cxmlEndpoint = config.settings.cxmlEndpoint || `${this.baseUrl}/cxml`;
    this.networkEndpoint = config.settings.networkEndpoint || "https://service.ariba.com/service/transaction/cxml.asp";
    this.cxmlHandler = new CXMLHandler({
      senderIdentity: config.credentials.anid,
      senderSharedSecret: config.credentials.apiSecret || config.credentials.apiKey,
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

    if (!this.clientId || !this.clientSecret) {
      // Use API Key authentication
      return this.apiKey;
    }

    const response = await fetch(`${this.baseUrl}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "openid",
      }),
    });

    if (!response.ok) {
      throw new Error(`Ariba authentication failed: ${response.statusText}`);
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
        "X-ARIBA-NETWORK-ID": this.anid,
        "X-Realm": this.realm,
        apiKey: this.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ariba API error: ${response.status} - ${error}`);
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
        `/api/procurement/v2/health`
      );

      return {
        success: true,
        data: {
          connected: result.status === "UP",
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
        taskId: string;
        status: string;
        summary: {
          totalItems: number;
          addedItems: number;
          updatedItems: number;
          deletedItems: number;
          errors: Array<{ itemNumber: string; errorMessage: string }>;
        };
      }>("POST", `/api/procurement/v2/catalogs/${request.catalogId}/sync`, {
        supplierId: request.supplierId,
        fullSync: request.fullSync,
        items: request.items?.map(item => ({
          supplierPartNumber: item.sku,
          description: item.name,
          longDescription: item.description,
          unitPrice: { amount: item.price, currencyCode: item.currency },
          unitOfMeasure: item.unitOfMeasure,
          commodityCode: item.categoryId,
          leadTime: item.leadTime,
        })),
      });

      return {
        success: true,
        data: {
          syncId: response.taskId,
          status: response.status === "COMPLETED" ? "completed" : "in_progress",
          itemsProcessed: response.summary.totalItems,
          itemsAdded: response.summary.addedItems,
          itemsUpdated: response.summary.updatedItems,
          itemsRemoved: response.summary.deletedItems,
          errors: response.summary.errors.map(e => ({
            itemId: e.itemNumber,
            code: "SYNC_ERROR",
            message: e.errorMessage,
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
      params.set("skip", String(((options.page || 1) - 1) * (options.pageSize || 50)));
      params.set("top", String(options.pageSize || 50));
      if (options.category) params.set("commodityCode", options.category);
      if (options.supplierId) params.set("supplierId", options.supplierId);
      if (options.search) params.set("search", options.search);

      const response = await this.apiRequest<{
        value: Array<{
          id: string;
          supplierPartNumber: string;
          description: string;
          longDescription: string;
          unitPrice: { amount: number; currencyCode: string };
          unitOfMeasure: string;
          commodityCode: string;
          commodityDescription: string;
          supplierInfo: { id: string; name: string };
          imageUrl?: string;
          isActive: boolean;
        }>;
        count: number;
      }>("GET", `/api/procurement/v2/catalog-items?${params}`);

      const totalPages = Math.ceil(response.count / (options.pageSize || 50));

      return {
        success: true,
        data: {
          items: response.value.map(item => ({
            id: item.id,
            sku: item.supplierPartNumber,
            name: item.description,
            description: item.longDescription,
            price: item.unitPrice.amount,
            currency: item.unitPrice.currencyCode,
            unitOfMeasure: item.unitOfMeasure,
            category: {
              id: item.commodityCode,
              name: item.commodityDescription,
              path: [],
            },
            supplier: {
              id: item.supplierInfo.id,
              name: item.supplierInfo.name,
            },
            images: item.imageUrl ? [item.imageUrl] : [],
            attributes: {},
            availability: item.isActive ? "in_stock" : "out_of_stock",
            lastUpdated: new Date().toISOString(),
          })),
          pagination: {
            page: options.page || 1,
            pageSize: options.pageSize || 50,
            total: response.count,
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
      params.set("search", query);
      params.set("top", String(options?.maxResults || 20));
      if (options?.category) params.set("commodityCode", options.category);
      if (options?.supplierId) params.set("supplierId", options.supplierId);

      const response = await this.apiRequest<{
        value: Array<{
          id: string;
          supplierPartNumber: string;
          description: string;
          longDescription: string;
          unitPrice: { amount: number; currencyCode: string };
          unitOfMeasure: string;
          commodityCode: string;
          commodityDescription: string;
          supplierInfo: { id: string; name: string };
        }>;
      }>("GET", `/api/procurement/v2/catalog-items/search?${params}`);

      return {
        success: true,
        data: response.value.map(item => ({
          id: item.id,
          sku: item.supplierPartNumber,
          name: item.description,
          description: item.longDescription,
          price: item.unitPrice.amount,
          currency: item.unitPrice.currencyCode,
          unitOfMeasure: item.unitOfMeasure,
          category: {
            id: item.commodityCode,
            name: item.commodityDescription,
            path: [],
          },
          supplier: {
            id: item.supplierInfo.id,
            name: item.supplierInfo.name,
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
      // Generate cXML OrderRequest
      const orderXml = this.cxmlHandler.generateOrderRequest({
        orderId: order.poNumber,
        orderDate: order.orderDate,
        shipTo: order.shipTo,
        billTo: order.billTo,
        supplierDomain: order.supplier.id,
        items: order.lineItems.map(line => ({
          lineNumber: line.lineNumber,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          currency: order.currency,
          supplierPartId: line.catalogItemId || line.sku || "",
          description: line.description,
          unitOfMeasure: line.unitOfMeasure,
        })),
        total: order.total,
        currency: order.currency,
        paymentTerms: order.paymentTerms,
        comments: order.notes,
      });

      // Send via Ariba Network
      const cxmlResponse = await fetch(this.networkEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/xml",
        },
        body: orderXml,
      });

      const responseText = await cxmlResponse.text();

      // Also create in Ariba procurement
      const apiResponse = await this.apiRequest<{
        id: string;
        orderNumber: string;
        externalSystemId: string;
        status: string;
        createdDate: string;
      }>("POST", "/api/procurement/v2/purchase-orders", {
        orderNumber: order.poNumber,
        orderDate: order.orderDate,
        supplierId: order.supplier.id,
        supplierName: order.supplier.name,
        shipToAddress: order.shipTo,
        billToAddress: order.billTo,
        lineItems: order.lineItems,
        totalAmount: { amount: order.total, currencyCode: order.currency },
        paymentTerms: order.paymentTerms,
        notes: order.notes,
      });

      return {
        success: true,
        data: {
          ...order,
          id: apiResponse.id,
          externalId: apiResponse.externalSystemId,
          status: this.mapAribaPOStatus(apiResponse.status),
          createdAt: apiResponse.createdDate,
          updatedAt: apiResponse.createdDate,
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
      const response = await this.apiRequest<{
        id: string;
        orderNumber: string;
        externalSystemId: string;
        orderDate: string;
        supplier: { id: string; name: string };
        shipToAddress: { street1: string; city: string; state: string; postalCode: string; country: string };
        billToAddress: { street1: string; city: string; state: string; postalCode: string; country: string };
        lineItems: Array<{
          lineNumber: number;
          description: string;
          quantity: number;
          unitPrice: number;
          unitOfMeasure: string;
          totalPrice: number;
        }>;
        subtotal: number;
        tax: number;
        shipping: number;
        totalAmount: { amount: number; currencyCode: string };
        status: string;
        createdDate: string;
        lastModifiedDate: string;
      }>("GET", `/api/procurement/v2/purchase-orders/${encodeURIComponent(poNumber)}`);

      return {
        success: true,
        data: {
          id: response.id,
          poNumber: response.orderNumber,
          externalId: response.externalSystemId,
          orderDate: response.orderDate,
          supplier: response.supplier,
          shipTo: response.shipToAddress,
          billTo: response.billToAddress,
          lineItems: response.lineItems,
          subtotal: response.subtotal,
          tax: response.tax,
          shipping: response.shipping,
          total: response.totalAmount.amount,
          currency: response.totalAmount.currencyCode,
          status: this.mapAribaPOStatus(response.status),
          createdAt: response.createdDate,
          updatedAt: response.lastModifiedDate,
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
      const response = await this.apiRequest<{
        id: string;
        status: string;
        lastModifiedDate: string;
      }>("PATCH", `/api/procurement/v2/purchase-orders/${encodeURIComponent(poNumber)}/status`, {
        status: this.mapToAribaPOStatus(status),
        comments,
      });

      const poResult = await this.getPurchaseOrder(poNumber);
      if (poResult.success && poResult.data) {
        return {
          success: true,
          data: {
            ...poResult.data,
            status,
            updatedAt: response.lastModifiedDate,
          },
        };
      }

      return poResult;
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
      const response = await this.apiRequest<{
        transmitted: boolean;
        transmissionId: string;
        method: string;
      }>("POST", `/api/procurement/v2/purchase-orders/${encodeURIComponent(poNumber)}/transmit`, {
        method: method || "cxml",
      });

      return {
        success: true,
        data: {
          sent: response.transmitted,
          confirmationId: response.transmissionId,
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
      params.set("skip", String(((options.page || 1) - 1) * (options.pageSize || 50)));
      params.set("top", String(options.pageSize || 50));
      if (options.status) params.set("status", this.mapToAribaPOStatus(options.status));
      if (options.supplierId) params.set("supplierId", options.supplierId);
      if (options.fromDate) params.set("fromDate", options.fromDate);
      if (options.toDate) params.set("toDate", options.toDate);

      const response = await this.apiRequest<{
        value: Array<{
          id: string;
          orderNumber: string;
          externalSystemId: string;
          orderDate: string;
          supplier: { id: string; name: string };
          totalAmount: { amount: number; currencyCode: string };
          status: string;
          createdDate: string;
          lastModifiedDate: string;
        }>;
        count: number;
      }>("GET", `/api/procurement/v2/purchase-orders?${params}`);

      return {
        success: true,
        data: {
          items: response.value.map(po => ({
            id: po.id,
            poNumber: po.orderNumber,
            externalId: po.externalSystemId,
            orderDate: po.orderDate,
            supplier: po.supplier,
            shipTo: { street1: "", city: "", state: "", postalCode: "", country: "" },
            billTo: { street1: "", city: "", state: "", postalCode: "", country: "" },
            lineItems: [],
            subtotal: po.totalAmount.amount,
            tax: 0,
            shipping: 0,
            total: po.totalAmount.amount,
            currency: po.totalAmount.currencyCode,
            status: this.mapAribaPOStatus(po.status),
            createdAt: po.createdDate,
            updatedAt: po.lastModifiedDate,
          })),
          pagination: {
            page: options.page || 1,
            pageSize: options.pageSize || 50,
            total: response.count,
            totalPages: Math.ceil(response.count / (options.pageSize || 50)),
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
        id: string;
        invoiceNumber: string;
        externalId: string;
        status: string;
        createdDate: string;
      }>("POST", "/api/invoicing/v2/invoices", {
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        supplierId: invoice.supplier.id,
        supplierName: invoice.supplier.name,
        purchaseOrderNumber: invoice.poNumber,
        lineItems: invoice.lineItems,
        subtotal: { amount: invoice.subtotal, currencyCode: invoice.currency },
        tax: { amount: invoice.tax, currencyCode: invoice.currency },
        total: { amount: invoice.total, currencyCode: invoice.currency },
      });

      return {
        success: true,
        data: {
          ...invoice,
          id: response.id,
          externalId: response.externalId,
          status: this.mapAribaInvoiceStatus(response.status),
          createdAt: response.createdDate,
          updatedAt: response.createdDate,
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
      const response = await this.apiRequest<{
        id: string;
        invoiceNumber: string;
        externalId: string;
        invoiceDate: string;
        dueDate: string;
        supplier: { id: string; name: string };
        purchaseOrderNumber: string;
        lineItems: Array<{
          lineNumber: number;
          description: string;
          quantity: number;
          unitPrice: number;
          totalPrice: number;
        }>;
        subtotal: { amount: number };
        tax: { amount: number };
        total: { amount: number; currencyCode: string };
        status: string;
        createdDate: string;
        lastModifiedDate: string;
      }>("GET", `/api/invoicing/v2/invoices/${encodeURIComponent(invoiceNumber)}`);

      return {
        success: true,
        data: {
          id: response.id,
          invoiceNumber: response.invoiceNumber,
          externalId: response.externalId,
          invoiceDate: response.invoiceDate,
          dueDate: response.dueDate,
          supplier: response.supplier,
          poNumber: response.purchaseOrderNumber,
          lineItems: response.lineItems,
          subtotal: response.subtotal.amount,
          tax: response.tax.amount,
          total: response.total.amount,
          currency: response.total.currencyCode,
          status: this.mapAribaInvoiceStatus(response.status),
          createdAt: response.createdDate,
          updatedAt: response.lastModifiedDate,
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
      await this.apiRequest(
        "POST",
        `/api/invoicing/v2/invoices/${encodeURIComponent(invoiceNumber)}/match`
      );

      const invoiceResult = await this.getInvoice(invoiceNumber);
      if (invoiceResult.success && invoiceResult.data) {
        return {
          success: true,
          data: {
            ...invoiceResult.data,
            status: "matched",
            updatedAt: new Date().toISOString(),
          },
        };
      }

      return invoiceResult;
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
      params.set("skip", String(((options.page || 1) - 1) * (options.pageSize || 50)));
      params.set("top", String(options.pageSize || 50));
      if (options.status) params.set("status", this.mapToAribaInvoiceStatus(options.status));
      if (options.supplierId) params.set("supplierId", options.supplierId);
      if (options.poNumber) params.set("poNumber", options.poNumber);
      if (options.fromDate) params.set("fromDate", options.fromDate);
      if (options.toDate) params.set("toDate", options.toDate);

      const response = await this.apiRequest<{
        value: Array<{
          id: string;
          invoiceNumber: string;
          externalId: string;
          invoiceDate: string;
          dueDate: string;
          supplier: { id: string; name: string };
          total: { amount: number; currencyCode: string };
          status: string;
          createdDate: string;
        }>;
        count: number;
      }>("GET", `/api/invoicing/v2/invoices?${params}`);

      return {
        success: true,
        data: {
          items: response.value.map(inv => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            externalId: inv.externalId,
            invoiceDate: inv.invoiceDate,
            dueDate: inv.dueDate,
            supplier: inv.supplier,
            lineItems: [],
            subtotal: inv.total.amount,
            tax: 0,
            total: inv.total.amount,
            currency: inv.total.currencyCode,
            status: this.mapAribaInvoiceStatus(inv.status),
            createdAt: inv.createdDate,
            updatedAt: inv.createdDate,
          })),
          pagination: {
            page: options.page || 1,
            pageSize: options.pageSize || 50,
            total: response.count,
            totalPages: Math.ceil(response.count / (options.pageSize || 50)),
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
        id: string;
        requisitionNumber: string;
        externalId: string;
        status: string;
        createdDate: string;
      }>("POST", "/api/procurement/v2/requisitions", {
        requisitionNumber: requisition.requisitionNumber,
        title: requisition.description,
        requesterId: requisition.requester.id,
        requesterName: requisition.requester.name,
        lineItems: requisition.lineItems.map(line => ({
          lineNumber: line.lineNumber,
          description: line.description,
          quantity: line.quantity,
          unitOfMeasure: line.unitOfMeasure,
          estimatedPrice: { amount: line.estimatedPrice, currencyCode: requisition.currency },
          catalogItemId: line.catalogItemId,
          needByDate: line.needByDate,
        })),
        totalEstimatedCost: { amount: requisition.totalEstimatedCost, currencyCode: requisition.currency },
        needByDate: requisition.needByDate,
        justification: requisition.justification,
      });

      return {
        success: true,
        data: {
          ...requisition,
          id: response.id,
          externalId: response.externalId,
          status: this.mapAribaReqStatus(response.status),
          createdAt: response.createdDate,
          updatedAt: response.createdDate,
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
      const response = await this.apiRequest<{
        id: string;
        requisitionNumber: string;
        externalId: string;
        title: string;
        requester: { id: string; name: string; email: string };
        lineItems: Array<{
          lineNumber: number;
          description: string;
          quantity: number;
          unitOfMeasure: string;
          estimatedPrice: { amount: number };
          catalogItemId?: string;
        }>;
        totalEstimatedCost: { amount: number; currencyCode: string };
        status: string;
        createdDate: string;
        lastModifiedDate: string;
      }>("GET", `/api/procurement/v2/requisitions/${encodeURIComponent(requisitionNumber)}`);

      return {
        success: true,
        data: {
          id: response.id,
          requisitionNumber: response.requisitionNumber,
          externalId: response.externalId,
          description: response.title,
          requester: response.requester,
          lineItems: response.lineItems.map(line => ({
            lineNumber: line.lineNumber,
            description: line.description,
            quantity: line.quantity,
            unitOfMeasure: line.unitOfMeasure,
            estimatedPrice: line.estimatedPrice.amount,
            catalogItemId: line.catalogItemId,
          })),
          totalEstimatedCost: response.totalEstimatedCost.amount,
          currency: response.totalEstimatedCost.currencyCode,
          status: this.mapAribaReqStatus(response.status),
          createdAt: response.createdDate,
          updatedAt: response.lastModifiedDate,
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
      await this.apiRequest(
        "POST",
        `/api/procurement/v2/requisitions/${encodeURIComponent(requisitionNumber)}/submit`
      );

      const reqResult = await this.getRequisition(requisitionNumber);
      if (reqResult.success && reqResult.data) {
        return {
          success: true,
          data: {
            ...reqResult.data,
            status: "pending_approval",
            updatedAt: new Date().toISOString(),
          },
        };
      }

      return reqResult;
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
      await this.apiRequest(
        "POST",
        `/api/procurement/v2/requisitions/${encodeURIComponent(requisitionNumber)}/${decision}`,
        { comments }
      );

      const reqResult = await this.getRequisition(requisitionNumber);
      if (reqResult.success && reqResult.data) {
        return {
          success: true,
          data: {
            ...reqResult.data,
            status: decision === "approve" ? "approved" : "rejected",
            updatedAt: new Date().toISOString(),
          },
        };
      }

      return reqResult;
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
      const response = await this.apiRequest<{
        purchaseOrderNumber: string;
      }>("POST", `/api/procurement/v2/requisitions/${encodeURIComponent(requisitionNumber)}/convert-to-po`);

      return this.getPurchaseOrder(response.purchaseOrderNumber);
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
      params.set("skip", String(((options.page || 1) - 1) * (options.pageSize || 50)));
      params.set("top", String(options.pageSize || 50));
      if (options.status) params.set("status", this.mapToAribaReqStatus(options.status));
      if (options.requesterId) params.set("requesterId", options.requesterId);

      const response = await this.apiRequest<{
        value: Array<{
          id: string;
          requisitionNumber: string;
          externalId: string;
          title: string;
          requester: { id: string; name: string; email: string };
          totalEstimatedCost: { amount: number; currencyCode: string };
          status: string;
          createdDate: string;
        }>;
        count: number;
      }>("GET", `/api/procurement/v2/requisitions?${params}`);

      return {
        success: true,
        data: {
          items: response.value.map(req => ({
            id: req.id,
            requisitionNumber: req.requisitionNumber,
            externalId: req.externalId,
            description: req.title,
            requester: req.requester,
            lineItems: [],
            totalEstimatedCost: req.totalEstimatedCost.amount,
            currency: req.totalEstimatedCost.currencyCode,
            status: this.mapAribaReqStatus(req.status),
            createdAt: req.createdDate,
            updatedAt: req.createdDate,
          })),
          pagination: {
            page: options.page || 1,
            pageSize: options.pageSize || 50,
            total: response.count,
            totalPages: Math.ceil(response.count / (options.pageSize || 50)),
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
        id: string;
        name: string;
        supplierCode: string;
        aribaNetworkId: string;
        status: string;
        address: { street1: string; city: string; state: string; postalCode: string; country: string };
        primaryContact: { name: string; email: string; phone: string };
        taxId: string;
        paymentTerms: string;
        diversityCertifications: Array<{ type: string; certificationNumber: string; expirationDate: string }>;
        performanceRating: number;
      }>("GET", `/api/suppliers/v2/suppliers/${supplierIdOrCode}`);

      return {
        success: true,
        data: {
          id: response.id,
          name: response.name,
          code: response.supplierCode,
          externalId: response.aribaNetworkId,
          status: response.status === "Active" ? "active" : "inactive",
          address: response.address,
          contacts: response.primaryContact ? [{
            name: response.primaryContact.name,
            email: response.primaryContact.email,
            phone: response.primaryContact.phone,
            isPrimary: true,
          }] : [],
          taxId: response.taxId,
          paymentTerms: response.paymentTerms,
          diversityCertifications: response.diversityCertifications?.map(cert => ({
            type: cert.type,
            certificationNumber: cert.certificationNumber,
            expirationDate: cert.expirationDate,
          })),
          performanceRating: response.performanceRating,
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
      params.set("search", query);
      params.set("top", String(options?.maxResults || 20));
      if (options?.diversityCertification) {
        params.set("diversityCertification", options.diversityCertification);
      }

      const response = await this.apiRequest<{
        value: Array<{
          id: string;
          name: string;
          supplierCode: string;
          status: string;
          aribaNetworkId: string;
        }>;
      }>("GET", `/api/suppliers/v2/suppliers/search?${params}`);

      return {
        success: true,
        data: response.value.map(s => ({
          id: s.id,
          name: s.name,
          code: s.supplierCode,
          externalId: s.aribaNetworkId,
          status: s.status === "Active" ? "active" : "inactive",
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
      params.set("skip", String(((options.page || 1) - 1) * (options.pageSize || 50)));
      params.set("top", String(options.pageSize || 50));
      if (options.status) params.set("status", options.status);

      const response = await this.apiRequest<{
        value: Array<{
          id: string;
          name: string;
          supplierCode: string;
          status: string;
          aribaNetworkId: string;
        }>;
        count: number;
      }>("GET", `/api/suppliers/v2/suppliers?${params}`);

      return {
        success: true,
        data: {
          items: response.value.map(s => ({
            id: s.id,
            name: s.name,
            code: s.supplierCode,
            externalId: s.aribaNetworkId,
            status: s.status === "Active" ? "active" : "inactive",
            contacts: [],
          })),
          pagination: {
            page: options.page || 1,
            pageSize: options.pageSize || 50,
            total: response.count,
            totalPages: Math.ceil(response.count / (options.pageSize || 50)),
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
      // Get supplier punchout configuration from Ariba
      const supplierConfig = await this.apiRequest<{
        punchoutUrl: string;
        sharedSecret: string;
        supplierDomain: string;
      }>("GET", `/api/suppliers/v2/suppliers/${options.supplierId}/punchout-config`);

      const buyerCookie = `ARIBA-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Generate cXML PunchoutSetupRequest
      const setupRequest = this.cxmlHandler.generatePunchoutSetupRequest({
        buyerCookie,
        browserFormPost: options.returnUrl,
        supplierDomain: supplierConfig.supplierDomain,
        userId: options.userId,
        userEmail: options.userEmail,
        userName: options.userName,
      });

      // Send to supplier via Ariba Network
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

  private mapAribaPOStatus(status: string): POStatus {
    const statusMap: Record<string, POStatus> = {
      Draft: "draft",
      Composing: "draft",
      Submitted: "pending",
      Approved: "approved",
      Ordering: "sent",
      Ordered: "sent",
      Confirmed: "acknowledged",
      Shipped: "partially_received",
      PartiallyReceived: "partially_received",
      Received: "received",
      Closed: "closed",
      Canceled: "cancelled",
    };
    return statusMap[status] || "draft";
  }

  private mapToAribaPOStatus(status: POStatus): string {
    const statusMap: Record<POStatus, string> = {
      draft: "Draft",
      pending: "Submitted",
      approved: "Approved",
      sent: "Ordered",
      acknowledged: "Confirmed",
      partially_received: "PartiallyReceived",
      received: "Received",
      cancelled: "Canceled",
      closed: "Closed",
    };
    return statusMap[status] || "Draft";
  }

  private mapAribaInvoiceStatus(status: string): InvoiceStatus {
    const statusMap: Record<string, InvoiceStatus> = {
      Draft: "draft",
      Submitted: "submitted",
      Approving: "pending_approval",
      Approved: "approved",
      Reconciled: "matched",
      Paying: "approved",
      Paid: "paid",
      Rejected: "rejected",
      Disputed: "disputed",
    };
    return statusMap[status] || "draft";
  }

  private mapToAribaInvoiceStatus(status: InvoiceStatus): string {
    const statusMap: Record<InvoiceStatus, string> = {
      draft: "Draft",
      submitted: "Submitted",
      pending_approval: "Approving",
      approved: "Approved",
      matched: "Reconciled",
      paid: "Paid",
      rejected: "Rejected",
      disputed: "Disputed",
      cancelled: "Canceled",
    };
    return statusMap[status] || "Draft";
  }

  private mapAribaReqStatus(status: string): RequisitionStatus {
    const statusMap: Record<string, RequisitionStatus> = {
      Composing: "draft",
      Submitted: "submitted",
      Approving: "pending_approval",
      Approved: "approved",
      Denied: "rejected",
      Ordering: "approved",
      Ordered: "ordered",
      Withdrawn: "cancelled",
    };
    return statusMap[status] || "draft";
  }

  private mapToAribaReqStatus(status: RequisitionStatus): string {
    const statusMap: Record<RequisitionStatus, string> = {
      draft: "Composing",
      submitted: "Submitted",
      pending_approval: "Approving",
      approved: "Approved",
      rejected: "Denied",
      ordered: "Ordered",
      cancelled: "Withdrawn",
      partially_ordered: "PartiallyOrdered",
    };
    return statusMap[status] || "Composing";
  }
}

export default AribaConnector;
