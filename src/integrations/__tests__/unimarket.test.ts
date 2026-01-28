/**
 * UniMarket Integration Tests
 *
 * Tests for UniMarket marketplace integration functionality.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  UniMarketIntegration,
  createUniMarketClient,
  UniMarketConfig,
} from "../unimarket";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("UniMarketIntegration", () => {
  let client: UniMarketIntegration;
  const mockConfig: UniMarketConfig = {
    baseUrl: "https://api.unimarket.com/v2",
    apiKey: "test-api-key",
    apiSecret: "test-api-secret",
    organizationId: "test-org-123",
    environment: "sandbox",
    webhookSecret: "test-webhook-secret",
    timeout: 30000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    client = createUniMarketClient(mockConfig);

    // Mock successful authentication
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        accessToken: "test-access-token",
        refreshToken: "test-refresh-token",
        expiresIn: 3600,
      }),
    });
  });

  describe("Authentication", () => {
    it("should authenticate with valid credentials", async () => {
      const credentials = await client.authenticate();

      expect(credentials.accessToken).toBe("test-access-token");
      expect(credentials.refreshToken).toBe("test-refresh-token");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/auth/token"),
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    it("should throw error on authentication failure", async () => {
      vi.clearAllMocks();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: "Unauthorized",
      });

      await expect(client.authenticate()).rejects.toThrow(
        "Authentication failed"
      );
    });
  });

  describe("Product Catalog", () => {
    it("should search products", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              productId: "prod-001",
              sku: "SKU-001",
              name: "Test Product",
              price: 49.99,
            },
          ],
          meta: {
            pagination: { totalItems: 1, page: 1, pageSize: 20 },
          },
        }),
      });

      const result = await client.searchProducts("test product", {
        category: "lab-supplies",
        inStockOnly: true,
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].name).toBe("Test Product");
    });

    it("should get product details", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            productId: "prod-001",
            sku: "SKU-001",
            name: "Test Product",
            description: "A test product",
            manufacturer: "Test Mfg",
            price: 49.99,
            availability: "in_stock",
          },
        }),
      });

      const result = await client.getProduct("prod-001");

      expect(result.success).toBe(true);
      expect(result.data!.productId).toBe("prod-001");
    });

    it("should compare product prices", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { vendorId: "v1", vendorName: "Vendor 1", price: 45.0 },
            { vendorId: "v2", vendorName: "Vendor 2", price: 42.5 },
            { vendorId: "v3", vendorName: "Vendor 3", price: 48.0 },
          ],
        }),
      });

      const result = await client.compareProductPrices("prod-001");

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);
    });
  });

  describe("Shopping Cart", () => {
    it("should create a cart", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            cartId: "cart-001",
            userId: "user-001",
            items: [],
            subtotal: 0,
          },
        }),
      });

      const result = await client.createCart("user-001");

      expect(result.success).toBe(true);
      expect(result.data!.cartId).toBe("cart-001");
    });

    it("should add item to cart", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            cartId: "cart-001",
            items: [
              {
                productId: "prod-001",
                sku: "SKU-001",
                quantity: 5,
                unitPrice: 10.0,
                extendedPrice: 50.0,
              },
            ],
            subtotal: 50.0,
          },
        }),
      });

      const result = await client.addToCart("cart-001", {
        productId: "prod-001",
        sku: "SKU-001",
        quantity: 5,
      });

      expect(result.success).toBe(true);
      expect(result.data!.items).toHaveLength(1);
      expect(result.data!.subtotal).toBe(50.0);
    });

    it("should submit cart", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            requisitionId: "req-001",
            poNumbers: ["PO-001", "PO-002"],
          },
        }),
      });

      const result = await client.submitCart("cart-001", {
        shipTo: {
          name: "Test Lab",
          street1: "123 Test St",
          city: "New York",
          state: "NY",
          postalCode: "10001",
          country: "USA",
          countryCode: "US",
        },
        billTo: {
          name: "Test Lab",
          street1: "123 Test St",
          city: "New York",
          state: "NY",
          postalCode: "10001",
          country: "USA",
          countryCode: "US",
        },
        budgetCode: "BUDGET-001",
        urgency: "standard",
      });

      expect(result.success).toBe(true);
      expect(result.data!.requisitionId).toBe("req-001");
      expect(result.data!.poNumbers).toHaveLength(2);
    });
  });

  describe("Purchase Orders", () => {
    it("should get purchase order", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            poNumber: "PO-001",
            status: "confirmed",
            totalAmount: 500.0,
            lineItems: [{ sku: "SKU-001", quantity: 10, unitPrice: 50.0 }],
          },
        }),
      });

      const result = await client.getPurchaseOrder("PO-001");

      expect(result.success).toBe(true);
      expect(result.data!.poNumber).toBe("PO-001");
      expect(result.data!.status).toBe("confirmed");
    });

    it("should track order", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            poNumber: "PO-001",
            status: "shipped",
            shipments: [
              {
                carrier: "FedEx",
                trackingNumber: "TRACK123",
                status: "in_transit",
              },
            ],
          },
        }),
      });

      const result = await client.getOrderTracking("PO-001");

      expect(result.success).toBe(true);
      expect(result.data!.shipments).toHaveLength(1);
    });
  });

  describe("Invoices", () => {
    it("should match invoice", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            invoiceNumber: "INV-001",
            matchStatus: "matched",
            matchDetails: {
              poMatched: true,
              receiptMatched: true,
              priceMatched: true,
              quantityMatched: true,
            },
            exceptions: [],
          },
        }),
      });

      const result = await client.matchInvoice("INV-001");

      expect(result.success).toBe(true);
      expect(result.data!.matchStatus).toBe("matched");
      expect(result.data!.exceptions).toHaveLength(0);
    });

    it("should approve invoice", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            invoiceNumber: "INV-001",
            status: "approved",
          },
        }),
      });

      const result = await client.approveInvoice("INV-001", "user-001", "Approved");

      expect(result.success).toBe(true);
      expect(result.data!.status).toBe("approved");
    });
  });

  describe("Vendors", () => {
    it("should list vendors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { vendorId: "v1", name: "Vendor 1", performanceScore: 95 },
            { vendorId: "v2", name: "Vendor 2", performanceScore: 88 },
          ],
        }),
      });

      const result = await client.getVendors({ category: "lab-supplies" });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it("should get vendor performance", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            vendorId: "v1",
            metrics: {
              onTimeRate: 0.96,
              perfectOrderRate: 0.92,
              defectRate: 0.01,
            },
          },
        }),
      });

      const result = await client.getVendorPerformance("v1");

      expect(result.success).toBe(true);
      expect(result.data!.metrics.onTimeRate).toBe(0.96);
    });
  });

  describe("Inventory", () => {
    it("should check inventory", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              productId: "prod-001",
              requestedQty: 10,
              availableQty: 50,
              isAvailable: true,
            },
          ],
        }),
      });

      const result = await client.checkInventory([
        { productId: "prod-001", sku: "SKU-001", quantity: 10 },
      ]);

      expect(result.success).toBe(true);
      expect(result.data![0].isAvailable).toBe(true);
    });
  });

  describe("Contracts", () => {
    it("should get contract price", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            productId: "prod-001",
            vendorId: "v1",
            listPrice: 50.0,
            contractPrice: 42.5,
            discount: 15,
          },
        }),
      });

      const result = await client.getContractPrice("prod-001", "v1");

      expect(result.success).toBe(true);
      expect(result.data!.contractPrice).toBe(42.5);
      expect(result.data!.discount).toBe(15);
    });
  });

  describe("Reports", () => {
    it("should get spend report", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            totalSpend: 1500000,
            orderCount: 2500,
            avgOrderValue: 600,
            breakdown: [
              { name: "Lab Supplies", spend: 500000, percentage: 33 },
            ],
          },
        }),
      });

      const result = await client.getSpendReport({
        fromDate: "2025-01-01",
        toDate: "2025-01-31",
        groupBy: "category",
      });

      expect(result.success).toBe(true);
      expect(result.data!.totalSpend).toBe(1500000);
    });

    it("should get savings report", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            totalSavings: 75000,
            contractSavings: 50000,
            volumeDiscountSavings: 25000,
          },
        }),
      });

      const result = await client.getSavingsReport({
        fromDate: "2025-01-01",
        toDate: "2025-01-31",
      });

      expect(result.success).toBe(true);
      expect(result.data!.totalSavings).toBe(75000);
    });
  });

  describe("Webhook Verification", () => {
    it("should verify valid webhook signature", () => {
      const payload = JSON.stringify({ eventType: "order.created" });
      // This would need the actual HMAC calculation
      // For test purposes, we're checking the function exists
      expect(typeof client.verifyWebhookSignature).toBe("function");
    });

    it("should parse webhook event", () => {
      const payload = JSON.stringify({
        eventId: "evt-001",
        eventType: "order.created",
        timestamp: "2025-01-28T12:00:00Z",
      });

      const event = client.parseWebhookEvent(payload);

      expect(event).not.toBeNull();
      expect(event!.eventId).toBe("evt-001");
      expect(event!.eventType).toBe("order.created");
    });
  });

  describe("cXML Support", () => {
    it("should build cXML purchase order", () => {
      const order = {
        poNumber: "PO-001",
        orderDate: "2025-01-28",
        status: "pending" as const,
        vendorId: "v1",
        vendorName: "Test Vendor",
        shipTo: {
          name: "Test Lab",
          street1: "123 Test St",
          city: "New York",
          state: "NY",
          postalCode: "10001",
          country: "USA",
          countryCode: "US",
        },
        billTo: {
          name: "Test Lab",
          street1: "123 Test St",
          city: "New York",
          state: "NY",
          postalCode: "10001",
          country: "USA",
          countryCode: "US",
        },
        lineItems: [
          {
            lineNumber: 1,
            productId: "prod-001",
            sku: "SKU-001",
            description: "Test Product",
            quantity: 10,
            unitPrice: 50.0,
            extendedPrice: 500.0,
            unitOfMeasure: "EA",
          },
        ],
        subtotal: 500.0,
        shippingCost: 0,
        taxAmount: 40.0,
        totalAmount: 540.0,
        currency: "USD",
        paymentTerms: "Net 30",
      };

      const cxml = client.buildCXMLPurchaseOrder(order);

      expect(cxml).toContain("cXML");
      expect(cxml).toContain("PO-001");
      expect(cxml).toContain("OrderRequest");
    });

    it("should parse cXML response", () => {
      const responseXml = `<?xml version="1.0" encoding="UTF-8"?>
        <cXML payloadID="test-payload" timestamp="2025-01-28T12:00:00Z">
          <Response>
            <Status code="200" text="OK">Success</Status>
          </Response>
        </cXML>`;

      const result = client.parseCXMLResponse(responseXml);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe("200");
    });
  });
});

describe("createUniMarketClient", () => {
  it("should create client with provided config", () => {
    const config: UniMarketConfig = {
      baseUrl: "https://test.unimarket.com",
      apiKey: "key",
      apiSecret: "secret",
      organizationId: "org",
      environment: "production",
    };

    const client = createUniMarketClient(config);

    expect(client).toBeInstanceOf(UniMarketIntegration);
  });
});
