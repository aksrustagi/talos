/**
 * Base Procurement Connector
 *
 * Abstract base class for all procurement system connectors.
 * Provides common functionality and enforces interface contract.
 */

import type {
  ConnectorConfig,
  ConnectorResponse,
  ConnectorError,
  PaginatedResponse,
  BatchResult,
  // Catalog
  CatalogItem,
  CatalogSyncRequest,
  CatalogSyncResult,
  // PO
  PurchaseOrder,
  PurchaseOrderLine,
  POStatus,
  // Invoice
  Invoice,
  InvoiceStatus,
  // Requisition
  Requisition,
  RequisitionStatus,
  // Supplier
  Supplier,
  // Punchout
  PunchoutSession,
  PunchoutCart,
} from "./types";

/**
 * Abstract base class for procurement connectors
 */
export abstract class BaseProcurementConnector {
  protected config: ConnectorConfig;
  protected accessToken?: string;
  protected tokenExpiresAt?: Date;

  constructor(config: ConnectorConfig) {
    this.config = config;
  }

  // ============================================================================
  // Abstract Methods - Must be implemented by each connector
  // ============================================================================

  /**
   * Test connection to the procurement system
   */
  abstract testConnection(): Promise<ConnectorResponse<{ connected: boolean; version?: string }>>;

  /**
   * Authenticate and obtain access token
   */
  abstract authenticate(): Promise<ConnectorResponse<{ accessToken: string; expiresIn: number }>>;

  /**
   * Refresh authentication token
   */
  abstract refreshToken(): Promise<ConnectorResponse<{ accessToken: string; expiresIn: number }>>;

  // ============================================================================
  // Catalog Operations
  // ============================================================================

  /**
   * Sync catalog from the procurement system
   */
  abstract syncCatalog(request: CatalogSyncRequest): Promise<ConnectorResponse<CatalogSyncResult>>;

  /**
   * Get catalog items with pagination
   */
  abstract getCatalogItems(options: {
    page?: number;
    pageSize?: number;
    category?: string;
    supplierId?: string;
    search?: string;
    modifiedSince?: string;
  }): Promise<ConnectorResponse<PaginatedResponse<CatalogItem>>>;

  /**
   * Get a single catalog item
   */
  abstract getCatalogItem(itemId: string): Promise<ConnectorResponse<CatalogItem>>;

  /**
   * Search catalog items
   */
  abstract searchCatalog(query: string, options?: {
    category?: string;
    supplierId?: string;
    maxResults?: number;
  }): Promise<ConnectorResponse<CatalogItem[]>>;

  // ============================================================================
  // Purchase Order Operations
  // ============================================================================

  /**
   * Create a purchase order
   */
  abstract createPurchaseOrder(order: Omit<PurchaseOrder, "id" | "externalId" | "createdAt" | "updatedAt">): Promise<ConnectorResponse<PurchaseOrder>>;

  /**
   * Get a purchase order
   */
  abstract getPurchaseOrder(poNumber: string): Promise<ConnectorResponse<PurchaseOrder>>;

  /**
   * Update purchase order status
   */
  abstract updatePurchaseOrderStatus(poNumber: string, status: POStatus, comments?: string): Promise<ConnectorResponse<PurchaseOrder>>;

  /**
   * Cancel a purchase order
   */
  abstract cancelPurchaseOrder(poNumber: string, reason: string): Promise<ConnectorResponse<PurchaseOrder>>;

  /**
   * List purchase orders with filters
   */
  abstract listPurchaseOrders(options: {
    page?: number;
    pageSize?: number;
    status?: POStatus;
    supplierId?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<ConnectorResponse<PaginatedResponse<PurchaseOrder>>>;

  /**
   * Send PO to supplier (via cXML, EDI, or email)
   */
  abstract sendPurchaseOrder(poNumber: string, method?: "cxml" | "edi" | "email"): Promise<ConnectorResponse<{ sent: boolean; confirmationId?: string }>>;

  // ============================================================================
  // Invoice Operations
  // ============================================================================

  /**
   * Create/submit an invoice
   */
  abstract createInvoice(invoice: Omit<Invoice, "id" | "externalId" | "createdAt" | "updatedAt">): Promise<ConnectorResponse<Invoice>>;

  /**
   * Get an invoice
   */
  abstract getInvoice(invoiceNumber: string): Promise<ConnectorResponse<Invoice>>;

  /**
   * Update invoice status
   */
  abstract updateInvoiceStatus(invoiceNumber: string, status: InvoiceStatus, comments?: string): Promise<ConnectorResponse<Invoice>>;

  /**
   * Match invoice to PO and receipts (3-way match)
   */
  abstract matchInvoice(invoiceNumber: string): Promise<ConnectorResponse<Invoice>>;

  /**
   * List invoices with filters
   */
  abstract listInvoices(options: {
    page?: number;
    pageSize?: number;
    status?: InvoiceStatus;
    supplierId?: string;
    poNumber?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<ConnectorResponse<PaginatedResponse<Invoice>>>;

  // ============================================================================
  // Requisition Operations
  // ============================================================================

  /**
   * Create a requisition
   */
  abstract createRequisition(requisition: Omit<Requisition, "id" | "externalId" | "createdAt" | "updatedAt">): Promise<ConnectorResponse<Requisition>>;

  /**
   * Get a requisition
   */
  abstract getRequisition(requisitionNumber: string): Promise<ConnectorResponse<Requisition>>;

  /**
   * Update requisition
   */
  abstract updateRequisition(requisitionNumber: string, updates: Partial<Requisition>): Promise<ConnectorResponse<Requisition>>;

  /**
   * Submit requisition for approval
   */
  abstract submitRequisition(requisitionNumber: string): Promise<ConnectorResponse<Requisition>>;

  /**
   * Approve/reject requisition
   */
  abstract processRequisitionApproval(
    requisitionNumber: string,
    decision: "approve" | "reject",
    comments?: string
  ): Promise<ConnectorResponse<Requisition>>;

  /**
   * Convert requisition to PO
   */
  abstract convertRequisitionToPO(requisitionNumber: string): Promise<ConnectorResponse<PurchaseOrder>>;

  /**
   * List requisitions with filters
   */
  abstract listRequisitions(options: {
    page?: number;
    pageSize?: number;
    status?: RequisitionStatus;
    requesterId?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<ConnectorResponse<PaginatedResponse<Requisition>>>;

  // ============================================================================
  // Supplier Operations
  // ============================================================================

  /**
   * Get supplier by ID or code
   */
  abstract getSupplier(supplierIdOrCode: string): Promise<ConnectorResponse<Supplier>>;

  /**
   * Search suppliers
   */
  abstract searchSuppliers(query: string, options?: {
    diversityCertification?: string;
    status?: string;
    maxResults?: number;
  }): Promise<ConnectorResponse<Supplier[]>>;

  /**
   * List suppliers with pagination
   */
  abstract listSuppliers(options: {
    page?: number;
    pageSize?: number;
    status?: string;
    diversityCertification?: string;
  }): Promise<ConnectorResponse<PaginatedResponse<Supplier>>>;

  /**
   * Create or update supplier
   */
  abstract upsertSupplier(supplier: Omit<Supplier, "id" | "createdAt" | "updatedAt">): Promise<ConnectorResponse<Supplier>>;

  // ============================================================================
  // Punchout Operations
  // ============================================================================

  /**
   * Initiate punchout session
   */
  abstract initiatePunchout(options: {
    supplierId: string;
    userId: string;
    userEmail: string;
    userName: string;
    returnUrl: string;
  }): Promise<ConnectorResponse<PunchoutSession>>;

  /**
   * Process punchout cart return
   */
  abstract processPunchoutCart(sessionId: string, cartData: string): Promise<ConnectorResponse<PunchoutCart>>;

  /**
   * Cancel punchout session
   */
  abstract cancelPunchoutSession(sessionId: string): Promise<ConnectorResponse<void>>;

  // ============================================================================
  // Batch Operations
  // ============================================================================

  /**
   * Batch create purchase orders
   */
  abstract batchCreatePurchaseOrders(orders: Array<Omit<PurchaseOrder, "id" | "externalId" | "createdAt" | "updatedAt">>): Promise<ConnectorResponse<BatchResult<PurchaseOrder>>>;

  /**
   * Batch update catalog items
   */
  abstract batchUpdateCatalogItems(items: CatalogItem[]): Promise<ConnectorResponse<BatchResult<CatalogItem>>>;

  // ============================================================================
  // Common Helper Methods
  // ============================================================================

  /**
   * Ensure authenticated before making requests
   */
  protected async ensureAuthenticated(): Promise<void> {
    if (!this.accessToken || (this.tokenExpiresAt && this.tokenExpiresAt <= new Date())) {
      const result = await this.authenticate();
      if (result.success && result.data) {
        this.accessToken = result.data.accessToken;
        this.tokenExpiresAt = new Date(Date.now() + result.data.expiresIn * 1000);
      } else {
        throw new Error("Authentication failed");
      }
    }
  }

  /**
   * Create a success response
   */
  protected success<T>(data: T, requestId?: string): ConnectorResponse<T> {
    return {
      success: true,
      data,
      metadata: {
        requestId: requestId || this.generateRequestId(),
        timestamp: new Date().toISOString(),
        duration: 0,
      },
    };
  }

  /**
   * Create an error response
   */
  protected error<T>(error: ConnectorError, requestId?: string): ConnectorResponse<T> {
    return {
      success: false,
      error,
      metadata: {
        requestId: requestId || this.generateRequestId(),
        timestamp: new Date().toISOString(),
        duration: 0,
      },
    };
  }

  /**
   * Generate a request ID
   */
  protected generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Check if a feature is supported
   */
  protected checkFeature(feature: keyof ConnectorConfig["features"]): boolean {
    return this.config.features[feature];
  }

  /**
   * Get the base URL for API requests
   */
  protected getBaseUrl(): string {
    return this.config.baseUrl;
  }

  /**
   * Get connector ID
   */
  public getId(): string {
    return this.config.id;
  }

  /**
   * Get connector status
   */
  public getStatus(): ConnectorConfig["status"] {
    return this.config.status;
  }

  /**
   * Get connector configuration (safe, without secrets)
   */
  public getSafeConfig(): Omit<ConnectorConfig, "auth"> & { auth: { method: string } } {
    return {
      ...this.config,
      auth: {
        method: this.config.auth.method,
      },
    };
  }
}

/**
 * Connector that doesn't support certain operations
 */
export class NotSupportedError extends Error {
  constructor(operation: string, system: string) {
    super(`Operation '${operation}' is not supported by ${system}`);
    this.name = "NotSupportedError";
  }
}
