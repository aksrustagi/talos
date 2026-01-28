/**
 * Jaggaer Procurement Connector
 *
 * Full integration with Jaggaer eProcurement platform.
 * Jaggaer (formerly SciQuest) is the leading eProcurement solution for higher education.
 *
 * Features:
 * - cXML punchout catalog integration
 * - OrderRequest/Response handling
 * - Invoice processing via cXML
 * - Catalog synchronization
 * - Supplier management
 * - Contract compliance
 *
 * API Documentation: https://developer.jaggaer.com/
 */

import { BaseProcurementConnector, NotSupportedError } from "../base/connector";
import { CXMLHandler, cxmlHandler, type CXMLCredential } from "../base/cxml-handler";
import type {
  ConnectorConfig,
  ConnectorResponse,
  PaginatedResponse,
  BatchResult,
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
 * Jaggaer-specific configuration
 */
export interface JaggaerConfig extends ConnectorConfig {
  settings: {
    /** Jaggaer instance URL */
    instanceUrl: string;
    /** Organization ID in Jaggaer */
    orgId: string;
    /** Business unit ID */
    businessUnitId?: string;
    /** Default currency */
    defaultCurrency: string;
    /** Enable auto-approval below threshold */
    autoApprovalThreshold?: number;
    /** cXML network settings */
    cxml: {
      fromDomain: string;
      fromIdentity: string;
      toDomain: string;
      toIdentity: string;
      sharedSecret: string;
    };
    /** API version */
    apiVersion: string;
  };
}

/**
 * Jaggaer Procurement Connector
 */
export class JaggaerConnector extends BaseProcurementConnector {
  private cxml: CXMLHandler;
  private jaggaerConfig: JaggaerConfig;

  constructor(config: JaggaerConfig) {
    super(config);
    this.jaggaerConfig = config;
    this.cxml = cxmlHandler;
  }

  // ============================================================================
  // Authentication
  // ============================================================================

  async testConnection(): Promise<ConnectorResponse<{ connected: boolean; version?: string }>> {
    try {
      await this.ensureAuthenticated();

      const response = await fetch(`${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/health`, {
        headers: this.getHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        return this.success({
          connected: true,
          version: data.version || this.jaggaerConfig.settings.apiVersion,
        });
      }

      return this.success({ connected: false });
    } catch (error) {
      return this.error({
        code: "CONNECTION_FAILED",
        message: error instanceof Error ? error.message : "Connection test failed",
        retryable: true,
      });
    }
  }

  async authenticate(): Promise<ConnectorResponse<{ accessToken: string; expiresIn: number }>> {
    const { auth } = this.config;

    if (auth.method === "oauth2" && auth.oauth2) {
      try {
        const response = await fetch(auth.oauth2.tokenUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: auth.oauth2.clientId,
            client_secret: auth.oauth2.clientSecret,
            scope: auth.oauth2.scopes.join(" "),
          }),
        });

        if (!response.ok) {
          throw new Error(`Authentication failed: ${response.status}`);
        }

        const data = await response.json();
        this.accessToken = data.access_token;
        this.tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000);

        return this.success({
          accessToken: data.access_token,
          expiresIn: data.expires_in,
        });
      } catch (error) {
        return this.error({
          code: "AUTH_FAILED",
          message: error instanceof Error ? error.message : "Authentication failed",
          retryable: false,
        });
      }
    }

    // For shared secret (cXML), we don't need OAuth
    if (auth.method === "shared_secret") {
      return this.success({
        accessToken: "cxml-shared-secret",
        expiresIn: 86400,
      });
    }

    return this.error({
      code: "UNSUPPORTED_AUTH",
      message: `Authentication method ${auth.method} not supported`,
      retryable: false,
    });
  }

  async refreshToken(): Promise<ConnectorResponse<{ accessToken: string; expiresIn: number }>> {
    return this.authenticate();
  }

  // ============================================================================
  // Catalog Operations
  // ============================================================================

  async syncCatalog(request: CatalogSyncRequest): Promise<ConnectorResponse<CatalogSyncResult>> {
    try {
      await this.ensureAuthenticated();

      const params = new URLSearchParams({
        syncType: request.syncType,
        ...(request.lastSyncAt && { modifiedSince: request.lastSyncAt }),
        ...(request.categories && { categories: request.categories.join(",") }),
        ...(request.supplierIds && { suppliers: request.supplierIds.join(",") }),
      });

      const response = await fetch(
        `${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/catalog/sync?${params}`,
        {
          method: "POST",
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`Catalog sync failed: ${response.status}`);
      }

      const data = await response.json();

      return this.success({
        syncId: data.syncId,
        status: data.status,
        itemsSynced: data.itemsSynced,
        itemsAdded: data.itemsAdded,
        itemsUpdated: data.itemsUpdated,
        itemsRemoved: data.itemsRemoved,
        errors: data.errors || [],
        startedAt: data.startedAt,
        completedAt: data.completedAt,
      });
    } catch (error) {
      return this.error({
        code: "CATALOG_SYNC_FAILED",
        message: error instanceof Error ? error.message : "Catalog sync failed",
        retryable: true,
      });
    }
  }

  async getCatalogItems(options: {
    page?: number;
    pageSize?: number;
    category?: string;
    supplierId?: string;
    search?: string;
    modifiedSince?: string;
  }): Promise<ConnectorResponse<PaginatedResponse<CatalogItem>>> {
    try {
      await this.ensureAuthenticated();

      const params = new URLSearchParams({
        page: String(options.page || 1),
        pageSize: String(options.pageSize || 50),
        ...(options.category && { category: options.category }),
        ...(options.supplierId && { supplierId: options.supplierId }),
        ...(options.search && { q: options.search }),
        ...(options.modifiedSince && { modifiedSince: options.modifiedSince }),
      });

      const response = await fetch(
        `${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/catalog/items?${params}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Failed to get catalog items: ${response.status}`);
      }

      const data = await response.json();

      return this.success({
        items: data.items.map(this.mapCatalogItem),
        pagination: {
          page: data.page,
          pageSize: data.pageSize,
          totalItems: data.totalItems,
          totalPages: data.totalPages,
          hasMore: data.page < data.totalPages,
        },
      });
    } catch (error) {
      return this.error({
        code: "CATALOG_FETCH_FAILED",
        message: error instanceof Error ? error.message : "Failed to fetch catalog items",
        retryable: true,
      });
    }
  }

  async getCatalogItem(itemId: string): Promise<ConnectorResponse<CatalogItem>> {
    try {
      await this.ensureAuthenticated();

      const response = await fetch(
        `${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/catalog/items/${itemId}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return this.error({
            code: "ITEM_NOT_FOUND",
            message: `Catalog item ${itemId} not found`,
            retryable: false,
          });
        }
        throw new Error(`Failed to get catalog item: ${response.status}`);
      }

      const data = await response.json();
      return this.success(this.mapCatalogItem(data));
    } catch (error) {
      return this.error({
        code: "CATALOG_ITEM_FETCH_FAILED",
        message: error instanceof Error ? error.message : "Failed to fetch catalog item",
        retryable: true,
      });
    }
  }

  async searchCatalog(
    query: string,
    options?: { category?: string; supplierId?: string; maxResults?: number }
  ): Promise<ConnectorResponse<CatalogItem[]>> {
    const result = await this.getCatalogItems({
      search: query,
      category: options?.category,
      supplierId: options?.supplierId,
      pageSize: options?.maxResults || 20,
    });

    if (result.success && result.data) {
      return this.success(result.data.items);
    }

    return result as ConnectorResponse<CatalogItem[]>;
  }

  // ============================================================================
  // Purchase Order Operations
  // ============================================================================

  async createPurchaseOrder(
    order: Omit<PurchaseOrder, "id" | "externalId" | "createdAt" | "updatedAt">
  ): Promise<ConnectorResponse<PurchaseOrder>> {
    try {
      await this.ensureAuthenticated();

      const response = await fetch(
        `${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/orders`,
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(this.mapPurchaseOrderToJaggaer(order)),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `Failed to create PO: ${response.status}`);
      }

      const data = await response.json();
      return this.success(this.mapJaggaerToPurchaseOrder(data));
    } catch (error) {
      return this.error({
        code: "PO_CREATE_FAILED",
        message: error instanceof Error ? error.message : "Failed to create purchase order",
        retryable: false,
      });
    }
  }

  async getPurchaseOrder(poNumber: string): Promise<ConnectorResponse<PurchaseOrder>> {
    try {
      await this.ensureAuthenticated();

      const response = await fetch(
        `${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/orders/${poNumber}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return this.error({
            code: "PO_NOT_FOUND",
            message: `Purchase order ${poNumber} not found`,
            retryable: false,
          });
        }
        throw new Error(`Failed to get PO: ${response.status}`);
      }

      const data = await response.json();
      return this.success(this.mapJaggaerToPurchaseOrder(data));
    } catch (error) {
      return this.error({
        code: "PO_FETCH_FAILED",
        message: error instanceof Error ? error.message : "Failed to fetch purchase order",
        retryable: true,
      });
    }
  }

  async updatePurchaseOrderStatus(
    poNumber: string,
    status: POStatus,
    comments?: string
  ): Promise<ConnectorResponse<PurchaseOrder>> {
    try {
      await this.ensureAuthenticated();

      const response = await fetch(
        `${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/orders/${poNumber}/status`,
        {
          method: "PATCH",
          headers: this.getHeaders(),
          body: JSON.stringify({
            status: this.mapPOStatusToJaggaer(status),
            comments,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to update PO status: ${response.status}`);
      }

      const data = await response.json();
      return this.success(this.mapJaggaerToPurchaseOrder(data));
    } catch (error) {
      return this.error({
        code: "PO_STATUS_UPDATE_FAILED",
        message: error instanceof Error ? error.message : "Failed to update PO status",
        retryable: true,
      });
    }
  }

  async cancelPurchaseOrder(poNumber: string, reason: string): Promise<ConnectorResponse<PurchaseOrder>> {
    return this.updatePurchaseOrderStatus(poNumber, "canceled", reason);
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
      await this.ensureAuthenticated();

      const params = new URLSearchParams({
        page: String(options.page || 1),
        pageSize: String(options.pageSize || 50),
        ...(options.status && { status: this.mapPOStatusToJaggaer(options.status) }),
        ...(options.supplierId && { supplierId: options.supplierId }),
        ...(options.fromDate && { fromDate: options.fromDate }),
        ...(options.toDate && { toDate: options.toDate }),
      });

      const response = await fetch(
        `${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/orders?${params}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Failed to list POs: ${response.status}`);
      }

      const data = await response.json();

      return this.success({
        items: data.items.map((item: any) => this.mapJaggaerToPurchaseOrder(item)),
        pagination: {
          page: data.page,
          pageSize: data.pageSize,
          totalItems: data.totalItems,
          totalPages: data.totalPages,
          hasMore: data.page < data.totalPages,
        },
      });
    } catch (error) {
      return this.error({
        code: "PO_LIST_FAILED",
        message: error instanceof Error ? error.message : "Failed to list purchase orders",
        retryable: true,
      });
    }
  }

  async sendPurchaseOrder(
    poNumber: string,
    method: "cxml" | "edi" | "email" = "cxml"
  ): Promise<ConnectorResponse<{ sent: boolean; confirmationId?: string }>> {
    try {
      // Get the PO first
      const poResult = await this.getPurchaseOrder(poNumber);
      if (!poResult.success || !poResult.data) {
        return this.error({
          code: "PO_NOT_FOUND",
          message: `Purchase order ${poNumber} not found`,
          retryable: false,
        });
      }

      if (method === "cxml") {
        // Generate cXML OrderRequest
        const credentials = this.getCXMLCredentials();
        const orderXml = this.cxml.generateOrderRequest({
          fromCredential: credentials.from,
          toCredential: credentials.to,
          senderCredential: credentials.sender,
          order: poResult.data,
        });

        // Send to supplier's cXML endpoint
        const response = await fetch(
          `${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/orders/${poNumber}/transmit`,
          {
            method: "POST",
            headers: {
              ...this.getHeaders(),
              "Content-Type": "application/xml",
            },
            body: orderXml,
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to send PO via cXML: ${response.status}`);
        }

        const result = await response.json();
        return this.success({
          sent: true,
          confirmationId: result.confirmationId,
        });
      }

      // For EDI/email, use Jaggaer's transmission API
      const response = await fetch(
        `${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/orders/${poNumber}/transmit`,
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify({ method }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to send PO via ${method}: ${response.status}`);
      }

      const result = await response.json();
      return this.success({
        sent: true,
        confirmationId: result.confirmationId,
      });
    } catch (error) {
      return this.error({
        code: "PO_SEND_FAILED",
        message: error instanceof Error ? error.message : "Failed to send purchase order",
        retryable: true,
      });
    }
  }

  // ============================================================================
  // Invoice Operations
  // ============================================================================

  async createInvoice(
    invoice: Omit<Invoice, "id" | "externalId" | "createdAt" | "updatedAt">
  ): Promise<ConnectorResponse<Invoice>> {
    try {
      await this.ensureAuthenticated();

      const response = await fetch(
        `${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/invoices`,
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(this.mapInvoiceToJaggaer(invoice)),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to create invoice: ${response.status}`);
      }

      const data = await response.json();
      return this.success(this.mapJaggaerToInvoice(data));
    } catch (error) {
      return this.error({
        code: "INVOICE_CREATE_FAILED",
        message: error instanceof Error ? error.message : "Failed to create invoice",
        retryable: false,
      });
    }
  }

  async getInvoice(invoiceNumber: string): Promise<ConnectorResponse<Invoice>> {
    try {
      await this.ensureAuthenticated();

      const response = await fetch(
        `${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/invoices/${invoiceNumber}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return this.error({
            code: "INVOICE_NOT_FOUND",
            message: `Invoice ${invoiceNumber} not found`,
            retryable: false,
          });
        }
        throw new Error(`Failed to get invoice: ${response.status}`);
      }

      const data = await response.json();
      return this.success(this.mapJaggaerToInvoice(data));
    } catch (error) {
      return this.error({
        code: "INVOICE_FETCH_FAILED",
        message: error instanceof Error ? error.message : "Failed to fetch invoice",
        retryable: true,
      });
    }
  }

  async updateInvoiceStatus(
    invoiceNumber: string,
    status: InvoiceStatus,
    comments?: string
  ): Promise<ConnectorResponse<Invoice>> {
    try {
      await this.ensureAuthenticated();

      const response = await fetch(
        `${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/invoices/${invoiceNumber}/status`,
        {
          method: "PATCH",
          headers: this.getHeaders(),
          body: JSON.stringify({ status, comments }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to update invoice status: ${response.status}`);
      }

      const data = await response.json();
      return this.success(this.mapJaggaerToInvoice(data));
    } catch (error) {
      return this.error({
        code: "INVOICE_STATUS_UPDATE_FAILED",
        message: error instanceof Error ? error.message : "Failed to update invoice status",
        retryable: true,
      });
    }
  }

  async matchInvoice(invoiceNumber: string): Promise<ConnectorResponse<Invoice>> {
    try {
      await this.ensureAuthenticated();

      const response = await fetch(
        `${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/invoices/${invoiceNumber}/match`,
        {
          method: "POST",
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to match invoice: ${response.status}`);
      }

      const data = await response.json();
      return this.success(this.mapJaggaerToInvoice(data));
    } catch (error) {
      return this.error({
        code: "INVOICE_MATCH_FAILED",
        message: error instanceof Error ? error.message : "Failed to match invoice",
        retryable: true,
      });
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
      await this.ensureAuthenticated();

      const params = new URLSearchParams({
        page: String(options.page || 1),
        pageSize: String(options.pageSize || 50),
        ...(options.status && { status: options.status }),
        ...(options.supplierId && { supplierId: options.supplierId }),
        ...(options.poNumber && { poNumber: options.poNumber }),
        ...(options.fromDate && { fromDate: options.fromDate }),
        ...(options.toDate && { toDate: options.toDate }),
      });

      const response = await fetch(
        `${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/invoices?${params}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Failed to list invoices: ${response.status}`);
      }

      const data = await response.json();

      return this.success({
        items: data.items.map((item: any) => this.mapJaggaerToInvoice(item)),
        pagination: {
          page: data.page,
          pageSize: data.pageSize,
          totalItems: data.totalItems,
          totalPages: data.totalPages,
          hasMore: data.page < data.totalPages,
        },
      });
    } catch (error) {
      return this.error({
        code: "INVOICE_LIST_FAILED",
        message: error instanceof Error ? error.message : "Failed to list invoices",
        retryable: true,
      });
    }
  }

  // ============================================================================
  // Requisition Operations
  // ============================================================================

  async createRequisition(
    requisition: Omit<Requisition, "id" | "externalId" | "createdAt" | "updatedAt">
  ): Promise<ConnectorResponse<Requisition>> {
    try {
      await this.ensureAuthenticated();

      const response = await fetch(
        `${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/requisitions`,
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(requisition),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to create requisition: ${response.status}`);
      }

      const data = await response.json();
      return this.success(data);
    } catch (error) {
      return this.error({
        code: "REQUISITION_CREATE_FAILED",
        message: error instanceof Error ? error.message : "Failed to create requisition",
        retryable: false,
      });
    }
  }

  async getRequisition(requisitionNumber: string): Promise<ConnectorResponse<Requisition>> {
    try {
      await this.ensureAuthenticated();

      const response = await fetch(
        `${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/requisitions/${requisitionNumber}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Failed to get requisition: ${response.status}`);
      }

      const data = await response.json();
      return this.success(data);
    } catch (error) {
      return this.error({
        code: "REQUISITION_FETCH_FAILED",
        message: error instanceof Error ? error.message : "Failed to fetch requisition",
        retryable: true,
      });
    }
  }

  async updateRequisition(
    requisitionNumber: string,
    updates: Partial<Requisition>
  ): Promise<ConnectorResponse<Requisition>> {
    try {
      await this.ensureAuthenticated();

      const response = await fetch(
        `${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/requisitions/${requisitionNumber}`,
        {
          method: "PATCH",
          headers: this.getHeaders(),
          body: JSON.stringify(updates),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to update requisition: ${response.status}`);
      }

      const data = await response.json();
      return this.success(data);
    } catch (error) {
      return this.error({
        code: "REQUISITION_UPDATE_FAILED",
        message: error instanceof Error ? error.message : "Failed to update requisition",
        retryable: true,
      });
    }
  }

  async submitRequisition(requisitionNumber: string): Promise<ConnectorResponse<Requisition>> {
    try {
      await this.ensureAuthenticated();

      const response = await fetch(
        `${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/requisitions/${requisitionNumber}/submit`,
        {
          method: "POST",
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to submit requisition: ${response.status}`);
      }

      const data = await response.json();
      return this.success(data);
    } catch (error) {
      return this.error({
        code: "REQUISITION_SUBMIT_FAILED",
        message: error instanceof Error ? error.message : "Failed to submit requisition",
        retryable: true,
      });
    }
  }

  async processRequisitionApproval(
    requisitionNumber: string,
    decision: "approve" | "reject",
    comments?: string
  ): Promise<ConnectorResponse<Requisition>> {
    try {
      await this.ensureAuthenticated();

      const response = await fetch(
        `${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/requisitions/${requisitionNumber}/approval`,
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify({ decision, comments }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to process approval: ${response.status}`);
      }

      const data = await response.json();
      return this.success(data);
    } catch (error) {
      return this.error({
        code: "REQUISITION_APPROVAL_FAILED",
        message: error instanceof Error ? error.message : "Failed to process approval",
        retryable: true,
      });
    }
  }

  async convertRequisitionToPO(requisitionNumber: string): Promise<ConnectorResponse<PurchaseOrder>> {
    try {
      await this.ensureAuthenticated();

      const response = await fetch(
        `${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/requisitions/${requisitionNumber}/convert`,
        {
          method: "POST",
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to convert requisition: ${response.status}`);
      }

      const data = await response.json();
      return this.success(this.mapJaggaerToPurchaseOrder(data));
    } catch (error) {
      return this.error({
        code: "REQUISITION_CONVERT_FAILED",
        message: error instanceof Error ? error.message : "Failed to convert requisition to PO",
        retryable: true,
      });
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
      await this.ensureAuthenticated();

      const params = new URLSearchParams({
        page: String(options.page || 1),
        pageSize: String(options.pageSize || 50),
        ...(options.status && { status: options.status }),
        ...(options.requesterId && { requesterId: options.requesterId }),
        ...(options.fromDate && { fromDate: options.fromDate }),
        ...(options.toDate && { toDate: options.toDate }),
      });

      const response = await fetch(
        `${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/requisitions?${params}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Failed to list requisitions: ${response.status}`);
      }

      const data = await response.json();

      return this.success({
        items: data.items,
        pagination: {
          page: data.page,
          pageSize: data.pageSize,
          totalItems: data.totalItems,
          totalPages: data.totalPages,
          hasMore: data.page < data.totalPages,
        },
      });
    } catch (error) {
      return this.error({
        code: "REQUISITION_LIST_FAILED",
        message: error instanceof Error ? error.message : "Failed to list requisitions",
        retryable: true,
      });
    }
  }

  // ============================================================================
  // Supplier Operations
  // ============================================================================

  async getSupplier(supplierIdOrCode: string): Promise<ConnectorResponse<Supplier>> {
    try {
      await this.ensureAuthenticated();

      const response = await fetch(
        `${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/suppliers/${supplierIdOrCode}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Failed to get supplier: ${response.status}`);
      }

      const data = await response.json();
      return this.success(data);
    } catch (error) {
      return this.error({
        code: "SUPPLIER_FETCH_FAILED",
        message: error instanceof Error ? error.message : "Failed to fetch supplier",
        retryable: true,
      });
    }
  }

  async searchSuppliers(
    query: string,
    options?: { diversityCertification?: string; status?: string; maxResults?: number }
  ): Promise<ConnectorResponse<Supplier[]>> {
    try {
      await this.ensureAuthenticated();

      const params = new URLSearchParams({
        q: query,
        pageSize: String(options?.maxResults || 20),
        ...(options?.diversityCertification && { diversity: options.diversityCertification }),
        ...(options?.status && { status: options.status }),
      });

      const response = await fetch(
        `${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/suppliers?${params}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Failed to search suppliers: ${response.status}`);
      }

      const data = await response.json();
      return this.success(data.items);
    } catch (error) {
      return this.error({
        code: "SUPPLIER_SEARCH_FAILED",
        message: error instanceof Error ? error.message : "Failed to search suppliers",
        retryable: true,
      });
    }
  }

  async listSuppliers(options: {
    page?: number;
    pageSize?: number;
    status?: string;
    diversityCertification?: string;
  }): Promise<ConnectorResponse<PaginatedResponse<Supplier>>> {
    try {
      await this.ensureAuthenticated();

      const params = new URLSearchParams({
        page: String(options.page || 1),
        pageSize: String(options.pageSize || 50),
        ...(options.status && { status: options.status }),
        ...(options.diversityCertification && { diversity: options.diversityCertification }),
      });

      const response = await fetch(
        `${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/suppliers?${params}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Failed to list suppliers: ${response.status}`);
      }

      const data = await response.json();

      return this.success({
        items: data.items,
        pagination: {
          page: data.page,
          pageSize: data.pageSize,
          totalItems: data.totalItems,
          totalPages: data.totalPages,
          hasMore: data.page < data.totalPages,
        },
      });
    } catch (error) {
      return this.error({
        code: "SUPPLIER_LIST_FAILED",
        message: error instanceof Error ? error.message : "Failed to list suppliers",
        retryable: true,
      });
    }
  }

  async upsertSupplier(
    supplier: Omit<Supplier, "id" | "createdAt" | "updatedAt">
  ): Promise<ConnectorResponse<Supplier>> {
    try {
      await this.ensureAuthenticated();

      const response = await fetch(
        `${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/suppliers`,
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(supplier),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to upsert supplier: ${response.status}`);
      }

      const data = await response.json();
      return this.success(data);
    } catch (error) {
      return this.error({
        code: "SUPPLIER_UPSERT_FAILED",
        message: error instanceof Error ? error.message : "Failed to upsert supplier",
        retryable: false,
      });
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
      const credentials = this.getCXMLCredentials();
      const buyerCookie = `talos_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      // Generate PunchOutSetupRequest
      const punchoutXml = this.cxml.generatePunchoutSetupRequest({
        fromCredential: credentials.from,
        toCredential: credentials.to,
        senderCredential: credentials.sender,
        buyerCookie,
        browserFormPost: options.returnUrl,
        operation: "create",
        userId: options.userId,
        userEmail: options.userEmail,
        extrinsics: {
          UniqueName: options.userName,
          UserEmail: options.userEmail,
        },
      });

      // Send to Jaggaer punchout endpoint
      const response = await fetch(
        `${this.getBaseUrl()}/punchout/${options.supplierId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/xml",
          },
          body: punchoutXml,
        }
      );

      const responseXml = await response.text();
      const parsed = this.cxml.parsePunchoutSetupResponse(responseXml);

      if (!parsed.success || !parsed.startPageUrl) {
        return this.error({
          code: "PUNCHOUT_FAILED",
          message: parsed.statusText,
          retryable: false,
        });
      }

      return this.success({
        sessionId: buyerCookie,
        buyerCookie,
        user: {
          id: options.userId,
          email: options.userEmail,
          name: options.userName,
        },
        supplier: {
          id: options.supplierId,
          name: "", // Would be fetched from supplier data
        },
        punchoutUrl: parsed.startPageUrl,
        returnUrl: options.returnUrl,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes
        status: "active",
      });
    } catch (error) {
      return this.error({
        code: "PUNCHOUT_INIT_FAILED",
        message: error instanceof Error ? error.message : "Failed to initiate punchout",
        retryable: true,
      });
    }
  }

  async processPunchoutCart(sessionId: string, cartData: string): Promise<ConnectorResponse<PunchoutCart>> {
    try {
      const cart = this.cxml.parsePunchoutOrderMessage(cartData);

      if (!cart) {
        return this.error({
          code: "CART_PARSE_FAILED",
          message: "Failed to parse punchout cart data",
          retryable: false,
        });
      }

      return this.success(cart);
    } catch (error) {
      return this.error({
        code: "CART_PROCESS_FAILED",
        message: error instanceof Error ? error.message : "Failed to process punchout cart",
        retryable: false,
      });
    }
  }

  async cancelPunchoutSession(sessionId: string): Promise<ConnectorResponse<void>> {
    // Punchout sessions are typically just abandoned; no explicit cancel
    return this.success(undefined);
  }

  // ============================================================================
  // Batch Operations
  // ============================================================================

  async batchCreatePurchaseOrders(
    orders: Array<Omit<PurchaseOrder, "id" | "externalId" | "createdAt" | "updatedAt">>
  ): Promise<ConnectorResponse<BatchResult<PurchaseOrder>>> {
    const successful: PurchaseOrder[] = [];
    const failed: Array<{ item: unknown; error: any }> = [];

    for (const order of orders) {
      const result = await this.createPurchaseOrder(order);
      if (result.success && result.data) {
        successful.push(result.data);
      } else {
        failed.push({ item: order, error: result.error });
      }
    }

    return this.success({
      successful,
      failed,
      totalProcessed: orders.length,
      successCount: successful.length,
      failureCount: failed.length,
    });
  }

  async batchUpdateCatalogItems(items: CatalogItem[]): Promise<ConnectorResponse<BatchResult<CatalogItem>>> {
    try {
      await this.ensureAuthenticated();

      const response = await fetch(
        `${this.getBaseUrl()}/api/v${this.jaggaerConfig.settings.apiVersion}/catalog/items/batch`,
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify({ items }),
        }
      );

      if (!response.ok) {
        throw new Error(`Batch update failed: ${response.status}`);
      }

      const data = await response.json();

      return this.success({
        successful: data.successful.map(this.mapCatalogItem),
        failed: data.failed,
        totalProcessed: items.length,
        successCount: data.successful.length,
        failureCount: data.failed.length,
      });
    } catch (error) {
      return this.error({
        code: "BATCH_UPDATE_FAILED",
        message: error instanceof Error ? error.message : "Batch update failed",
        retryable: true,
      });
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (this.accessToken && this.accessToken !== "cxml-shared-secret") {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    return headers;
  }

  private getCXMLCredentials(): {
    from: CXMLCredential;
    to: CXMLCredential;
    sender: CXMLCredential;
  } {
    const cxml = this.jaggaerConfig.settings.cxml;
    return {
      from: {
        identity: cxml.fromIdentity,
        domain: cxml.fromDomain,
        sharedSecret: cxml.sharedSecret,
      },
      to: {
        identity: cxml.toIdentity,
        domain: cxml.toDomain,
        sharedSecret: cxml.sharedSecret,
      },
      sender: {
        identity: cxml.fromIdentity,
        domain: cxml.fromDomain,
        sharedSecret: cxml.sharedSecret,
      },
    };
  }

  private mapCatalogItem(item: any): CatalogItem {
    return {
      id: item.id,
      supplierItemId: item.supplierPartId || item.sku,
      manufacturerPartNumber: item.manufacturerPartNumber,
      name: item.name || item.description,
      description: item.description,
      longDescription: item.longDescription,
      unitOfMeasure: item.unitOfMeasure || "EA",
      packSize: item.packSize || 1,
      price: item.price,
      currency: item.currency || "USD",
      listPrice: item.listPrice,
      contractPrice: item.contractPrice,
      contractId: item.contractId,
      category: Array.isArray(item.category) ? item.category : [item.category].filter(Boolean),
      unspscCode: item.unspscCode,
      manufacturer: item.manufacturer,
      supplier: {
        id: item.supplierId,
        name: item.supplierName,
      },
      imageUrl: item.imageUrl,
      productUrl: item.productUrl,
      leadTimeDays: item.leadTimeDays,
      availability: item.availability || "in_stock",
      attributes: item.attributes || {},
      updatedAt: item.updatedAt || new Date().toISOString(),
    };
  }

  private mapPurchaseOrderToJaggaer(order: Omit<PurchaseOrder, "id" | "externalId" | "createdAt" | "updatedAt">): any {
    return {
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
      shippingMethod: order.shippingMethod,
      specialInstructions: order.specialInstructions,
      accounting: order.accounting,
      customFields: order.customFields,
    };
  }

  private mapJaggaerToPurchaseOrder(data: any): PurchaseOrder {
    return {
      id: data.id,
      poNumber: data.poNumber,
      externalId: data.externalId,
      orderDate: data.orderDate,
      supplier: data.supplier,
      shipTo: data.shipTo,
      billTo: data.billTo,
      lineItems: data.lineItems,
      subtotal: data.subtotal,
      tax: data.tax,
      shipping: data.shipping,
      total: data.total,
      currency: data.currency,
      paymentTerms: data.paymentTerms,
      shippingMethod: data.shippingMethod,
      specialInstructions: data.specialInstructions,
      status: this.mapJaggaerPOStatus(data.status),
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      customFields: data.customFields,
      accounting: data.accounting,
    };
  }

  private mapPOStatusToJaggaer(status: POStatus): string {
    const mapping: Record<POStatus, string> = {
      draft: "DRAFT",
      pending_approval: "PENDING_APPROVAL",
      approved: "APPROVED",
      sent: "TRANSMITTED",
      acknowledged: "ACKNOWLEDGED",
      partially_received: "PARTIALLY_RECEIVED",
      received: "RECEIVED",
      invoiced: "INVOICED",
      closed: "CLOSED",
      canceled: "CANCELED",
    };
    return mapping[status] || status.toUpperCase();
  }

  private mapJaggaerPOStatus(status: string): POStatus {
    const mapping: Record<string, POStatus> = {
      DRAFT: "draft",
      PENDING_APPROVAL: "pending_approval",
      APPROVED: "approved",
      TRANSMITTED: "sent",
      ACKNOWLEDGED: "acknowledged",
      PARTIALLY_RECEIVED: "partially_received",
      RECEIVED: "received",
      INVOICED: "invoiced",
      CLOSED: "closed",
      CANCELED: "canceled",
    };
    return mapping[status] || "draft";
  }

  private mapInvoiceToJaggaer(invoice: Omit<Invoice, "id" | "externalId" | "createdAt" | "updatedAt">): any {
    return invoice;
  }

  private mapJaggaerToInvoice(data: any): Invoice {
    return {
      id: data.id,
      invoiceNumber: data.invoiceNumber,
      externalId: data.externalId,
      poNumbers: data.poNumbers || [],
      supplier: data.supplier,
      invoiceDate: data.invoiceDate,
      dueDate: data.dueDate,
      lineItems: data.lineItems,
      subtotal: data.subtotal,
      tax: data.tax,
      shipping: data.shipping,
      discount: data.discount || 0,
      total: data.total,
      currency: data.currency,
      paymentTerms: data.paymentTerms,
      earlyPayDiscount: data.earlyPayDiscount,
      status: data.status,
      matchStatus: data.matchStatus,
      discrepancies: data.discrepancies,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }
}
