/**
 * Oracle Procurement Cloud Connector
 *
 * Integration with Oracle Fusion Cloud Procurement.
 * Used by large universities with Oracle ERP systems.
 *
 * Features:
 * - REST API integration
 * - Oracle Integration Cloud support
 * - Real-time sync with Oracle Financials
 * - Full P2P lifecycle support
 *
 * API Documentation: https://docs.oracle.com/en/cloud/saas/procurement/
 */

import { BaseProcurementConnector, NotSupportedError } from "../base/connector";
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
 * Oracle-specific configuration
 */
export interface OracleConfig extends ConnectorConfig {
  settings: {
    /** Oracle Cloud instance URL */
    instanceUrl: string;
    /** Business unit */
    businessUnit: string;
    /** Procurement BU */
    procurementBU: string;
    /** Default currency */
    defaultCurrency: string;
    /** Legal entity */
    legalEntity?: string;
    /** Requisition document type */
    requisitionDocType?: string;
    /** PO document type */
    poDocType?: string;
    /** Integration type */
    integrationType: "rest" | "oic" | "fbdi";
    /** API version */
    apiVersion: string;
  };
}

export class OracleConnector extends BaseProcurementConnector {
  private oracleConfig: OracleConfig;

  constructor(config: OracleConfig) {
    super(config);
    this.oracleConfig = config;
  }

  // ============================================================================
  // Authentication
  // ============================================================================

  async testConnection(): Promise<ConnectorResponse<{ connected: boolean; version?: string }>> {
    try {
      await this.ensureAuthenticated();

      const response = await fetch(
        `${this.getBaseUrl()}/fscmRestApi/resources/${this.oracleConfig.settings.apiVersion}/procurementParameters`,
        { headers: this.getHeaders() }
      );

      if (response.ok) {
        return this.success({ connected: true, version: this.oracleConfig.settings.apiVersion });
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
          throw new Error(`OAuth authentication failed: ${response.status}`);
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

    if (auth.method === "basic" && auth.basic) {
      // Oracle supports basic auth with base64 encoded credentials
      const credentials = Buffer.from(`${auth.basic.username}:${auth.basic.password}`).toString("base64");
      this.accessToken = `Basic ${credentials}`;
      return this.success({
        accessToken: this.accessToken,
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

      // Oracle uses Catalog Content Zones for catalog management
      const response = await fetch(
        `${this.getBaseUrl()}/fscmRestApi/resources/${this.oracleConfig.settings.apiVersion}/agreementLines`,
        {
          method: "GET",
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`Catalog sync failed: ${response.status}`);
      }

      const data = await response.json();
      const items = data.items || [];

      return this.success({
        syncId: `oracle_sync_${Date.now()}`,
        status: "success",
        itemsSynced: items.length,
        itemsAdded: items.length,
        itemsUpdated: 0,
        itemsRemoved: 0,
        errors: [],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
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

      const offset = ((options.page || 1) - 1) * (options.pageSize || 50);
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(options.pageSize || 50),
        ...(options.search && { q: `ItemDescription LIKE '%${options.search}%'` }),
      });

      const response = await fetch(
        `${this.getBaseUrl()}/fscmRestApi/resources/${this.oracleConfig.settings.apiVersion}/agreementLines?${params}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Failed to get catalog items: ${response.status}`);
      }

      const data = await response.json();

      return this.success({
        items: (data.items || []).map(this.mapOracleToCatalogItem),
        pagination: {
          page: options.page || 1,
          pageSize: options.pageSize || 50,
          totalItems: data.totalResults || 0,
          totalPages: Math.ceil((data.totalResults || 0) / (options.pageSize || 50)),
          hasMore: data.hasMore || false,
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
        `${this.getBaseUrl()}/fscmRestApi/resources/${this.oracleConfig.settings.apiVersion}/agreementLines/${itemId}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Failed to get catalog item: ${response.status}`);
      }

      const data = await response.json();
      return this.success(this.mapOracleToCatalogItem(data));
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

      const oracleOrder = this.mapPurchaseOrderToOracle(order);

      const response = await fetch(
        `${this.getBaseUrl()}/fscmRestApi/resources/${this.oracleConfig.settings.apiVersion}/purchaseOrders`,
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(oracleOrder),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.title || `Failed to create PO: ${response.status}`);
      }

      const data = await response.json();
      return this.success(this.mapOracleToPurchaseOrder(data));
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
        `${this.getBaseUrl()}/fscmRestApi/resources/${this.oracleConfig.settings.apiVersion}/purchaseOrders?q=OrderNumber=${poNumber}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Failed to get PO: ${response.status}`);
      }

      const data = await response.json();
      if (!data.items || data.items.length === 0) {
        return this.error({
          code: "PO_NOT_FOUND",
          message: `Purchase order ${poNumber} not found`,
          retryable: false,
        });
      }

      return this.success(this.mapOracleToPurchaseOrder(data.items[0]));
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

      // Get the PO first to get internal ID
      const poResult = await this.getPurchaseOrder(poNumber);
      if (!poResult.success || !poResult.data) {
        return poResult;
      }

      const action = this.getOracleStatusAction(status);
      const response = await fetch(
        `${this.getBaseUrl()}/fscmRestApi/resources/${this.oracleConfig.settings.apiVersion}/purchaseOrders/${poResult.data.id}`,
        {
          method: "PATCH",
          headers: this.getHeaders(),
          body: JSON.stringify({
            Status: action,
            Description: comments,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to update PO status: ${response.status}`);
      }

      return this.getPurchaseOrder(poNumber);
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

      const offset = ((options.page || 1) - 1) * (options.pageSize || 50);
      const filters: string[] = [];

      if (options.status) {
        filters.push(`Status='${this.mapPOStatusToOracle(options.status)}'`);
      }
      if (options.supplierId) {
        filters.push(`SupplierId=${options.supplierId}`);
      }
      if (options.fromDate) {
        filters.push(`CreationDate>='${options.fromDate}'`);
      }
      if (options.toDate) {
        filters.push(`CreationDate<='${options.toDate}'`);
      }

      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(options.pageSize || 50),
        ...(filters.length > 0 && { q: filters.join(";") }),
      });

      const response = await fetch(
        `${this.getBaseUrl()}/fscmRestApi/resources/${this.oracleConfig.settings.apiVersion}/purchaseOrders?${params}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Failed to list POs: ${response.status}`);
      }

      const data = await response.json();

      return this.success({
        items: (data.items || []).map(this.mapOracleToPurchaseOrder.bind(this)),
        pagination: {
          page: options.page || 1,
          pageSize: options.pageSize || 50,
          totalItems: data.totalResults || 0,
          totalPages: Math.ceil((data.totalResults || 0) / (options.pageSize || 50)),
          hasMore: data.hasMore || false,
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
    method?: "cxml" | "edi" | "email"
  ): Promise<ConnectorResponse<{ sent: boolean; confirmationId?: string }>> {
    try {
      await this.ensureAuthenticated();

      // Oracle uses Communication actions to transmit POs
      const poResult = await this.getPurchaseOrder(poNumber);
      if (!poResult.success || !poResult.data) {
        return this.error({
          code: "PO_NOT_FOUND",
          message: `Purchase order ${poNumber} not found`,
          retryable: false,
        });
      }

      const response = await fetch(
        `${this.getBaseUrl()}/fscmRestApi/resources/${this.oracleConfig.settings.apiVersion}/purchaseOrders/${poResult.data.id}/action/communicate`,
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify({
            CommunicationMethod: method?.toUpperCase() || "EMAIL",
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to send PO: ${response.status}`);
      }

      return this.success({ sent: true });
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

      const oracleInvoice = this.mapInvoiceToOracle(invoice);

      const response = await fetch(
        `${this.getBaseUrl()}/fscmRestApi/resources/${this.oracleConfig.settings.apiVersion}/invoices`,
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(oracleInvoice),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to create invoice: ${response.status}`);
      }

      const data = await response.json();
      return this.success(this.mapOracleToInvoice(data));
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
        `${this.getBaseUrl()}/fscmRestApi/resources/${this.oracleConfig.settings.apiVersion}/invoices?q=InvoiceNumber=${invoiceNumber}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Failed to get invoice: ${response.status}`);
      }

      const data = await response.json();
      if (!data.items || data.items.length === 0) {
        return this.error({
          code: "INVOICE_NOT_FOUND",
          message: `Invoice ${invoiceNumber} not found`,
          retryable: false,
        });
      }

      return this.success(this.mapOracleToInvoice(data.items[0]));
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

      const invResult = await this.getInvoice(invoiceNumber);
      if (!invResult.success || !invResult.data) {
        return invResult;
      }

      const action = this.getOracleInvoiceAction(status);
      const response = await fetch(
        `${this.getBaseUrl()}/fscmRestApi/resources/${this.oracleConfig.settings.apiVersion}/invoices/${invResult.data.id}/action/${action}`,
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify({ Description: comments }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to update invoice status: ${response.status}`);
      }

      return this.getInvoice(invoiceNumber);
    } catch (error) {
      return this.error({
        code: "INVOICE_STATUS_UPDATE_FAILED",
        message: error instanceof Error ? error.message : "Failed to update invoice status",
        retryable: true,
      });
    }
  }

  async matchInvoice(invoiceNumber: string): Promise<ConnectorResponse<Invoice>> {
    return this.updateInvoiceStatus(invoiceNumber, "matched", "Auto-matched by Talos");
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

      const offset = ((options.page || 1) - 1) * (options.pageSize || 50);
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(options.pageSize || 50),
      });

      const response = await fetch(
        `${this.getBaseUrl()}/fscmRestApi/resources/${this.oracleConfig.settings.apiVersion}/invoices?${params}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Failed to list invoices: ${response.status}`);
      }

      const data = await response.json();

      return this.success({
        items: (data.items || []).map(this.mapOracleToInvoice.bind(this)),
        pagination: {
          page: options.page || 1,
          pageSize: options.pageSize || 50,
          totalItems: data.totalResults || 0,
          totalPages: Math.ceil((data.totalResults || 0) / (options.pageSize || 50)),
          hasMore: data.hasMore || false,
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

      const oracleReq = this.mapRequisitionToOracle(requisition);

      const response = await fetch(
        `${this.getBaseUrl()}/fscmRestApi/resources/${this.oracleConfig.settings.apiVersion}/purchaseRequisitions`,
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(oracleReq),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to create requisition: ${response.status}`);
      }

      const data = await response.json();
      return this.success(this.mapOracleToRequisition(data));
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
        `${this.getBaseUrl()}/fscmRestApi/resources/${this.oracleConfig.settings.apiVersion}/purchaseRequisitions?q=RequisitionNumber=${requisitionNumber}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Failed to get requisition: ${response.status}`);
      }

      const data = await response.json();
      if (!data.items || data.items.length === 0) {
        return this.error({
          code: "REQUISITION_NOT_FOUND",
          message: `Requisition ${requisitionNumber} not found`,
          retryable: false,
        });
      }

      return this.success(this.mapOracleToRequisition(data.items[0]));
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
      const reqResult = await this.getRequisition(requisitionNumber);
      if (!reqResult.success || !reqResult.data) {
        return reqResult;
      }

      const response = await fetch(
        `${this.getBaseUrl()}/fscmRestApi/resources/${this.oracleConfig.settings.apiVersion}/purchaseRequisitions/${reqResult.data.id}`,
        {
          method: "PATCH",
          headers: this.getHeaders(),
          body: JSON.stringify(updates),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to update requisition: ${response.status}`);
      }

      return this.getRequisition(requisitionNumber);
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
      const reqResult = await this.getRequisition(requisitionNumber);
      if (!reqResult.success || !reqResult.data) {
        return reqResult;
      }

      const response = await fetch(
        `${this.getBaseUrl()}/fscmRestApi/resources/${this.oracleConfig.settings.apiVersion}/purchaseRequisitions/${reqResult.data.id}/action/submit`,
        {
          method: "POST",
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to submit requisition: ${response.status}`);
      }

      return this.getRequisition(requisitionNumber);
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
      const reqResult = await this.getRequisition(requisitionNumber);
      if (!reqResult.success || !reqResult.data) {
        return reqResult;
      }

      const action = decision === "approve" ? "approve" : "reject";
      const response = await fetch(
        `${this.getBaseUrl()}/fscmRestApi/resources/${this.oracleConfig.settings.apiVersion}/purchaseRequisitions/${reqResult.data.id}/action/${action}`,
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify({ ApprovalComment: comments }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to ${decision} requisition: ${response.status}`);
      }

      return this.getRequisition(requisitionNumber);
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
      const reqResult = await this.getRequisition(requisitionNumber);
      if (!reqResult.success || !reqResult.data) {
        return this.error({
          code: "REQUISITION_NOT_FOUND",
          message: `Requisition ${requisitionNumber} not found`,
          retryable: false,
        });
      }

      // In Oracle, this is typically done through autocreate process
      const response = await fetch(
        `${this.getBaseUrl()}/fscmRestApi/resources/${this.oracleConfig.settings.apiVersion}/purchaseRequisitions/${reqResult.data.id}/action/autocreate`,
        {
          method: "POST",
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to convert requisition: ${response.status}`);
      }

      const data = await response.json();
      return this.success(this.mapOracleToPurchaseOrder(data));
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

      const offset = ((options.page || 1) - 1) * (options.pageSize || 50);
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(options.pageSize || 50),
      });

      const response = await fetch(
        `${this.getBaseUrl()}/fscmRestApi/resources/${this.oracleConfig.settings.apiVersion}/purchaseRequisitions?${params}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Failed to list requisitions: ${response.status}`);
      }

      const data = await response.json();

      return this.success({
        items: (data.items || []).map(this.mapOracleToRequisition.bind(this)),
        pagination: {
          page: options.page || 1,
          pageSize: options.pageSize || 50,
          totalItems: data.totalResults || 0,
          totalPages: Math.ceil((data.totalResults || 0) / (options.pageSize || 50)),
          hasMore: data.hasMore || false,
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
        `${this.getBaseUrl()}/fscmRestApi/resources/${this.oracleConfig.settings.apiVersion}/suppliers/${supplierIdOrCode}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Failed to get supplier: ${response.status}`);
      }

      const data = await response.json();
      return this.success(this.mapOracleToSupplier(data));
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
        q: `SupplierName LIKE '%${query}%'`,
        limit: String(options?.maxResults || 20),
      });

      const response = await fetch(
        `${this.getBaseUrl()}/fscmRestApi/resources/${this.oracleConfig.settings.apiVersion}/suppliers?${params}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Failed to search suppliers: ${response.status}`);
      }

      const data = await response.json();
      return this.success((data.items || []).map(this.mapOracleToSupplier.bind(this)));
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

      const offset = ((options.page || 1) - 1) * (options.pageSize || 50);
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(options.pageSize || 50),
      });

      const response = await fetch(
        `${this.getBaseUrl()}/fscmRestApi/resources/${this.oracleConfig.settings.apiVersion}/suppliers?${params}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Failed to list suppliers: ${response.status}`);
      }

      const data = await response.json();

      return this.success({
        items: (data.items || []).map(this.mapOracleToSupplier.bind(this)),
        pagination: {
          page: options.page || 1,
          pageSize: options.pageSize || 50,
          totalItems: data.totalResults || 0,
          totalPages: Math.ceil((data.totalResults || 0) / (options.pageSize || 50)),
          hasMore: data.hasMore || false,
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
        `${this.getBaseUrl()}/fscmRestApi/resources/${this.oracleConfig.settings.apiVersion}/suppliers`,
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(this.mapSupplierToOracle(supplier)),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to upsert supplier: ${response.status}`);
      }

      const data = await response.json();
      return this.success(this.mapOracleToSupplier(data));
    } catch (error) {
      return this.error({
        code: "SUPPLIER_UPSERT_FAILED",
        message: error instanceof Error ? error.message : "Failed to upsert supplier",
        retryable: false,
      });
    }
  }

  // ============================================================================
  // Punchout Operations (Oracle iProcurement)
  // ============================================================================

  async initiatePunchout(options: {
    supplierId: string;
    userId: string;
    userEmail: string;
    userName: string;
    returnUrl: string;
  }): Promise<ConnectorResponse<PunchoutSession>> {
    // Oracle iProcurement handles punchout differently - this is a simplified version
    return this.error({
      code: "NOT_IMPLEMENTED",
      message: "Oracle punchout requires iProcurement configuration",
      retryable: false,
    });
  }

  async processPunchoutCart(sessionId: string, cartData: string): Promise<ConnectorResponse<PunchoutCart>> {
    return this.error({
      code: "NOT_IMPLEMENTED",
      message: "Oracle punchout cart processing not implemented",
      retryable: false,
    });
  }

  async cancelPunchoutSession(sessionId: string): Promise<ConnectorResponse<void>> {
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
    // Oracle typically uses FBDI for bulk updates
    return this.error({
      code: "NOT_IMPLEMENTED",
      message: "Use Oracle FBDI for bulk catalog updates",
      retryable: false,
    });
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (this.accessToken) {
      if (this.accessToken.startsWith("Basic ")) {
        headers.Authorization = this.accessToken;
      } else {
        headers.Authorization = `Bearer ${this.accessToken}`;
      }
    }

    return headers;
  }

  private mapOracleToCatalogItem(item: any): CatalogItem {
    return {
      id: item.LineId?.toString() || item.AgreementLineId?.toString(),
      supplierItemId: item.SupplierProductNumber || "",
      manufacturerPartNumber: item.ManufacturerPartNumber,
      name: item.ItemDescription || item.Description,
      description: item.ItemDescription || item.Description,
      unitOfMeasure: item.UnitOfMeasure || "EA",
      packSize: 1,
      price: item.UnitPrice || 0,
      currency: item.CurrencyCode || "USD",
      listPrice: item.ListPrice,
      contractPrice: item.UnitPrice,
      category: [item.CategoryName].filter(Boolean),
      unspscCode: item.UNSPSCCode,
      manufacturer: item.ManufacturerName,
      supplier: {
        id: item.SupplierId?.toString() || "",
        name: item.SupplierName || "",
      },
      availability: "in_stock",
      attributes: {},
      updatedAt: item.LastUpdateDate || new Date().toISOString(),
    };
  }

  private mapPurchaseOrderToOracle(order: Omit<PurchaseOrder, "id" | "externalId" | "createdAt" | "updatedAt">): any {
    return {
      DocumentType: this.oracleConfig.settings.poDocType || "Standard Purchase Order",
      ProcurementBU: this.oracleConfig.settings.procurementBU,
      Supplier: order.supplier.name,
      SupplierId: order.supplier.id,
      CurrencyCode: order.currency,
      lines: order.lineItems.map((line, index) => ({
        LineNumber: index + 1,
        ItemDescription: line.description,
        Quantity: line.quantity,
        UnitOfMeasure: line.unitOfMeasure,
        UnitPrice: line.unitPrice,
        Amount: line.extendedPrice,
      })),
    };
  }

  private mapOracleToPurchaseOrder(data: any): PurchaseOrder {
    return {
      id: data.POHeaderId?.toString() || data.OrderId?.toString(),
      poNumber: data.OrderNumber || data.PONumber,
      externalId: data.POHeaderId?.toString(),
      orderDate: data.CreationDate || new Date().toISOString(),
      supplier: {
        id: data.SupplierId?.toString() || "",
        name: data.Supplier || data.SupplierName || "",
        code: data.SupplierNumber,
      },
      shipTo: {
        name: data.ShipToLocationCode || "",
        street1: "",
        city: "",
        state: "",
        postalCode: "",
        country: "US",
      },
      billTo: {
        name: data.BillToLocationCode || "",
        street1: "",
        city: "",
        state: "",
        postalCode: "",
        country: "US",
      },
      lineItems: (data.lines || []).map((line: any, index: number) => ({
        lineNumber: line.LineNumber || index + 1,
        itemId: line.ItemId?.toString(),
        supplierItemId: line.SupplierProductNumber || "",
        description: line.ItemDescription || "",
        quantity: line.Quantity || 0,
        unitOfMeasure: line.UnitOfMeasure || "EA",
        unitPrice: line.UnitPrice || 0,
        extendedPrice: line.Amount || 0,
        status: "open",
      })),
      subtotal: data.TotalAmount || 0,
      tax: data.TotalTax || 0,
      shipping: 0,
      total: data.TotalAmount || 0,
      currency: data.CurrencyCode || "USD",
      status: this.mapOraclePOStatusToInternal(data.Status),
      createdAt: data.CreationDate || new Date().toISOString(),
      updatedAt: data.LastUpdateDate || new Date().toISOString(),
    };
  }

  private mapPOStatusToOracle(status: POStatus): string {
    const mapping: Record<POStatus, string> = {
      draft: "INCOMPLETE",
      pending_approval: "REQUIRES REAPPROVAL",
      approved: "APPROVED",
      sent: "OPEN",
      acknowledged: "OPEN",
      partially_received: "OPEN",
      received: "CLOSED FOR RECEIVING",
      invoiced: "CLOSED FOR INVOICE",
      closed: "CLOSED",
      canceled: "CANCELLED",
    };
    return mapping[status] || status.toUpperCase();
  }

  private mapOraclePOStatusToInternal(status: string): POStatus {
    const mapping: Record<string, POStatus> = {
      INCOMPLETE: "draft",
      "REQUIRES REAPPROVAL": "pending_approval",
      APPROVED: "approved",
      OPEN: "sent",
      "CLOSED FOR RECEIVING": "received",
      "CLOSED FOR INVOICE": "invoiced",
      CLOSED: "closed",
      CANCELLED: "canceled",
    };
    return mapping[status] || "draft";
  }

  private getOracleStatusAction(status: POStatus): string {
    const actions: Record<POStatus, string> = {
      draft: "INCOMPLETE",
      pending_approval: "SUBMIT",
      approved: "APPROVE",
      sent: "OPEN",
      acknowledged: "OPEN",
      partially_received: "OPEN",
      received: "CLOSE",
      invoiced: "CLOSE",
      closed: "CLOSE",
      canceled: "CANCEL",
    };
    return actions[status] || "INCOMPLETE";
  }

  private mapInvoiceToOracle(invoice: Omit<Invoice, "id" | "externalId" | "createdAt" | "updatedAt">): any {
    return {
      InvoiceNumber: invoice.invoiceNumber,
      InvoiceDate: invoice.invoiceDate,
      Supplier: invoice.supplier.name,
      SupplierId: invoice.supplier.id,
      InvoiceAmount: invoice.total,
      CurrencyCode: invoice.currency,
      PaymentTerms: invoice.paymentTerms,
    };
  }

  private mapOracleToInvoice(data: any): Invoice {
    return {
      id: data.InvoiceId?.toString(),
      invoiceNumber: data.InvoiceNumber,
      externalId: data.InvoiceId?.toString(),
      poNumbers: [],
      supplier: {
        id: data.SupplierId?.toString() || "",
        name: data.SupplierName || "",
      },
      invoiceDate: data.InvoiceDate || new Date().toISOString(),
      dueDate: data.DueDate || "",
      lineItems: [],
      subtotal: data.InvoiceAmount || 0,
      tax: data.TotalTaxAmount || 0,
      shipping: 0,
      discount: 0,
      total: data.InvoiceAmount || 0,
      currency: data.CurrencyCode || "USD",
      paymentTerms: data.TermsName,
      status: this.mapOracleInvoiceStatus(data.ApprovalStatus),
      matchStatus: "pending",
      createdAt: data.CreationDate || new Date().toISOString(),
      updatedAt: data.LastUpdateDate || new Date().toISOString(),
    };
  }

  private mapOracleInvoiceStatus(status: string): InvoiceStatus {
    const mapping: Record<string, InvoiceStatus> = {
      INITIATED: "received",
      WFAPPROVED: "approved",
      VALIDATED: "matched",
      APPROVED: "approved",
      NEVER_APPROVED: "pending_match",
      NEEDS_REAPPROVAL: "exception",
      CANCELLED: "canceled",
    };
    return mapping[status] || "received";
  }

  private getOracleInvoiceAction(status: InvoiceStatus): string {
    const actions: Record<InvoiceStatus, string> = {
      received: "validate",
      pending_match: "validate",
      matched: "approve",
      exception: "hold",
      approved: "approve",
      scheduled: "pay",
      paid: "pay",
      disputed: "hold",
      canceled: "cancel",
    };
    return actions[status] || "validate";
  }

  private mapRequisitionToOracle(req: Omit<Requisition, "id" | "externalId" | "createdAt" | "updatedAt">): any {
    return {
      RequisitioningBU: this.oracleConfig.settings.procurementBU,
      Description: req.title,
      PreparerName: req.requester.name,
      PreparerEmail: req.requester.email,
      Justification: req.justification,
      lines: req.lineItems.map((line, index) => ({
        LineNumber: index + 1,
        ItemDescription: line.description,
        Quantity: line.quantity,
        UnitOfMeasure: line.unitOfMeasure,
        UnitPrice: line.estimatedUnitPrice,
      })),
    };
  }

  private mapOracleToRequisition(data: any): Requisition {
    return {
      id: data.RequisitionHeaderId?.toString(),
      requisitionNumber: data.RequisitionNumber,
      externalId: data.RequisitionHeaderId?.toString(),
      title: data.Description || "",
      requester: {
        id: data.PreparerId?.toString() || "",
        name: data.PreparerName || "",
        email: data.PreparerEmail || "",
        department: data.RequisitioningBU,
      },
      lineItems: (data.lines || []).map((line: any, index: number) => ({
        lineNumber: line.LineNumber || index + 1,
        description: line.ItemDescription || "",
        quantity: line.Quantity || 0,
        unitOfMeasure: line.UnitOfMeasure || "EA",
        estimatedUnitPrice: line.UnitPrice || 0,
        estimatedExtendedPrice: (line.Quantity || 0) * (line.UnitPrice || 0),
      })),
      totalAmount: data.TotalAmount || 0,
      currency: data.CurrencyCode || "USD",
      justification: data.Justification,
      status: this.mapOracleReqStatus(data.Status),
      createdAt: data.CreationDate || new Date().toISOString(),
      updatedAt: data.LastUpdateDate || new Date().toISOString(),
    };
  }

  private mapOracleReqStatus(status: string): RequisitionStatus {
    const mapping: Record<string, RequisitionStatus> = {
      INCOMPLETE: "draft",
      PENDING_APPROVAL: "pending_approval",
      APPROVED: "approved",
      REJECTED: "rejected",
      CANCELLED: "canceled",
      "IN PROCESS": "submitted",
      ORDERED: "converted_to_po",
    };
    return mapping[status] || "draft";
  }

  private mapOracleToSupplier(data: any): Supplier {
    return {
      id: data.SupplierId?.toString(),
      externalId: data.SupplierId?.toString(),
      code: data.SupplierNumber || "",
      name: data.Supplier || data.SupplierName || "",
      taxId: data.TaxpayerId,
      dunsNumber: data.DUNSNumber,
      diversityCertifications: [],
      addresses: [],
      status: data.EnabledFlag === "Y" ? "active" : "inactive",
      createdAt: data.CreationDate || new Date().toISOString(),
      updatedAt: data.LastUpdateDate || new Date().toISOString(),
    };
  }

  private mapSupplierToOracle(supplier: Omit<Supplier, "id" | "createdAt" | "updatedAt">): any {
    return {
      Supplier: supplier.name,
      SupplierNumber: supplier.code,
      TaxpayerId: supplier.taxId,
      DUNSNumber: supplier.dunsNumber,
      EnabledFlag: supplier.status === "active" ? "Y" : "N",
    };
  }
}
