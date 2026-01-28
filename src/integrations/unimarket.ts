/**
 * UniMarket eProcurement Integration
 *
 * Comprehensive integration with UniMarket marketplace platform.
 * Supports product catalog sync, purchase orders, invoices, punchout sessions,
 * shopping carts, and real-time inventory updates.
 */

import { XMLParser, XMLBuilder } from "fast-xml-parser";

// ============================================
// Configuration Types
// ============================================

export interface UniMarketConfig {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  organizationId: string;
  environment: "sandbox" | "production";
  webhookSecret?: string;
  timeout?: number;
}

export interface UniMarketCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface UniMarketProduct {
  productId: string;
  sku: string;
  name: string;
  description: string;
  manufacturer: string;
  manufacturerPartNumber: string;
  category: string[];
  unspscCode?: string;
  price: number;
  currency: string;
  unitOfMeasure: string;
  packSize: number;
  minOrderQty: number;
  availability: "in_stock" | "limited" | "backorder" | "out_of_stock" | "discontinued";
  leadTimeDays: number;
  imageUrl?: string;
  specifications?: Record<string, string>;
  certifications?: string[];
  sustainabilityRating?: string;
  diversityStatus?: string[];
}

export interface UniMarketCartItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  extendedPrice: number;
  unitOfMeasure: string;
  notes?: string;
}

export interface UniMarketCart {
  cartId: string;
  userId: string;
  organizationId: string;
  items: UniMarketCartItem[];
  subtotal: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export interface UniMarketPurchaseOrder {
  poNumber: string;
  orderDate: string;
  status: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
  vendorId: string;
  vendorName: string;
  shipTo: UniMarketAddress;
  billTo: UniMarketAddress;
  lineItems: UniMarketPOLineItem[];
  subtotal: number;
  shippingCost: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  paymentTerms: string;
  specialInstructions?: string;
  trackingNumbers?: string[];
  estimatedDeliveryDate?: string;
}

export interface UniMarketAddress {
  name: string;
  attention?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  countryCode: string;
  phone?: string;
  email?: string;
}

export interface UniMarketPOLineItem {
  lineNumber: number;
  productId: string;
  sku: string;
  description: string;
  quantity: number;
  unitPrice: number;
  extendedPrice: number;
  unitOfMeasure: string;
  glCode?: string;
  budgetCode?: string;
  grantNumber?: string;
  quantityReceived?: number;
  quantityInvoiced?: number;
}

export interface UniMarketInvoice {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  status: "pending" | "matched" | "exception" | "approved" | "paid" | "disputed";
  lineItems: UniMarketInvoiceLineItem[];
  subtotal: number;
  taxAmount: number;
  shippingAmount: number;
  totalAmount: number;
  currency: string;
  paymentTerms: string;
  earlyPayDiscount?: {
    discountPercent: number;
    discountAmount: number;
    deadline: string;
  };
}

export interface UniMarketInvoiceLineItem {
  lineNumber: number;
  poLineNumber?: number;
  productId?: string;
  sku: string;
  description: string;
  quantity: number;
  unitPrice: number;
  extendedPrice: number;
  unitOfMeasure: string;
}

export interface UniMarketPunchOutSession {
  sessionId: string;
  sessionUrl: string;
  returnUrl: string;
  expiresAt: string;
  vendorId: string;
  vendorName: string;
}

export interface UniMarketWebhookEvent {
  eventId: string;
  eventType: UniMarketEventType;
  timestamp: string;
  organizationId: string;
  payload: Record<string, unknown>;
  signature: string;
}

export type UniMarketEventType =
  | "catalog.updated"
  | "catalog.product.added"
  | "catalog.product.removed"
  | "catalog.price.changed"
  | "order.created"
  | "order.confirmed"
  | "order.shipped"
  | "order.delivered"
  | "order.cancelled"
  | "invoice.received"
  | "invoice.matched"
  | "invoice.exception"
  | "inventory.updated"
  | "punchout.completed";

export interface UniMarketAPIResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    requestId: string;
    timestamp: string;
    pagination?: {
      page: number;
      pageSize: number;
      totalPages: number;
      totalItems: number;
    };
  };
}

// ============================================
// UniMarket Integration Class
// ============================================

export class UniMarketIntegration {
  private config: UniMarketConfig;
  private credentials: UniMarketCredentials | null = null;
  private xmlParser: XMLParser;
  private xmlBuilder: XMLBuilder;

  constructor(config: UniMarketConfig) {
    this.config = config;
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
    });
    this.xmlBuilder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
      format: true,
    });
  }

  // ============================================
  // Authentication
  // ============================================

  async authenticate(): Promise<UniMarketCredentials> {
    try {
      const response = await fetch(`${this.config.baseUrl}/auth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          apiKey: this.config.apiKey,
          apiSecret: this.config.apiSecret,
          organizationId: this.config.organizationId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.statusText}`);
      }

      const data = await response.json();
      this.credentials = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: Date.now() + (data.expiresIn * 1000),
      };

      return this.credentials;
    } catch (error) {
      throw new Error(`UniMarket authentication failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.credentials || Date.now() >= this.credentials.expiresAt - 60000) {
      await this.authenticate();
    }
  }

  private async makeRequest<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    options?: { timeout?: number }
  ): Promise<UniMarketAPIResponse<T>> {
    await this.ensureAuthenticated();

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options?.timeout || this.config.timeout || 30000
    );

    try {
      const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.credentials!.accessToken}`,
          "X-Organization-Id": this.config.organizationId,
          "X-Request-Id": this.generateRequestId(),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: data.error?.code || response.status.toString(),
            message: data.error?.message || response.statusText,
            details: data.error?.details,
          },
          meta: data.meta,
        };
      }

      return {
        success: true,
        data: data.data || data,
        meta: data.meta,
      };
    } catch (error) {
      clearTimeout(timeout);
      return {
        success: false,
        error: {
          code: "REQUEST_FAILED",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      };
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  // ============================================
  // Product Catalog Operations
  // ============================================

  async searchProducts(
    query: string,
    options?: {
      category?: string;
      vendor?: string;
      priceMin?: number;
      priceMax?: number;
      inStockOnly?: boolean;
      certifications?: string[];
      page?: number;
      pageSize?: number;
    }
  ): Promise<UniMarketAPIResponse<UniMarketProduct[]>> {
    const params = new URLSearchParams({
      q: query,
      ...(options?.category && { category: options.category }),
      ...(options?.vendor && { vendor: options.vendor }),
      ...(options?.priceMin && { priceMin: options.priceMin.toString() }),
      ...(options?.priceMax && { priceMax: options.priceMax.toString() }),
      ...(options?.inStockOnly && { inStockOnly: "true" }),
      ...(options?.certifications && { certifications: options.certifications.join(",") }),
      page: (options?.page || 1).toString(),
      pageSize: (options?.pageSize || 50).toString(),
    });

    return this.makeRequest<UniMarketProduct[]>("GET", `/catalog/products?${params}`);
  }

  async getProduct(productId: string): Promise<UniMarketAPIResponse<UniMarketProduct>> {
    return this.makeRequest<UniMarketProduct>("GET", `/catalog/products/${productId}`);
  }

  async getProductBySku(sku: string, vendorId?: string): Promise<UniMarketAPIResponse<UniMarketProduct>> {
    const params = new URLSearchParams({ sku });
    if (vendorId) params.set("vendorId", vendorId);
    return this.makeRequest<UniMarketProduct>("GET", `/catalog/products/by-sku?${params}`);
  }

  async getProductPricing(
    productId: string,
    quantity?: number
  ): Promise<UniMarketAPIResponse<{
    unitPrice: number;
    volumeDiscounts: Array<{ minQty: number; price: number; discountPercent: number }>;
    contractPrice?: number;
    bestPrice: number;
  }>> {
    const params = quantity ? `?quantity=${quantity}` : "";
    return this.makeRequest("GET", `/catalog/products/${productId}/pricing${params}`);
  }

  async compareProductPrices(
    productId: string
  ): Promise<UniMarketAPIResponse<Array<{
    vendorId: string;
    vendorName: string;
    price: number;
    availability: string;
    leadTimeDays: number;
    isDiverse: boolean;
    isSustainable: boolean;
  }>>> {
    return this.makeRequest("GET", `/catalog/products/${productId}/compare`);
  }

  async syncCatalog(
    vendorId?: string,
    options?: { fullSync?: boolean; since?: string }
  ): Promise<UniMarketAPIResponse<{
    syncId: string;
    status: string;
    productsAdded: number;
    productsUpdated: number;
    productsRemoved: number;
    errors: number;
  }>> {
    return this.makeRequest("POST", "/catalog/sync", {
      vendorId,
      fullSync: options?.fullSync || false,
      since: options?.since,
    });
  }

  async getCatalogSyncStatus(syncId: string): Promise<UniMarketAPIResponse<{
    syncId: string;
    status: "pending" | "in_progress" | "completed" | "failed";
    progress: number;
    productsProcessed: number;
    totalProducts: number;
    errors: string[];
  }>> {
    return this.makeRequest("GET", `/catalog/sync/${syncId}`);
  }

  // ============================================
  // Shopping Cart Operations
  // ============================================

  async createCart(userId: string): Promise<UniMarketAPIResponse<UniMarketCart>> {
    return this.makeRequest<UniMarketCart>("POST", "/cart", { userId });
  }

  async getCart(cartId: string): Promise<UniMarketAPIResponse<UniMarketCart>> {
    return this.makeRequest<UniMarketCart>("GET", `/cart/${cartId}`);
  }

  async addToCart(
    cartId: string,
    item: {
      productId: string;
      sku: string;
      quantity: number;
      notes?: string;
    }
  ): Promise<UniMarketAPIResponse<UniMarketCart>> {
    return this.makeRequest<UniMarketCart>("POST", `/cart/${cartId}/items`, item);
  }

  async updateCartItem(
    cartId: string,
    productId: string,
    quantity: number
  ): Promise<UniMarketAPIResponse<UniMarketCart>> {
    return this.makeRequest<UniMarketCart>("PUT", `/cart/${cartId}/items/${productId}`, { quantity });
  }

  async removeFromCart(cartId: string, productId: string): Promise<UniMarketAPIResponse<UniMarketCart>> {
    return this.makeRequest<UniMarketCart>("DELETE", `/cart/${cartId}/items/${productId}`);
  }

  async clearCart(cartId: string): Promise<UniMarketAPIResponse<void>> {
    return this.makeRequest<void>("DELETE", `/cart/${cartId}/items`);
  }

  async submitCart(
    cartId: string,
    options: {
      shipTo: UniMarketAddress;
      billTo: UniMarketAddress;
      budgetCode: string;
      glCode?: string;
      grantNumber?: string;
      urgency?: "standard" | "rush" | "emergency";
      neededByDate?: string;
      specialInstructions?: string;
    }
  ): Promise<UniMarketAPIResponse<{ requisitionId: string; poNumbers: string[] }>> {
    return this.makeRequest("POST", `/cart/${cartId}/submit`, options);
  }

  // ============================================
  // Purchase Order Operations
  // ============================================

  async createPurchaseOrder(
    order: Omit<UniMarketPurchaseOrder, "status">
  ): Promise<UniMarketAPIResponse<UniMarketPurchaseOrder>> {
    return this.makeRequest<UniMarketPurchaseOrder>("POST", "/orders", order);
  }

  async getPurchaseOrder(poNumber: string): Promise<UniMarketAPIResponse<UniMarketPurchaseOrder>> {
    return this.makeRequest<UniMarketPurchaseOrder>("GET", `/orders/${poNumber}`);
  }

  async getPurchaseOrders(
    options?: {
      status?: string;
      vendorId?: string;
      fromDate?: string;
      toDate?: string;
      page?: number;
      pageSize?: number;
    }
  ): Promise<UniMarketAPIResponse<UniMarketPurchaseOrder[]>> {
    const params = new URLSearchParams();
    if (options?.status) params.set("status", options.status);
    if (options?.vendorId) params.set("vendorId", options.vendorId);
    if (options?.fromDate) params.set("fromDate", options.fromDate);
    if (options?.toDate) params.set("toDate", options.toDate);
    params.set("page", (options?.page || 1).toString());
    params.set("pageSize", (options?.pageSize || 50).toString());

    return this.makeRequest<UniMarketPurchaseOrder[]>("GET", `/orders?${params}`);
  }

  async updatePurchaseOrderStatus(
    poNumber: string,
    status: UniMarketPurchaseOrder["status"],
    notes?: string
  ): Promise<UniMarketAPIResponse<UniMarketPurchaseOrder>> {
    return this.makeRequest<UniMarketPurchaseOrder>("PATCH", `/orders/${poNumber}/status`, {
      status,
      notes,
    });
  }

  async cancelPurchaseOrder(
    poNumber: string,
    reason: string
  ): Promise<UniMarketAPIResponse<UniMarketPurchaseOrder>> {
    return this.makeRequest<UniMarketPurchaseOrder>("POST", `/orders/${poNumber}/cancel`, { reason });
  }

  async transmitPurchaseOrder(
    poNumber: string,
    method: "api" | "cxml" | "email"
  ): Promise<UniMarketAPIResponse<{
    transmitted: boolean;
    transmissionId: string;
    method: string;
    timestamp: string;
    vendorConfirmation?: string;
  }>> {
    return this.makeRequest("POST", `/orders/${poNumber}/transmit`, { method });
  }

  async getOrderTracking(poNumber: string): Promise<UniMarketAPIResponse<{
    poNumber: string;
    status: string;
    shipments: Array<{
      shipmentId: string;
      carrier: string;
      trackingNumber: string;
      status: string;
      estimatedDelivery: string;
      events: Array<{
        timestamp: string;
        location: string;
        status: string;
        description: string;
      }>;
    }>;
  }>> {
    return this.makeRequest("GET", `/orders/${poNumber}/tracking`);
  }

  // ============================================
  // Invoice Operations
  // ============================================

  async getInvoice(invoiceNumber: string): Promise<UniMarketAPIResponse<UniMarketInvoice>> {
    return this.makeRequest<UniMarketInvoice>("GET", `/invoices/${invoiceNumber}`);
  }

  async getInvoices(
    options?: {
      status?: string;
      vendorId?: string;
      poNumber?: string;
      fromDate?: string;
      toDate?: string;
      page?: number;
      pageSize?: number;
    }
  ): Promise<UniMarketAPIResponse<UniMarketInvoice[]>> {
    const params = new URLSearchParams();
    if (options?.status) params.set("status", options.status);
    if (options?.vendorId) params.set("vendorId", options.vendorId);
    if (options?.poNumber) params.set("poNumber", options.poNumber);
    if (options?.fromDate) params.set("fromDate", options.fromDate);
    if (options?.toDate) params.set("toDate", options.toDate);
    params.set("page", (options?.page || 1).toString());
    params.set("pageSize", (options?.pageSize || 50).toString());

    return this.makeRequest<UniMarketInvoice[]>("GET", `/invoices?${params}`);
  }

  async matchInvoice(
    invoiceNumber: string
  ): Promise<UniMarketAPIResponse<{
    invoiceNumber: string;
    matchStatus: "matched" | "partial_match" | "exception";
    matchDetails: {
      poMatched: boolean;
      receiptMatched: boolean;
      priceMatched: boolean;
      quantityMatched: boolean;
    };
    exceptions: Array<{
      lineNumber: number;
      type: string;
      description: string;
      variance: number;
    }>;
    recommendedAction: string;
  }>> {
    return this.makeRequest("POST", `/invoices/${invoiceNumber}/match`);
  }

  async approveInvoice(
    invoiceNumber: string,
    approverId: string,
    notes?: string
  ): Promise<UniMarketAPIResponse<UniMarketInvoice>> {
    return this.makeRequest<UniMarketInvoice>("POST", `/invoices/${invoiceNumber}/approve`, {
      approverId,
      notes,
    });
  }

  async disputeInvoice(
    invoiceNumber: string,
    reason: string,
    lineNumbers?: number[]
  ): Promise<UniMarketAPIResponse<{
    disputeId: string;
    invoiceNumber: string;
    status: string;
    reason: string;
  }>> {
    return this.makeRequest("POST", `/invoices/${invoiceNumber}/dispute`, {
      reason,
      lineNumbers,
    });
  }

  // ============================================
  // PunchOut Operations
  // ============================================

  async initiatePunchOut(
    vendorId: string,
    userId: string,
    returnUrl: string,
    options?: {
      operation?: "create" | "edit" | "inspect";
      existingCartId?: string;
    }
  ): Promise<UniMarketAPIResponse<UniMarketPunchOutSession>> {
    return this.makeRequest<UniMarketPunchOutSession>("POST", "/punchout/sessions", {
      vendorId,
      userId,
      returnUrl,
      operation: options?.operation || "create",
      existingCartId: options?.existingCartId,
    });
  }

  async getPunchOutSession(sessionId: string): Promise<UniMarketAPIResponse<UniMarketPunchOutSession>> {
    return this.makeRequest<UniMarketPunchOutSession>("GET", `/punchout/sessions/${sessionId}`);
  }

  async completePunchOut(
    sessionId: string,
    cartData: string
  ): Promise<UniMarketAPIResponse<UniMarketCart>> {
    // Parse the PunchOut order message
    const parsed = this.parsePunchOutOrderMessage(cartData);
    if (!parsed.success) {
      return {
        success: false,
        error: {
          code: "PUNCHOUT_PARSE_ERROR",
          message: parsed.error || "Failed to parse PunchOut data",
        },
      };
    }

    return this.makeRequest<UniMarketCart>("POST", `/punchout/sessions/${sessionId}/complete`, {
      items: parsed.items,
      subtotal: parsed.subtotal,
    });
  }

  parsePunchOutOrderMessage(orderMessageXml: string): {
    success: boolean;
    items?: UniMarketCartItem[];
    subtotal?: number;
    error?: string;
  } {
    try {
      const parsed = this.xmlParser.parse(orderMessageXml);
      const itemsIn = parsed?.cXML?.Message?.PunchOutOrderMessage?.ItemIn || [];

      const items: UniMarketCartItem[] = (
        Array.isArray(itemsIn) ? itemsIn : [itemsIn]
      ).map((item: Record<string, unknown>) => {
        const itemDetail = item.ItemDetail as Record<string, unknown>;
        const unitPrice = itemDetail?.UnitPrice as Record<string, unknown>;
        const money = unitPrice?.Money as Record<string, unknown>;
        const quantity = parseInt(item["@_quantity"] as string, 10);
        const price = parseFloat(money?.["#text"] as string);

        return {
          productId: (item.ItemID as Record<string, unknown>)?.SupplierPartID as string,
          sku: (item.ItemID as Record<string, unknown>)?.SupplierPartID as string,
          name: (itemDetail?.Description as Record<string, unknown>)?.["#text"] as string,
          quantity,
          unitPrice: price,
          currency: (money?.["@_currency"] as string) || "USD",
          extendedPrice: quantity * price,
          unitOfMeasure: (itemDetail?.UnitOfMeasure as string) || "EA",
        };
      });

      const totalMoney = parsed?.cXML?.Message?.PunchOutOrderMessage
        ?.PunchOutOrderMessageHeader?.Total?.Money as Record<string, unknown>;
      const subtotal = totalMoney
        ? parseFloat(totalMoney["#text"] as string)
        : items.reduce((sum, item) => sum + item.extendedPrice, 0);

      return { success: true, items, subtotal };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to parse order message",
      };
    }
  }

  // ============================================
  // Vendor Operations
  // ============================================

  async getVendors(
    options?: {
      category?: string;
      diversityStatus?: string[];
      certifications?: string[];
      page?: number;
      pageSize?: number;
    }
  ): Promise<UniMarketAPIResponse<Array<{
    vendorId: string;
    name: string;
    code: string;
    categories: string[];
    diversityStatus: string[];
    certifications: string[];
    performanceScore: number;
    contractStatus: "active" | "expired" | "none";
  }>>> {
    const params = new URLSearchParams();
    if (options?.category) params.set("category", options.category);
    if (options?.diversityStatus) params.set("diversityStatus", options.diversityStatus.join(","));
    if (options?.certifications) params.set("certifications", options.certifications.join(","));
    params.set("page", (options?.page || 1).toString());
    params.set("pageSize", (options?.pageSize || 50).toString());

    return this.makeRequest("GET", `/vendors?${params}`);
  }

  async getVendor(vendorId: string): Promise<UniMarketAPIResponse<{
    vendorId: string;
    name: string;
    code: string;
    description: string;
    categories: string[];
    diversityStatus: string[];
    certifications: string[];
    sustainability: {
      rating: string;
      certifications: string[];
    };
    contact: {
      email: string;
      phone: string;
      accountRep: string;
    };
    performance: {
      overallScore: number;
      onTimeRate: number;
      qualityScore: number;
      responseTime: number;
    };
    contracts: Array<{
      contractId: string;
      name: string;
      startDate: string;
      endDate: string;
      discount: number;
    }>;
  }>> {
    return this.makeRequest("GET", `/vendors/${vendorId}`);
  }

  async getVendorPerformance(vendorId: string): Promise<UniMarketAPIResponse<{
    vendorId: string;
    period: string;
    metrics: {
      ordersPlaced: number;
      ordersDelivered: number;
      onTimeRate: number;
      perfectOrderRate: number;
      avgLeadTime: number;
      defectRate: number;
      invoiceAccuracy: number;
      responseTime: number;
      overallScore: number;
    };
    trends: {
      onTimeRateTrend: number;
      qualityTrend: number;
    };
    issues: Array<{
      date: string;
      type: string;
      description: string;
      resolution: string;
    }>;
  }>> {
    return this.makeRequest("GET", `/vendors/${vendorId}/performance`);
  }

  // ============================================
  // Inventory & Availability
  // ============================================

  async checkInventory(
    items: Array<{ productId: string; sku: string; quantity: number }>
  ): Promise<UniMarketAPIResponse<Array<{
    productId: string;
    sku: string;
    requestedQty: number;
    availableQty: number;
    isAvailable: boolean;
    leadTimeDays: number;
    alternativeProducts?: Array<{
      productId: string;
      sku: string;
      availableQty: number;
      price: number;
    }>;
  }>>> {
    return this.makeRequest("POST", "/inventory/check", { items });
  }

  async subscribeToInventoryUpdates(
    productIds: string[],
    webhookUrl: string
  ): Promise<UniMarketAPIResponse<{
    subscriptionId: string;
    productIds: string[];
    webhookUrl: string;
    status: string;
  }>> {
    return this.makeRequest("POST", "/inventory/subscribe", {
      productIds,
      webhookUrl,
    });
  }

  // ============================================
  // Contracts & Pricing
  // ============================================

  async getContracts(
    options?: {
      vendorId?: string;
      status?: "active" | "expired" | "pending";
      expiringWithinDays?: number;
    }
  ): Promise<UniMarketAPIResponse<Array<{
    contractId: string;
    vendorId: string;
    vendorName: string;
    name: string;
    type: string;
    status: string;
    startDate: string;
    endDate: string;
    baseDiscount: number;
    categoryDiscounts: Array<{
      category: string;
      discount: number;
    }>;
    terms: {
      paymentTerms: string;
      shippingTerms: string;
      minimumOrder: number;
    };
    spend: {
      ytd: number;
      commitment: number;
      utilizationRate: number;
    };
  }>>> {
    const params = new URLSearchParams();
    if (options?.vendorId) params.set("vendorId", options.vendorId);
    if (options?.status) params.set("status", options.status);
    if (options?.expiringWithinDays) params.set("expiringWithinDays", options.expiringWithinDays.toString());

    return this.makeRequest("GET", `/contracts?${params}`);
  }

  async getContractPrice(
    productId: string,
    vendorId: string,
    quantity?: number
  ): Promise<UniMarketAPIResponse<{
    productId: string;
    vendorId: string;
    listPrice: number;
    contractPrice: number;
    discount: number;
    discountType: string;
    contractId: string;
    contractName: string;
    effectiveDate: string;
    expirationDate: string;
    volumeDiscount?: {
      minQty: number;
      additionalDiscount: number;
    };
  }>> {
    const params = quantity ? `?quantity=${quantity}` : "";
    return this.makeRequest("GET", `/contracts/price/${vendorId}/${productId}${params}`);
  }

  // ============================================
  // Reports & Analytics
  // ============================================

  async getSpendReport(
    options: {
      fromDate: string;
      toDate: string;
      groupBy?: "vendor" | "category" | "department" | "month";
    }
  ): Promise<UniMarketAPIResponse<{
    totalSpend: number;
    orderCount: number;
    avgOrderValue: number;
    breakdown: Array<{
      name: string;
      spend: number;
      percentage: number;
      orderCount: number;
    }>;
    trends: Array<{
      period: string;
      spend: number;
      orderCount: number;
    }>;
  }>> {
    const params = new URLSearchParams({
      fromDate: options.fromDate,
      toDate: options.toDate,
      ...(options.groupBy && { groupBy: options.groupBy }),
    });
    return this.makeRequest("GET", `/reports/spend?${params}`);
  }

  async getSavingsReport(
    options: {
      fromDate: string;
      toDate: string;
    }
  ): Promise<UniMarketAPIResponse<{
    totalSavings: number;
    savingsBySource: Array<{
      source: string;
      amount: number;
      percentage: number;
    }>;
    topSavingsProducts: Array<{
      productId: string;
      name: string;
      savings: number;
      quantity: number;
    }>;
    contractSavings: number;
    volumeDiscountSavings: number;
    negotiatedSavings: number;
  }>> {
    const params = new URLSearchParams({
      fromDate: options.fromDate,
      toDate: options.toDate,
    });
    return this.makeRequest("GET", `/reports/savings?${params}`);
  }

  // ============================================
  // Webhook Handling
  // ============================================

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.config.webhookSecret) {
      return false;
    }

    // In production, implement proper HMAC verification
    const crypto = require("crypto");
    const expectedSignature = crypto
      .createHmac("sha256", this.config.webhookSecret)
      .update(payload)
      .digest("hex");

    return signature === `sha256=${expectedSignature}`;
  }

  parseWebhookEvent(payload: string): UniMarketWebhookEvent | null {
    try {
      return JSON.parse(payload) as UniMarketWebhookEvent;
    } catch {
      return null;
    }
  }

  // ============================================
  // cXML Support
  // ============================================

  buildCXMLPurchaseOrder(order: UniMarketPurchaseOrder): string {
    const payloadId = `${Date.now()}.${Math.random().toString(36).substring(2, 15)}@${this.config.organizationId}`;
    const timestamp = new Date().toISOString();

    const cxmlDocument = {
      "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
      cXML: {
        "@_payloadID": payloadId,
        "@_timestamp": timestamp,
        "@_xml:lang": "en-US",
        Header: {
          From: {
            Credential: {
              "@_domain": "NetworkId",
              Identity: this.config.organizationId,
            },
          },
          To: {
            Credential: {
              "@_domain": "DUNS",
              Identity: order.vendorId,
            },
          },
          Sender: {
            Credential: {
              "@_domain": "NetworkId",
              Identity: this.config.organizationId,
              SharedSecret: this.config.apiSecret,
            },
            UserAgent: "Talos UniMarket Integration v1.0",
          },
        },
        Request: {
          "@_deploymentMode": this.config.environment,
          OrderRequest: {
            OrderRequestHeader: {
              "@_orderID": order.poNumber,
              "@_orderDate": order.orderDate,
              "@_type": "new",
              Total: {
                Money: {
                  "@_currency": order.currency,
                  "#text": order.totalAmount.toFixed(2),
                },
              },
              ShipTo: this.buildCXMLAddress(order.shipTo, "ShipTo"),
              BillTo: this.buildCXMLAddress(order.billTo, "BillTo"),
              Payment: {
                PCard: {
                  "@_number": "",
                },
              },
              ...(order.specialInstructions && {
                Comments: { "@_xml:lang": "en", "#text": order.specialInstructions },
              }),
            },
            ItemOut: order.lineItems.map((item) => ({
              "@_quantity": item.quantity.toString(),
              "@_lineNumber": item.lineNumber.toString(),
              ItemID: {
                SupplierPartID: item.sku,
              },
              ItemDetail: {
                UnitPrice: {
                  Money: {
                    "@_currency": order.currency,
                    "#text": item.unitPrice.toFixed(2),
                  },
                },
                Description: { "@_xml:lang": "en", "#text": item.description },
                UnitOfMeasure: item.unitOfMeasure,
                Classification: {
                  "@_domain": "UNSPSC",
                  "#text": "00000000",
                },
              },
              ...(item.glCode && {
                Distribution: {
                  Accounting: {
                    AccountingSegment: {
                      "@_id": "GLCode",
                      Name: { "@_xml:lang": "en", "#text": item.glCode },
                    },
                  },
                },
              }),
            })),
          },
        },
      },
    };

    return this.xmlBuilder.build(cxmlDocument);
  }

  private buildCXMLAddress(address: UniMarketAddress, type: string): object {
    return {
      Address: {
        "@_isoCountryCode": address.countryCode,
        "@_addressID": type,
        Name: { "@_xml:lang": "en", "#text": address.name },
        PostalAddress: {
          Street: address.street1,
          ...(address.street2 && { Street2: address.street2 }),
          City: address.city,
          State: address.state,
          PostalCode: address.postalCode,
          Country: {
            "@_isoCountryCode": address.countryCode,
            "#text": address.country,
          },
        },
        ...(address.email && { Email: address.email }),
        ...(address.phone && { Phone: { TelephoneNumber: { Number: address.phone } } }),
      },
    };
  }

  parseCXMLResponse(responseXml: string): {
    success: boolean;
    statusCode: string;
    statusText: string;
    payloadId?: string;
    data?: Record<string, unknown>;
  } {
    try {
      const parsed = this.xmlParser.parse(responseXml);
      const response = parsed?.cXML?.Response;

      if (!response) {
        return {
          success: false,
          statusCode: "500",
          statusText: "Invalid cXML response format",
        };
      }

      const status = response.Status;
      const statusCode = status?.["@_code"] || "500";
      const statusText = status?.["@_text"] || status?.["#text"] || "Unknown";

      return {
        success: statusCode === "200",
        statusCode,
        statusText,
        payloadId: parsed?.cXML?.["@_payloadID"],
        data: response,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: "500",
        statusText: `Failed to parse response: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }
}

// ============================================
// Export Factory Function
// ============================================

export function createUniMarketClient(config: UniMarketConfig): UniMarketIntegration {
  return new UniMarketIntegration(config);
}

export default UniMarketIntegration;
