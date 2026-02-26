/**
 * Workday Strategic Sourcing Connector
 *
 * Connector implementation for Workday Strategic Sourcing platform.
 * Supports enterprise procurement features including:
 * - Sourcing events and supplier negotiations
 * - Contract lifecycle management
 * - Supplier management and performance
 * - Spend analysis and savings tracking
 * - Integration with Workday Financial Management
 */

import { BaseProcurementConnector } from "../base/connector";
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
 * Workday-specific configuration
 */
export interface WorkdayConfig extends ConnectorConfig {
  system: "workday";
  credentials: {
    /** Workday tenant ID */
    tenantId: string;
    /** Client ID for OAuth */
    clientId: string;
    /** Client Secret */
    clientSecret: string;
    /** Refresh token for long-lived access */
    refreshToken?: string;
    /** Integration System User (ISU) credentials */
    isuUsername?: string;
    isuPassword?: string;
  };
  settings: {
    /** Workday REST API base URL */
    apiBaseUrl: string;
    /** SOAP API endpoint for legacy operations */
    soapEndpoint?: string;
    /** Company reference ID */
    companyRefId: string;
    /** Default currency code */
    defaultCurrency?: string;
    /** Cost center mapping */
    costCenterMapping?: Record<string, string>;
    /** Enable Workday Financial Management integration */
    enableFMIntegration?: boolean;
    /** API version */
    apiVersion?: string;
  };
}

/**
 * Workday Strategic Sourcing Connector
 */
export class WorkdayConnector extends BaseProcurementConnector {
  private tenantId: string;
  private clientId: string;
  private clientSecret: string;
  private baseUrl: string;
  private companyRefId: string;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private apiVersion: string;

  constructor(config: WorkdayConfig) {
    super(config);
    this.tenantId = config.credentials.tenantId;
    this.clientId = config.credentials.clientId;
    this.clientSecret = config.credentials.clientSecret;
    this.baseUrl = config.settings.apiBaseUrl;
    this.companyRefId = config.settings.companyRefId;
    this.apiVersion = config.settings.apiVersion || "v40.0";
  }

  // ============================================================================
  // Authentication
  // ============================================================================

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    const response = await fetch(`${this.baseUrl}/oauth2/${this.tenantId}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "Procurement Suppliers Contracts",
      }),
    });

    if (!response.ok) {
      throw new Error(`Workday authentication failed: ${response.statusText}`);
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
    const url = `${this.baseUrl}/api/${this.apiVersion}/${this.tenantId}${endpoint}`;

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Workday API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  async testConnection(): Promise<ConnectorResponse<{ connected: boolean; version?: string }>> {
    try {
      const result = await this.apiRequest<{ tenantInfo: { version: string } }>(
        "GET",
        "/common/workers/me"
      );

      return {
        success: true,
        data: {
          connected: true,
          version: result.tenantInfo?.version || this.apiVersion,
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
      // Workday uses Procurement Catalog Management
      const response = await this.apiRequest<{
        syncId: string;
        results: {
          processed: number;
          created: number;
          updated: number;
          deleted: number;
          errors: Array<{ itemId: string; message: string }>;
        };
      }>("POST", "/procurement/catalogSync", {
        catalogReference: { id: request.catalogId },
        supplierReference: { id: request.supplierId },
        fullSync: request.fullSync,
        items: request.items?.map(item => ({
          itemId: item.sku,
          itemName: item.name,
          description: item.description,
          unitPrice: { amount: item.price, currency: item.currency },
          unitOfMeasure: item.unitOfMeasure,
          categoryReference: item.categoryId ? { id: item.categoryId } : undefined,
        })),
      });

      return {
        success: true,
        data: {
          syncId: response.syncId,
          status: "completed",
          itemsProcessed: response.results.processed,
          itemsAdded: response.results.created,
          itemsUpdated: response.results.updated,
          itemsRemoved: response.results.deleted,
          errors: response.results.errors.map(e => ({
            itemId: e.itemId,
            code: "SYNC_ERROR",
            message: e.message,
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
      const offset = ((options.page || 1) - 1) * (options.pageSize || 50);
      const limit = options.pageSize || 50;

      const filters: string[] = [];
      if (options.category) filters.push(`categoryReference.id eq "${options.category}"`);
      if (options.supplierId) filters.push(`supplierReference.id eq "${options.supplierId}"`);
      if (options.search) filters.push(`itemName co "${options.search}"`);

      const filterParam = filters.length > 0 ? `&filter=${encodeURIComponent(filters.join(" and "))}` : "";

      const response = await this.apiRequest<{
        data: Array<{
          id: string;
          itemId: string;
          itemName: string;
          itemDescription: string;
          unitPrice: { amount: number; currency: string };
          unitOfMeasure: string;
          categoryReference?: { id: string; descriptor: string };
          supplierReference: { id: string; descriptor: string };
          imageUrls?: string[];
          active: boolean;
        }>;
        total: number;
      }>("GET", `/procurement/catalogItems?offset=${offset}&limit=${limit}${filterParam}`);

      const totalPages = Math.ceil(response.total / limit);

      return {
        success: true,
        data: {
          items: response.data.map(item => ({
            id: item.id,
            sku: item.itemId,
            name: item.itemName,
            description: item.itemDescription,
            price: item.unitPrice.amount,
            currency: item.unitPrice.currency,
            unitOfMeasure: item.unitOfMeasure,
            category: item.categoryReference ? {
              id: item.categoryReference.id,
              name: item.categoryReference.descriptor,
              path: [],
            } : { id: "", name: "Uncategorized", path: [] },
            supplier: {
              id: item.supplierReference.id,
              name: item.supplierReference.descriptor,
            },
            images: item.imageUrls || [],
            attributes: {},
            availability: item.active ? "in_stock" : "out_of_stock",
            lastUpdated: new Date().toISOString(),
          })),
          pagination: {
            page: options.page || 1,
            pageSize: limit,
            total: response.total,
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
      const filters: string[] = [`itemName co "${query}" or itemDescription co "${query}"`];
      if (options?.category) filters.push(`categoryReference.id eq "${options.category}"`);
      if (options?.supplierId) filters.push(`supplierReference.id eq "${options.supplierId}"`);

      const limit = options?.maxResults || 20;
      const filterParam = `filter=${encodeURIComponent(filters.join(" and "))}`;

      const response = await this.apiRequest<{
        data: Array<{
          id: string;
          itemId: string;
          itemName: string;
          itemDescription: string;
          unitPrice: { amount: number; currency: string };
          unitOfMeasure: string;
          categoryReference?: { id: string; descriptor: string };
          supplierReference: { id: string; descriptor: string };
        }>;
      }>("GET", `/procurement/catalogItems?limit=${limit}&${filterParam}`);

      return {
        success: true,
        data: response.data.map(item => ({
          id: item.id,
          sku: item.itemId,
          name: item.itemName,
          description: item.itemDescription,
          price: item.unitPrice.amount,
          currency: item.unitPrice.currency,
          unitOfMeasure: item.unitOfMeasure,
          category: item.categoryReference ? {
            id: item.categoryReference.id,
            name: item.categoryReference.descriptor,
            path: [],
          } : { id: "", name: "Uncategorized", path: [] },
          supplier: {
            id: item.supplierReference.id,
            name: item.supplierReference.descriptor,
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
        purchaseOrderNumber: string;
        status: string;
        createdMoment: string;
      }>("POST", "/procurement/purchaseOrders", {
        purchaseOrderNumber: order.poNumber,
        companyReference: { id: this.companyRefId },
        supplierReference: { id: order.supplier.id },
        orderDate: order.orderDate,
        shipToAddress: this.formatWorkdayAddress(order.shipTo),
        billToAddress: this.formatWorkdayAddress(order.billTo),
        purchaseOrderLines: order.lineItems.map((line, idx) => ({
          lineNumber: idx + 1,
          itemReference: line.catalogItemId ? { id: line.catalogItemId } : undefined,
          itemDescription: line.description,
          quantity: line.quantity,
          unitPrice: { amount: line.unitPrice, currency: order.currency },
          unitOfMeasure: line.unitOfMeasure,
          extendedAmount: { amount: line.totalPrice, currency: order.currency },
        })),
        totalAmount: { amount: order.total, currency: order.currency },
        paymentTerms: order.paymentTerms,
        memo: order.notes,
      });

      return {
        success: true,
        data: {
          ...order,
          id: response.id,
          externalId: response.id,
          status: this.mapWorkdayPOStatus(response.status),
          createdAt: response.createdMoment,
          updatedAt: response.createdMoment,
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
        data: Array<{
          id: string;
          purchaseOrderNumber: string;
          supplierReference: { id: string; descriptor: string };
          orderDate: string;
          purchaseOrderLines: Array<{
            lineNumber: number;
            itemDescription: string;
            quantity: number;
            unitPrice: { amount: number; currency: string };
            extendedAmount: { amount: number };
          }>;
          totalAmount: { amount: number; currency: string };
          status: string;
          createdMoment: string;
          lastUpdatedMoment: string;
        }>;
      }>("GET", `/procurement/purchaseOrders?filter=purchaseOrderNumber eq "${poNumber}"`);

      if (response.data.length === 0) {
        throw new Error(`Purchase order ${poNumber} not found`);
      }

      const po = response.data[0];

      return {
        success: true,
        data: {
          id: po.id,
          poNumber: po.purchaseOrderNumber,
          externalId: po.id,
          orderDate: po.orderDate,
          supplier: {
            id: po.supplierReference.id,
            name: po.supplierReference.descriptor,
          },
          shipTo: { street1: "", city: "", state: "", postalCode: "", country: "" },
          billTo: { street1: "", city: "", state: "", postalCode: "", country: "" },
          lineItems: po.purchaseOrderLines.map(line => ({
            lineNumber: line.lineNumber,
            description: line.itemDescription,
            quantity: line.quantity,
            unitPrice: line.unitPrice.amount,
            unitOfMeasure: "EA",
            totalPrice: line.extendedAmount.amount,
          })),
          subtotal: po.totalAmount.amount,
          tax: 0,
          shipping: 0,
          total: po.totalAmount.amount,
          currency: po.totalAmount.currency,
          status: this.mapWorkdayPOStatus(po.status),
          createdAt: po.createdMoment,
          updatedAt: po.lastUpdatedMoment,
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

      const workdayStatus = this.mapToWorkdayPOStatus(status);

      await this.apiRequest("POST", `/procurement/purchaseOrders/${poResult.data.id}/statusChange`, {
        status: workdayStatus,
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

      const response = await this.apiRequest<{ transmissionId: string; status: string }>(
        "POST",
        `/procurement/purchaseOrders/${poResult.data.id}/transmit`,
        { transmissionMethod: method || "email" }
      );

      return {
        success: true,
        data: {
          sent: response.status === "sent",
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
      const offset = ((options.page || 1) - 1) * (options.pageSize || 50);
      const limit = options.pageSize || 50;

      const filters: string[] = [];
      if (options.status) {
        filters.push(`status eq "${this.mapToWorkdayPOStatus(options.status)}"`);
      }
      if (options.supplierId) filters.push(`supplierReference.id eq "${options.supplierId}"`);
      if (options.fromDate) filters.push(`orderDate ge "${options.fromDate}"`);
      if (options.toDate) filters.push(`orderDate le "${options.toDate}"`);

      const filterParam = filters.length > 0 ? `&filter=${encodeURIComponent(filters.join(" and "))}` : "";

      const response = await this.apiRequest<{
        data: Array<{
          id: string;
          purchaseOrderNumber: string;
          supplierReference: { id: string; descriptor: string };
          orderDate: string;
          totalAmount: { amount: number; currency: string };
          status: string;
          createdMoment: string;
          lastUpdatedMoment: string;
        }>;
        total: number;
      }>("GET", `/procurement/purchaseOrders?offset=${offset}&limit=${limit}${filterParam}`);

      return {
        success: true,
        data: {
          items: response.data.map(po => ({
            id: po.id,
            poNumber: po.purchaseOrderNumber,
            externalId: po.id,
            orderDate: po.orderDate,
            supplier: {
              id: po.supplierReference.id,
              name: po.supplierReference.descriptor,
            },
            shipTo: { street1: "", city: "", state: "", postalCode: "", country: "" },
            billTo: { street1: "", city: "", state: "", postalCode: "", country: "" },
            lineItems: [],
            subtotal: po.totalAmount.amount,
            tax: 0,
            shipping: 0,
            total: po.totalAmount.amount,
            currency: po.totalAmount.currency,
            status: this.mapWorkdayPOStatus(po.status),
            createdAt: po.createdMoment,
            updatedAt: po.lastUpdatedMoment,
          })),
          pagination: {
            page: options.page || 1,
            pageSize: limit,
            total: response.total,
            totalPages: Math.ceil(response.total / limit),
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
        status: string;
        createdMoment: string;
      }>("POST", "/supplierInvoices", {
        invoiceNumber: invoice.invoiceNumber,
        supplierReference: { id: invoice.supplier.id },
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        purchaseOrderReference: invoice.poNumber ? { descriptor: invoice.poNumber } : undefined,
        invoiceLines: invoice.lineItems.map((line, idx) => ({
          lineNumber: idx + 1,
          description: line.description,
          quantity: line.quantity,
          unitPrice: { amount: line.unitPrice, currency: invoice.currency },
          extendedAmount: { amount: line.totalPrice, currency: invoice.currency },
        })),
        totalAmount: { amount: invoice.total, currency: invoice.currency },
      });

      return {
        success: true,
        data: {
          ...invoice,
          id: response.id,
          externalId: response.id,
          status: this.mapWorkdayInvoiceStatus(response.status),
          createdAt: response.createdMoment,
          updatedAt: response.createdMoment,
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
        data: Array<{
          id: string;
          invoiceNumber: string;
          supplierReference: { id: string; descriptor: string };
          invoiceDate: string;
          dueDate: string;
          invoiceLines: Array<{
            description: string;
            quantity: number;
            unitPrice: { amount: number };
            extendedAmount: { amount: number };
          }>;
          totalAmount: { amount: number; currency: string };
          status: string;
          createdMoment: string;
          lastUpdatedMoment: string;
        }>;
      }>("GET", `/supplierInvoices?filter=invoiceNumber eq "${invoiceNumber}"`);

      if (response.data.length === 0) {
        throw new Error(`Invoice ${invoiceNumber} not found`);
      }

      const inv = response.data[0];

      return {
        success: true,
        data: {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          externalId: inv.id,
          invoiceDate: inv.invoiceDate,
          dueDate: inv.dueDate,
          supplier: {
            id: inv.supplierReference.id,
            name: inv.supplierReference.descriptor,
          },
          lineItems: inv.invoiceLines.map((line, idx) => ({
            lineNumber: idx + 1,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice.amount,
            totalPrice: line.extendedAmount.amount,
          })),
          subtotal: inv.totalAmount.amount,
          tax: 0,
          total: inv.totalAmount.amount,
          currency: inv.totalAmount.currency,
          status: this.mapWorkdayInvoiceStatus(inv.status),
          createdAt: inv.createdMoment,
          updatedAt: inv.lastUpdatedMoment,
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

      await this.apiRequest(
        "POST",
        `/supplierInvoices/${invoiceResult.data.id}/match`
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
      const offset = ((options.page || 1) - 1) * (options.pageSize || 50);
      const limit = options.pageSize || 50;

      const filters: string[] = [];
      if (options.status) {
        filters.push(`status eq "${this.mapToWorkdayInvoiceStatus(options.status)}"`);
      }
      if (options.supplierId) filters.push(`supplierReference.id eq "${options.supplierId}"`);
      if (options.fromDate) filters.push(`invoiceDate ge "${options.fromDate}"`);
      if (options.toDate) filters.push(`invoiceDate le "${options.toDate}"`);

      const filterParam = filters.length > 0 ? `&filter=${encodeURIComponent(filters.join(" and "))}` : "";

      const response = await this.apiRequest<{
        data: Array<{
          id: string;
          invoiceNumber: string;
          supplierReference: { id: string; descriptor: string };
          invoiceDate: string;
          dueDate: string;
          totalAmount: { amount: number; currency: string };
          status: string;
          createdMoment: string;
        }>;
        total: number;
      }>("GET", `/supplierInvoices?offset=${offset}&limit=${limit}${filterParam}`);

      return {
        success: true,
        data: {
          items: response.data.map(inv => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            externalId: inv.id,
            invoiceDate: inv.invoiceDate,
            dueDate: inv.dueDate,
            supplier: {
              id: inv.supplierReference.id,
              name: inv.supplierReference.descriptor,
            },
            lineItems: [],
            subtotal: inv.totalAmount.amount,
            tax: 0,
            total: inv.totalAmount.amount,
            currency: inv.totalAmount.currency,
            status: this.mapWorkdayInvoiceStatus(inv.status),
            createdAt: inv.createdMoment,
            updatedAt: inv.createdMoment,
          })),
          pagination: {
            page: options.page || 1,
            pageSize: limit,
            total: response.total,
            totalPages: Math.ceil(response.total / limit),
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
        status: string;
        createdMoment: string;
      }>("POST", "/procurement/requisitions", {
        requisitionNumber: requisition.requisitionNumber,
        description: requisition.description,
        requesterReference: { id: requisition.requester.id },
        requisitionLines: requisition.lineItems.map((line, idx) => ({
          lineNumber: idx + 1,
          catalogItemReference: line.catalogItemId ? { id: line.catalogItemId } : undefined,
          description: line.description,
          quantity: line.quantity,
          estimatedUnitPrice: { amount: line.estimatedPrice, currency: requisition.currency },
          unitOfMeasure: line.unitOfMeasure,
        })),
        needByDate: requisition.needByDate,
      });

      return {
        success: true,
        data: {
          ...requisition,
          id: response.id,
          externalId: response.id,
          status: this.mapWorkdayReqStatus(response.status),
          createdAt: response.createdMoment,
          updatedAt: response.createdMoment,
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
        data: Array<{
          id: string;
          requisitionNumber: string;
          description: string;
          requesterReference: { id: string; descriptor: string };
          requisitionLines: Array<{
            description: string;
            quantity: number;
            estimatedUnitPrice: { amount: number };
          }>;
          totalAmount: { amount: number; currency: string };
          status: string;
          createdMoment: string;
          lastUpdatedMoment: string;
        }>;
      }>("GET", `/procurement/requisitions?filter=requisitionNumber eq "${requisitionNumber}"`);

      if (response.data.length === 0) {
        throw new Error(`Requisition ${requisitionNumber} not found`);
      }

      const req = response.data[0];

      return {
        success: true,
        data: {
          id: req.id,
          requisitionNumber: req.requisitionNumber,
          externalId: req.id,
          description: req.description,
          requester: {
            id: req.requesterReference.id,
            name: req.requesterReference.descriptor,
            email: "",
          },
          lineItems: req.requisitionLines.map((line, idx) => ({
            lineNumber: idx + 1,
            description: line.description,
            quantity: line.quantity,
            unitOfMeasure: "EA",
            estimatedPrice: line.estimatedUnitPrice.amount,
          })),
          totalEstimatedCost: req.totalAmount.amount,
          currency: req.totalAmount.currency,
          status: this.mapWorkdayReqStatus(req.status),
          createdAt: req.createdMoment,
          updatedAt: req.lastUpdatedMoment,
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

      await this.apiRequest("POST", `/procurement/requisitions/${reqResult.data.id}/submit`);

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
        "POST",
        `/procurement/requisitions/${reqResult.data.id}/${decision}`,
        { comment: comments }
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

      const response = await this.apiRequest<{
        purchaseOrder: { id: string; purchaseOrderNumber: string };
      }>("POST", `/procurement/requisitions/${reqResult.data.id}/convertToPurchaseOrder`);

      return this.getPurchaseOrder(response.purchaseOrder.purchaseOrderNumber);
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
      const offset = ((options.page || 1) - 1) * (options.pageSize || 50);
      const limit = options.pageSize || 50;

      const filters: string[] = [];
      if (options.status) {
        filters.push(`status eq "${this.mapToWorkdayReqStatus(options.status)}"`);
      }
      if (options.requesterId) filters.push(`requesterReference.id eq "${options.requesterId}"`);

      const filterParam = filters.length > 0 ? `&filter=${encodeURIComponent(filters.join(" and "))}` : "";

      const response = await this.apiRequest<{
        data: Array<{
          id: string;
          requisitionNumber: string;
          description: string;
          requesterReference: { id: string; descriptor: string };
          totalAmount: { amount: number; currency: string };
          status: string;
          createdMoment: string;
        }>;
        total: number;
      }>("GET", `/procurement/requisitions?offset=${offset}&limit=${limit}${filterParam}`);

      return {
        success: true,
        data: {
          items: response.data.map(req => ({
            id: req.id,
            requisitionNumber: req.requisitionNumber,
            externalId: req.id,
            description: req.description,
            requester: {
              id: req.requesterReference.id,
              name: req.requesterReference.descriptor,
              email: "",
            },
            lineItems: [],
            totalEstimatedCost: req.totalAmount.amount,
            currency: req.totalAmount.currency,
            status: this.mapWorkdayReqStatus(req.status),
            createdAt: req.createdMoment,
            updatedAt: req.createdMoment,
          })),
          pagination: {
            page: options.page || 1,
            pageSize: limit,
            total: response.total,
            totalPages: Math.ceil(response.total / limit),
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
        supplierName: string;
        supplierCode: string;
        status: string;
        address: { addressLine1: string; city: string; region: string; postalCode: string; country: string };
        primaryContact: { name: string; email: string; phone: string };
        taxIdentificationNumber: string;
        paymentTerms: string;
        diversityCertifications: Array<{ type: string; expirationDate: string }>;
      }>("GET", `/suppliers/${supplierIdOrCode}`);

      return {
        success: true,
        data: {
          id: response.id,
          name: response.supplierName,
          code: response.supplierCode,
          status: response.status === "active" ? "active" : "inactive",
          address: {
            street1: response.address.addressLine1,
            city: response.address.city,
            state: response.address.region,
            postalCode: response.address.postalCode,
            country: response.address.country,
          },
          contacts: response.primaryContact ? [{
            name: response.primaryContact.name,
            email: response.primaryContact.email,
            phone: response.primaryContact.phone,
            isPrimary: true,
          }] : [],
          taxId: response.taxIdentificationNumber,
          paymentTerms: response.paymentTerms,
          diversityCertifications: response.diversityCertifications?.map(cert => ({
            type: cert.type,
            expirationDate: cert.expirationDate,
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
      const limit = options?.maxResults || 20;
      const filters = [`supplierName co "${query}"`];

      if (options?.diversityCertification) {
        filters.push(`diversityCertifications.type eq "${options.diversityCertification}"`);
      }

      const response = await this.apiRequest<{
        data: Array<{
          id: string;
          supplierName: string;
          supplierCode: string;
          status: string;
        }>;
      }>("GET", `/suppliers?limit=${limit}&filter=${encodeURIComponent(filters.join(" and "))}`);

      return {
        success: true,
        data: response.data.map(s => ({
          id: s.id,
          name: s.supplierName,
          code: s.supplierCode,
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
      const offset = ((options.page || 1) - 1) * (options.pageSize || 50);
      const limit = options.pageSize || 50;

      const filters: string[] = [];
      if (options.status) filters.push(`status eq "${options.status}"`);

      const filterParam = filters.length > 0 ? `&filter=${encodeURIComponent(filters.join(" and "))}` : "";

      const response = await this.apiRequest<{
        data: Array<{
          id: string;
          supplierName: string;
          supplierCode: string;
          status: string;
        }>;
        total: number;
      }>("GET", `/suppliers?offset=${offset}&limit=${limit}${filterParam}`);

      return {
        success: true,
        data: {
          items: response.data.map(s => ({
            id: s.id,
            name: s.supplierName,
            code: s.supplierCode,
            status: s.status === "active" ? "active" : "inactive",
            contacts: [],
          })),
          pagination: {
            page: options.page || 1,
            pageSize: limit,
            total: response.total,
            totalPages: Math.ceil(response.total / limit),
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
  // Punchout Operations (Limited in Workday)
  // ============================================================================

  async initiatePunchout(options: {
    supplierId: string;
    userId: string;
    userEmail: string;
    userName: string;
    returnUrl: string;
  }): Promise<ConnectorResponse<PunchoutSession>> {
    // Workday has limited punchout support - typically handled through integration
    return {
      success: false,
      error: {
        code: "NOT_SUPPORTED",
        message: "Punchout is not directly supported in Workday. Use external catalog integration.",
      },
    };
  }

  async processPunchoutCart(
    sessionId: string,
    cartData: string
  ): Promise<ConnectorResponse<PunchoutCart>> {
    return {
      success: false,
      error: {
        code: "NOT_SUPPORTED",
        message: "Punchout cart processing not supported in Workday.",
      },
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private formatWorkdayAddress(address: {
    street1: string;
    street2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  }): object {
    return {
      addressLine1: address.street1,
      addressLine2: address.street2,
      city: address.city,
      region: address.state,
      postalCode: address.postalCode,
      countryReference: { isoCode: address.country },
    };
  }

  private mapWorkdayPOStatus(status: string): POStatus {
    const statusMap: Record<string, POStatus> = {
      Draft: "draft",
      "In Progress": "pending",
      Approved: "approved",
      Sent: "sent",
      Acknowledged: "acknowledged",
      "Partially Received": "partially_received",
      Received: "received",
      Canceled: "cancelled",
      Closed: "closed",
    };
    return statusMap[status] || "draft";
  }

  private mapToWorkdayPOStatus(status: POStatus): string {
    const statusMap: Record<POStatus, string> = {
      draft: "Draft",
      pending: "In Progress",
      approved: "Approved",
      sent: "Sent",
      acknowledged: "Acknowledged",
      partially_received: "Partially Received",
      received: "Received",
      cancelled: "Canceled",
      closed: "Closed",
    };
    return statusMap[status] || "Draft";
  }

  private mapWorkdayInvoiceStatus(status: string): InvoiceStatus {
    const statusMap: Record<string, InvoiceStatus> = {
      Draft: "draft",
      Submitted: "submitted",
      "Pending Approval": "pending_approval",
      Approved: "approved",
      Matched: "matched",
      Paid: "paid",
      Rejected: "rejected",
      Disputed: "disputed",
    };
    return statusMap[status] || "draft";
  }

  private mapToWorkdayInvoiceStatus(status: InvoiceStatus): string {
    const statusMap: Record<InvoiceStatus, string> = {
      draft: "Draft",
      submitted: "Submitted",
      pending_approval: "Pending Approval",
      approved: "Approved",
      matched: "Matched",
      paid: "Paid",
      rejected: "Rejected",
      disputed: "Disputed",
      cancelled: "Canceled",
    };
    return statusMap[status] || "Draft";
  }

  private mapWorkdayReqStatus(status: string): RequisitionStatus {
    const statusMap: Record<string, RequisitionStatus> = {
      Draft: "draft",
      Submitted: "submitted",
      "Pending Approval": "pending_approval",
      Approved: "approved",
      Rejected: "rejected",
      "Converted to PO": "ordered",
      Canceled: "cancelled",
    };
    return statusMap[status] || "draft";
  }

  private mapToWorkdayReqStatus(status: RequisitionStatus): string {
    const statusMap: Record<RequisitionStatus, string> = {
      draft: "Draft",
      submitted: "Submitted",
      pending_approval: "Pending Approval",
      approved: "Approved",
      rejected: "Rejected",
      ordered: "Converted to PO",
      cancelled: "Canceled",
      partially_ordered: "Partially Ordered",
    };
    return statusMap[status] || "Draft";
  }
}

export default WorkdayConnector;
