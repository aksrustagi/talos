/**
 * Unimarket Procurement Connector
 *
 * Cloud-based procurement platform designed specifically for higher education.
 * Features guided buying, hosted catalogs, and punchout.
 *
 * API Documentation: https://developer.unimarket.com/
 */

import { BaseProcurementConnector } from "../base/connector";
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

export interface UnimarketConfig extends ConnectorConfig {
  settings: {
    instanceUrl: string;
    organizationId: string;
    defaultCurrency: string;
    guidedBuyingEnabled: boolean;
    punchoutEnabled: boolean;
    cxml: {
      fromDomain: string;
      fromIdentity: string;
      toDomain: string;
      toIdentity: string;
      sharedSecret: string;
    };
    apiVersion: string;
  };
}

export class UnimarketConnector extends BaseProcurementConnector {
  private uniConfig: UnimarketConfig;
  private cxml: CXMLHandler;

  constructor(config: UnimarketConfig) {
    super(config);
    this.uniConfig = config;
    this.cxml = cxmlHandler;
  }

  async testConnection(): Promise<ConnectorResponse<{ connected: boolean; version?: string }>> {
    try {
      await this.ensureAuthenticated();
      const response = await fetch(`${this.getBaseUrl()}/api/v${this.uniConfig.settings.apiVersion}/status`, {
        headers: this.getHeaders(),
      });
      return this.success({ connected: response.ok, version: this.uniConfig.settings.apiVersion });
    } catch (error) {
      return this.error({ code: "CONNECTION_FAILED", message: String(error), retryable: true });
    }
  }

  async authenticate(): Promise<ConnectorResponse<{ accessToken: string; expiresIn: number }>> {
    const { auth } = this.config;
    if (auth.method === "oauth2" && auth.oauth2) {
      try {
        const response = await fetch(auth.oauth2.tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: auth.oauth2.clientId,
            client_secret: auth.oauth2.clientSecret,
          }),
        });
        if (!response.ok) throw new Error(`Auth failed: ${response.status}`);
        const data = await response.json();
        this.accessToken = data.access_token;
        this.tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000);
        return this.success({ accessToken: data.access_token, expiresIn: data.expires_in });
      } catch (error) {
        return this.error({ code: "AUTH_FAILED", message: String(error), retryable: false });
      }
    }
    if (auth.method === "api_key" && auth.apiKey) {
      this.accessToken = auth.apiKey.key;
      return this.success({ accessToken: auth.apiKey.key, expiresIn: 86400 });
    }
    return this.error({ code: "UNSUPPORTED_AUTH", message: "Auth method not supported", retryable: false });
  }

  async refreshToken(): Promise<ConnectorResponse<{ accessToken: string; expiresIn: number }>> {
    return this.authenticate();
  }

  // Catalog Operations
  async syncCatalog(request: CatalogSyncRequest): Promise<ConnectorResponse<CatalogSyncResult>> {
    try {
      await this.ensureAuthenticated();
      const response = await fetch(`${this.getBaseUrl()}/api/v${this.uniConfig.settings.apiVersion}/catalogs/sync`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ syncType: request.syncType, since: request.lastSyncAt }),
      });
      if (!response.ok) throw new Error(`Sync failed: ${response.status}`);
      const data = await response.json();
      return this.success(data);
    } catch (error) {
      return this.error({ code: "CATALOG_SYNC_FAILED", message: String(error), retryable: true });
    }
  }

  async getCatalogItems(options: { page?: number; pageSize?: number; category?: string; supplierId?: string; search?: string; modifiedSince?: string }): Promise<ConnectorResponse<PaginatedResponse<CatalogItem>>> {
    try {
      await this.ensureAuthenticated();
      const params = new URLSearchParams({
        page: String(options.page || 1),
        limit: String(options.pageSize || 50),
        ...(options.search && { q: options.search }),
        ...(options.category && { category: options.category }),
      });
      const response = await fetch(`${this.getBaseUrl()}/api/v${this.uniConfig.settings.apiVersion}/catalog/items?${params}`, { headers: this.getHeaders() });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      const data = await response.json();
      return this.success({
        items: (data.items || []).map(this.mapCatalogItem),
        pagination: { page: data.page, pageSize: data.limit, totalItems: data.total, totalPages: Math.ceil(data.total / data.limit), hasMore: data.hasMore },
      });
    } catch (error) {
      return this.error({ code: "CATALOG_FETCH_FAILED", message: String(error), retryable: true });
    }
  }

  async getCatalogItem(itemId: string): Promise<ConnectorResponse<CatalogItem>> {
    try {
      await this.ensureAuthenticated();
      const response = await fetch(`${this.getBaseUrl()}/api/v${this.uniConfig.settings.apiVersion}/catalog/items/${itemId}`, { headers: this.getHeaders() });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      return this.success(this.mapCatalogItem(await response.json()));
    } catch (error) {
      return this.error({ code: "CATALOG_ITEM_FETCH_FAILED", message: String(error), retryable: true });
    }
  }

  async searchCatalog(query: string, options?: { category?: string; supplierId?: string; maxResults?: number }): Promise<ConnectorResponse<CatalogItem[]>> {
    const result = await this.getCatalogItems({ search: query, category: options?.category, pageSize: options?.maxResults || 20 });
    if (result.success && result.data) return this.success(result.data.items);
    return result as ConnectorResponse<CatalogItem[]>;
  }

  // PO Operations
  async createPurchaseOrder(order: Omit<PurchaseOrder, "id" | "externalId" | "createdAt" | "updatedAt">): Promise<ConnectorResponse<PurchaseOrder>> {
    try {
      await this.ensureAuthenticated();
      const response = await fetch(`${this.getBaseUrl()}/api/v${this.uniConfig.settings.apiVersion}/orders`, {
        method: "POST", headers: this.getHeaders(), body: JSON.stringify(order),
      });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      return this.success(await response.json());
    } catch (error) {
      return this.error({ code: "PO_CREATE_FAILED", message: String(error), retryable: false });
    }
  }

  async getPurchaseOrder(poNumber: string): Promise<ConnectorResponse<PurchaseOrder>> {
    try {
      await this.ensureAuthenticated();
      const response = await fetch(`${this.getBaseUrl()}/api/v${this.uniConfig.settings.apiVersion}/orders/${poNumber}`, { headers: this.getHeaders() });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      return this.success(await response.json());
    } catch (error) {
      return this.error({ code: "PO_FETCH_FAILED", message: String(error), retryable: true });
    }
  }

  async updatePurchaseOrderStatus(poNumber: string, status: POStatus, comments?: string): Promise<ConnectorResponse<PurchaseOrder>> {
    try {
      await this.ensureAuthenticated();
      const response = await fetch(`${this.getBaseUrl()}/api/v${this.uniConfig.settings.apiVersion}/orders/${poNumber}/status`, {
        method: "PATCH", headers: this.getHeaders(), body: JSON.stringify({ status, comments }),
      });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      return this.success(await response.json());
    } catch (error) {
      return this.error({ code: "PO_STATUS_UPDATE_FAILED", message: String(error), retryable: true });
    }
  }

  async cancelPurchaseOrder(poNumber: string, reason: string): Promise<ConnectorResponse<PurchaseOrder>> {
    return this.updatePurchaseOrderStatus(poNumber, "canceled", reason);
  }

  async listPurchaseOrders(options: { page?: number; pageSize?: number; status?: POStatus; supplierId?: string; fromDate?: string; toDate?: string }): Promise<ConnectorResponse<PaginatedResponse<PurchaseOrder>>> {
    try {
      await this.ensureAuthenticated();
      const params = new URLSearchParams({ page: String(options.page || 1), limit: String(options.pageSize || 50) });
      const response = await fetch(`${this.getBaseUrl()}/api/v${this.uniConfig.settings.apiVersion}/orders?${params}`, { headers: this.getHeaders() });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      const data = await response.json();
      return this.success({ items: data.items, pagination: { page: data.page, pageSize: data.limit, totalItems: data.total, totalPages: Math.ceil(data.total / data.limit), hasMore: data.hasMore } });
    } catch (error) {
      return this.error({ code: "PO_LIST_FAILED", message: String(error), retryable: true });
    }
  }

  async sendPurchaseOrder(poNumber: string, method?: "cxml" | "edi" | "email"): Promise<ConnectorResponse<{ sent: boolean; confirmationId?: string }>> {
    try {
      await this.ensureAuthenticated();
      const response = await fetch(`${this.getBaseUrl()}/api/v${this.uniConfig.settings.apiVersion}/orders/${poNumber}/transmit`, {
        method: "POST", headers: this.getHeaders(), body: JSON.stringify({ method: method || "cxml" }),
      });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      const data = await response.json();
      return this.success({ sent: true, confirmationId: data.confirmationId });
    } catch (error) {
      return this.error({ code: "PO_SEND_FAILED", message: String(error), retryable: true });
    }
  }

  // Invoice Operations
  async createInvoice(invoice: Omit<Invoice, "id" | "externalId" | "createdAt" | "updatedAt">): Promise<ConnectorResponse<Invoice>> {
    try {
      await this.ensureAuthenticated();
      const response = await fetch(`${this.getBaseUrl()}/api/v${this.uniConfig.settings.apiVersion}/invoices`, {
        method: "POST", headers: this.getHeaders(), body: JSON.stringify(invoice),
      });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      return this.success(await response.json());
    } catch (error) {
      return this.error({ code: "INVOICE_CREATE_FAILED", message: String(error), retryable: false });
    }
  }

  async getInvoice(invoiceNumber: string): Promise<ConnectorResponse<Invoice>> {
    try {
      await this.ensureAuthenticated();
      const response = await fetch(`${this.getBaseUrl()}/api/v${this.uniConfig.settings.apiVersion}/invoices/${invoiceNumber}`, { headers: this.getHeaders() });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      return this.success(await response.json());
    } catch (error) {
      return this.error({ code: "INVOICE_FETCH_FAILED", message: String(error), retryable: true });
    }
  }

  async updateInvoiceStatus(invoiceNumber: string, status: InvoiceStatus, comments?: string): Promise<ConnectorResponse<Invoice>> {
    try {
      await this.ensureAuthenticated();
      const response = await fetch(`${this.getBaseUrl()}/api/v${this.uniConfig.settings.apiVersion}/invoices/${invoiceNumber}/status`, {
        method: "PATCH", headers: this.getHeaders(), body: JSON.stringify({ status, comments }),
      });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      return this.success(await response.json());
    } catch (error) {
      return this.error({ code: "INVOICE_STATUS_UPDATE_FAILED", message: String(error), retryable: true });
    }
  }

  async matchInvoice(invoiceNumber: string): Promise<ConnectorResponse<Invoice>> {
    try {
      await this.ensureAuthenticated();
      const response = await fetch(`${this.getBaseUrl()}/api/v${this.uniConfig.settings.apiVersion}/invoices/${invoiceNumber}/match`, {
        method: "POST", headers: this.getHeaders(),
      });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      return this.success(await response.json());
    } catch (error) {
      return this.error({ code: "INVOICE_MATCH_FAILED", message: String(error), retryable: true });
    }
  }

  async listInvoices(options: { page?: number; pageSize?: number; status?: InvoiceStatus; supplierId?: string; poNumber?: string; fromDate?: string; toDate?: string }): Promise<ConnectorResponse<PaginatedResponse<Invoice>>> {
    try {
      await this.ensureAuthenticated();
      const params = new URLSearchParams({ page: String(options.page || 1), limit: String(options.pageSize || 50) });
      const response = await fetch(`${this.getBaseUrl()}/api/v${this.uniConfig.settings.apiVersion}/invoices?${params}`, { headers: this.getHeaders() });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      const data = await response.json();
      return this.success({ items: data.items, pagination: { page: data.page, pageSize: data.limit, totalItems: data.total, totalPages: Math.ceil(data.total / data.limit), hasMore: data.hasMore } });
    } catch (error) {
      return this.error({ code: "INVOICE_LIST_FAILED", message: String(error), retryable: true });
    }
  }

  // Requisition Operations
  async createRequisition(requisition: Omit<Requisition, "id" | "externalId" | "createdAt" | "updatedAt">): Promise<ConnectorResponse<Requisition>> {
    try {
      await this.ensureAuthenticated();
      const response = await fetch(`${this.getBaseUrl()}/api/v${this.uniConfig.settings.apiVersion}/requisitions`, {
        method: "POST", headers: this.getHeaders(), body: JSON.stringify(requisition),
      });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      return this.success(await response.json());
    } catch (error) {
      return this.error({ code: "REQUISITION_CREATE_FAILED", message: String(error), retryable: false });
    }
  }

  async getRequisition(requisitionNumber: string): Promise<ConnectorResponse<Requisition>> {
    try {
      await this.ensureAuthenticated();
      const response = await fetch(`${this.getBaseUrl()}/api/v${this.uniConfig.settings.apiVersion}/requisitions/${requisitionNumber}`, { headers: this.getHeaders() });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      return this.success(await response.json());
    } catch (error) {
      return this.error({ code: "REQUISITION_FETCH_FAILED", message: String(error), retryable: true });
    }
  }

  async updateRequisition(requisitionNumber: string, updates: Partial<Requisition>): Promise<ConnectorResponse<Requisition>> {
    try {
      await this.ensureAuthenticated();
      const response = await fetch(`${this.getBaseUrl()}/api/v${this.uniConfig.settings.apiVersion}/requisitions/${requisitionNumber}`, {
        method: "PATCH", headers: this.getHeaders(), body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      return this.success(await response.json());
    } catch (error) {
      return this.error({ code: "REQUISITION_UPDATE_FAILED", message: String(error), retryable: true });
    }
  }

  async submitRequisition(requisitionNumber: string): Promise<ConnectorResponse<Requisition>> {
    try {
      await this.ensureAuthenticated();
      const response = await fetch(`${this.getBaseUrl()}/api/v${this.uniConfig.settings.apiVersion}/requisitions/${requisitionNumber}/submit`, {
        method: "POST", headers: this.getHeaders(),
      });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      return this.success(await response.json());
    } catch (error) {
      return this.error({ code: "REQUISITION_SUBMIT_FAILED", message: String(error), retryable: true });
    }
  }

  async processRequisitionApproval(requisitionNumber: string, decision: "approve" | "reject", comments?: string): Promise<ConnectorResponse<Requisition>> {
    try {
      await this.ensureAuthenticated();
      const response = await fetch(`${this.getBaseUrl()}/api/v${this.uniConfig.settings.apiVersion}/requisitions/${requisitionNumber}/approval`, {
        method: "POST", headers: this.getHeaders(), body: JSON.stringify({ decision, comments }),
      });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      return this.success(await response.json());
    } catch (error) {
      return this.error({ code: "REQUISITION_APPROVAL_FAILED", message: String(error), retryable: true });
    }
  }

  async convertRequisitionToPO(requisitionNumber: string): Promise<ConnectorResponse<PurchaseOrder>> {
    try {
      await this.ensureAuthenticated();
      const response = await fetch(`${this.getBaseUrl()}/api/v${this.uniConfig.settings.apiVersion}/requisitions/${requisitionNumber}/convert`, {
        method: "POST", headers: this.getHeaders(),
      });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      return this.success(await response.json());
    } catch (error) {
      return this.error({ code: "REQUISITION_CONVERT_FAILED", message: String(error), retryable: true });
    }
  }

  async listRequisitions(options: { page?: number; pageSize?: number; status?: RequisitionStatus; requesterId?: string; fromDate?: string; toDate?: string }): Promise<ConnectorResponse<PaginatedResponse<Requisition>>> {
    try {
      await this.ensureAuthenticated();
      const params = new URLSearchParams({ page: String(options.page || 1), limit: String(options.pageSize || 50) });
      const response = await fetch(`${this.getBaseUrl()}/api/v${this.uniConfig.settings.apiVersion}/requisitions?${params}`, { headers: this.getHeaders() });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      const data = await response.json();
      return this.success({ items: data.items, pagination: { page: data.page, pageSize: data.limit, totalItems: data.total, totalPages: Math.ceil(data.total / data.limit), hasMore: data.hasMore } });
    } catch (error) {
      return this.error({ code: "REQUISITION_LIST_FAILED", message: String(error), retryable: true });
    }
  }

  // Supplier Operations
  async getSupplier(supplierIdOrCode: string): Promise<ConnectorResponse<Supplier>> {
    try {
      await this.ensureAuthenticated();
      const response = await fetch(`${this.getBaseUrl()}/api/v${this.uniConfig.settings.apiVersion}/suppliers/${supplierIdOrCode}`, { headers: this.getHeaders() });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      return this.success(await response.json());
    } catch (error) {
      return this.error({ code: "SUPPLIER_FETCH_FAILED", message: String(error), retryable: true });
    }
  }

  async searchSuppliers(query: string, options?: { diversityCertification?: string; status?: string; maxResults?: number }): Promise<ConnectorResponse<Supplier[]>> {
    try {
      await this.ensureAuthenticated();
      const params = new URLSearchParams({ q: query, limit: String(options?.maxResults || 20) });
      const response = await fetch(`${this.getBaseUrl()}/api/v${this.uniConfig.settings.apiVersion}/suppliers?${params}`, { headers: this.getHeaders() });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      const data = await response.json();
      return this.success(data.items);
    } catch (error) {
      return this.error({ code: "SUPPLIER_SEARCH_FAILED", message: String(error), retryable: true });
    }
  }

  async listSuppliers(options: { page?: number; pageSize?: number; status?: string; diversityCertification?: string }): Promise<ConnectorResponse<PaginatedResponse<Supplier>>> {
    try {
      await this.ensureAuthenticated();
      const params = new URLSearchParams({ page: String(options.page || 1), limit: String(options.pageSize || 50) });
      const response = await fetch(`${this.getBaseUrl()}/api/v${this.uniConfig.settings.apiVersion}/suppliers?${params}`, { headers: this.getHeaders() });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      const data = await response.json();
      return this.success({ items: data.items, pagination: { page: data.page, pageSize: data.limit, totalItems: data.total, totalPages: Math.ceil(data.total / data.limit), hasMore: data.hasMore } });
    } catch (error) {
      return this.error({ code: "SUPPLIER_LIST_FAILED", message: String(error), retryable: true });
    }
  }

  async upsertSupplier(supplier: Omit<Supplier, "id" | "createdAt" | "updatedAt">): Promise<ConnectorResponse<Supplier>> {
    try {
      await this.ensureAuthenticated();
      const response = await fetch(`${this.getBaseUrl()}/api/v${this.uniConfig.settings.apiVersion}/suppliers`, {
        method: "POST", headers: this.getHeaders(), body: JSON.stringify(supplier),
      });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      return this.success(await response.json());
    } catch (error) {
      return this.error({ code: "SUPPLIER_UPSERT_FAILED", message: String(error), retryable: false });
    }
  }

  // Punchout Operations
  async initiatePunchout(options: { supplierId: string; userId: string; userEmail: string; userName: string; returnUrl: string }): Promise<ConnectorResponse<PunchoutSession>> {
    try {
      const credentials = this.getCXMLCredentials();
      const buyerCookie = `unimarket_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const punchoutXml = this.cxml.generatePunchoutSetupRequest({
        fromCredential: credentials.from, toCredential: credentials.to, senderCredential: credentials.sender,
        buyerCookie, browserFormPost: options.returnUrl, operation: "create",
        userId: options.userId, userEmail: options.userEmail,
      });
      const response = await fetch(`${this.getBaseUrl()}/punchout/${options.supplierId}`, {
        method: "POST", headers: { "Content-Type": "application/xml" }, body: punchoutXml,
      });
      const parsed = this.cxml.parsePunchoutSetupResponse(await response.text());
      if (!parsed.success || !parsed.startPageUrl) {
        return this.error({ code: "PUNCHOUT_FAILED", message: parsed.statusText, retryable: false });
      }
      return this.success({
        sessionId: buyerCookie, buyerCookie,
        user: { id: options.userId, email: options.userEmail, name: options.userName },
        supplier: { id: options.supplierId, name: "" },
        punchoutUrl: parsed.startPageUrl, returnUrl: options.returnUrl,
        createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), status: "active",
      });
    } catch (error) {
      return this.error({ code: "PUNCHOUT_INIT_FAILED", message: String(error), retryable: true });
    }
  }

  async processPunchoutCart(sessionId: string, cartData: string): Promise<ConnectorResponse<PunchoutCart>> {
    const cart = this.cxml.parsePunchoutOrderMessage(cartData);
    if (!cart) return this.error({ code: "CART_PARSE_FAILED", message: "Failed to parse cart", retryable: false });
    return this.success(cart);
  }

  async cancelPunchoutSession(sessionId: string): Promise<ConnectorResponse<void>> {
    return this.success(undefined);
  }

  // Batch Operations
  async batchCreatePurchaseOrders(orders: Array<Omit<PurchaseOrder, "id" | "externalId" | "createdAt" | "updatedAt">>): Promise<ConnectorResponse<BatchResult<PurchaseOrder>>> {
    const successful: PurchaseOrder[] = []; const failed: Array<{ item: unknown; error: any }> = [];
    for (const order of orders) {
      const result = await this.createPurchaseOrder(order);
      if (result.success && result.data) successful.push(result.data);
      else failed.push({ item: order, error: result.error });
    }
    return this.success({ successful, failed, totalProcessed: orders.length, successCount: successful.length, failureCount: failed.length });
  }

  async batchUpdateCatalogItems(items: CatalogItem[]): Promise<ConnectorResponse<BatchResult<CatalogItem>>> {
    try {
      await this.ensureAuthenticated();
      const response = await fetch(`${this.getBaseUrl()}/api/v${this.uniConfig.settings.apiVersion}/catalog/items/batch`, {
        method: "POST", headers: this.getHeaders(), body: JSON.stringify({ items }),
      });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      return this.success(await response.json());
    } catch (error) {
      return this.error({ code: "BATCH_UPDATE_FAILED", message: String(error), retryable: true });
    }
  }

  // Helpers
  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json", Accept: "application/json",
      ...(this.accessToken && { Authorization: `Bearer ${this.accessToken}` }),
    };
  }

  private getCXMLCredentials(): { from: CXMLCredential; to: CXMLCredential; sender: CXMLCredential } {
    const c = this.uniConfig.settings.cxml;
    const cred = { identity: c.fromIdentity, domain: c.fromDomain, sharedSecret: c.sharedSecret };
    return { from: cred, to: { identity: c.toIdentity, domain: c.toDomain, sharedSecret: c.sharedSecret }, sender: cred };
  }

  private mapCatalogItem(item: any): CatalogItem {
    return {
      id: item.id, supplierItemId: item.supplierItemId || item.sku, manufacturerPartNumber: item.mpn,
      name: item.name, description: item.description, unitOfMeasure: item.uom || "EA", packSize: item.packSize || 1,
      price: item.price, currency: item.currency || "USD", listPrice: item.listPrice, category: [item.category].filter(Boolean),
      supplier: { id: item.supplierId, name: item.supplierName }, availability: item.availability || "in_stock",
      attributes: item.attributes || {}, updatedAt: item.updatedAt || new Date().toISOString(),
    };
  }
}
