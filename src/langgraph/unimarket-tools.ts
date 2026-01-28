/**
 * UniMarket Tools for LangGraph Agents
 *
 * Provides tool definitions for AI agents to interact with UniMarket marketplace.
 * These tools are used by the LangGraph agents for procurement operations.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  createUniMarketClient,
  UniMarketConfig,
  UniMarketIntegration,
} from "../integrations/unimarket";

// Get UniMarket client from environment
function getUniMarketClient(): UniMarketIntegration {
  const config: UniMarketConfig = {
    baseUrl: process.env.UNIMARKET_BASE_URL || "https://api.unimarket.com/v2",
    apiKey: process.env.UNIMARKET_API_KEY || "",
    apiSecret: process.env.UNIMARKET_API_SECRET || "",
    organizationId: process.env.UNIMARKET_ORG_ID || "",
    environment: (process.env.UNIMARKET_ENV as "sandbox" | "production") || "production",
    webhookSecret: process.env.UNIMARKET_WEBHOOK_SECRET,
    timeout: parseInt(process.env.UNIMARKET_TIMEOUT || "30000"),
  };
  return createUniMarketClient(config);
}

// ============================================
// Product Catalog Tools
// ============================================

export const unimarketSearchProductsTool = tool(
  async (input: {
    query: string;
    category?: string;
    vendor?: string;
    priceMin?: number;
    priceMax?: number;
    inStockOnly?: boolean;
    limit?: number;
  }) => {
    const client = getUniMarketClient();
    const result = await client.searchProducts(input.query, {
      category: input.category,
      vendor: input.vendor,
      priceMin: input.priceMin,
      priceMax: input.priceMax,
      inStockOnly: input.inStockOnly,
      pageSize: input.limit || 20,
    });

    if (!result.success) {
      return JSON.stringify({ error: result.error, products: [] });
    }

    return JSON.stringify({
      query: input.query,
      products: result.data,
      total: result.meta?.pagination?.totalItems || (result.data as any[])?.length || 0,
    });
  },
  {
    name: "unimarket_search_products",
    description: "Search for products in the UniMarket catalog. Returns matching products with pricing and availability.",
    schema: z.object({
      query: z.string().describe("Search query (product name, SKU, manufacturer)"),
      category: z.string().optional().describe("Filter by product category"),
      vendor: z.string().optional().describe("Filter by specific vendor"),
      priceMin: z.number().optional().describe("Minimum price filter"),
      priceMax: z.number().optional().describe("Maximum price filter"),
      inStockOnly: z.boolean().optional().describe("Only return in-stock items"),
      limit: z.number().optional().describe("Maximum number of results"),
    }),
  }
);

export const unimarketGetProductTool = tool(
  async (input: { productId: string }) => {
    const client = getUniMarketClient();
    const result = await client.getProduct(input.productId);

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ product: result.data });
  },
  {
    name: "unimarket_get_product",
    description: "Get detailed information about a specific product from UniMarket",
    schema: z.object({
      productId: z.string().describe("UniMarket product ID"),
    }),
  }
);

export const unimarketGetProductPricingTool = tool(
  async (input: { productId: string; quantity?: number }) => {
    const client = getUniMarketClient();
    const result = await client.getProductPricing(input.productId, input.quantity);

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ pricing: result.data });
  },
  {
    name: "unimarket_get_product_pricing",
    description: "Get pricing information for a product including volume discounts and contract pricing",
    schema: z.object({
      productId: z.string().describe("UniMarket product ID"),
      quantity: z.number().optional().describe("Quantity to calculate volume discount"),
    }),
  }
);

export const unimarketComparePricesTool = tool(
  async (input: { productId: string }) => {
    const client = getUniMarketClient();
    const result = await client.compareProductPrices(input.productId);

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ priceComparison: result.data });
  },
  {
    name: "unimarket_compare_prices",
    description: "Compare prices for a product across all available vendors in UniMarket",
    schema: z.object({
      productId: z.string().describe("UniMarket product ID to compare"),
    }),
  }
);

// ============================================
// Shopping Cart Tools
// ============================================

export const unimarketCreateCartTool = tool(
  async (input: { userId: string }) => {
    const client = getUniMarketClient();
    const result = await client.createCart(input.userId);

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ cart: result.data });
  },
  {
    name: "unimarket_create_cart",
    description: "Create a new shopping cart in UniMarket for a user",
    schema: z.object({
      userId: z.string().describe("ID of the user creating the cart"),
    }),
  }
);

export const unimarketAddToCartTool = tool(
  async (input: {
    cartId: string;
    productId: string;
    sku: string;
    quantity: number;
    notes?: string;
  }) => {
    const client = getUniMarketClient();
    const result = await client.addToCart(input.cartId, {
      productId: input.productId,
      sku: input.sku,
      quantity: input.quantity,
      notes: input.notes,
    });

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ cart: result.data });
  },
  {
    name: "unimarket_add_to_cart",
    description: "Add an item to a UniMarket shopping cart",
    schema: z.object({
      cartId: z.string().describe("Cart ID"),
      productId: z.string().describe("UniMarket product ID"),
      sku: z.string().describe("Product SKU"),
      quantity: z.number().describe("Quantity to add"),
      notes: z.string().optional().describe("Optional notes for the line item"),
    }),
  }
);

export const unimarketGetCartTool = tool(
  async (input: { cartId: string }) => {
    const client = getUniMarketClient();
    const result = await client.getCart(input.cartId);

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ cart: result.data });
  },
  {
    name: "unimarket_get_cart",
    description: "Get details of a UniMarket shopping cart",
    schema: z.object({
      cartId: z.string().describe("Cart ID"),
    }),
  }
);

export const unimarketSubmitCartTool = tool(
  async (input: {
    cartId: string;
    shipToName: string;
    shipToStreet: string;
    shipToCity: string;
    shipToState: string;
    shipToPostalCode: string;
    shipToCountry: string;
    budgetCode: string;
    glCode?: string;
    grantNumber?: string;
    urgency?: string;
    neededByDate?: string;
    specialInstructions?: string;
  }) => {
    const client = getUniMarketClient();
    const result = await client.submitCart(input.cartId, {
      shipTo: {
        name: input.shipToName,
        street1: input.shipToStreet,
        city: input.shipToCity,
        state: input.shipToState,
        postalCode: input.shipToPostalCode,
        country: input.shipToCountry,
        countryCode: "US",
      },
      billTo: {
        name: input.shipToName,
        street1: input.shipToStreet,
        city: input.shipToCity,
        state: input.shipToState,
        postalCode: input.shipToPostalCode,
        country: input.shipToCountry,
        countryCode: "US",
      },
      budgetCode: input.budgetCode,
      glCode: input.glCode,
      grantNumber: input.grantNumber,
      urgency: input.urgency as "standard" | "rush" | "emergency",
      neededByDate: input.neededByDate,
      specialInstructions: input.specialInstructions,
    });

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ order: result.data });
  },
  {
    name: "unimarket_submit_cart",
    description: "Submit a UniMarket cart to create a requisition/order",
    schema: z.object({
      cartId: z.string().describe("Cart ID to submit"),
      shipToName: z.string().describe("Shipping address name"),
      shipToStreet: z.string().describe("Shipping street address"),
      shipToCity: z.string().describe("Shipping city"),
      shipToState: z.string().describe("Shipping state"),
      shipToPostalCode: z.string().describe("Shipping postal code"),
      shipToCountry: z.string().describe("Shipping country"),
      budgetCode: z.string().describe("Budget code for the order"),
      glCode: z.string().optional().describe("GL account code"),
      grantNumber: z.string().optional().describe("Grant number if applicable"),
      urgency: z.enum(["standard", "rush", "emergency"]).optional().describe("Order urgency"),
      neededByDate: z.string().optional().describe("Date when items are needed (YYYY-MM-DD)"),
      specialInstructions: z.string().optional().describe("Delivery instructions"),
    }),
  }
);

// ============================================
// Purchase Order Tools
// ============================================

export const unimarketGetPurchaseOrderTool = tool(
  async (input: { poNumber: string }) => {
    const client = getUniMarketClient();
    const result = await client.getPurchaseOrder(input.poNumber);

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ purchaseOrder: result.data });
  },
  {
    name: "unimarket_get_purchase_order",
    description: "Get details of a purchase order from UniMarket",
    schema: z.object({
      poNumber: z.string().describe("Purchase order number"),
    }),
  }
);

export const unimarketListPurchaseOrdersTool = tool(
  async (input: {
    status?: string;
    vendorId?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }) => {
    const client = getUniMarketClient();
    const result = await client.getPurchaseOrders({
      status: input.status,
      vendorId: input.vendorId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      pageSize: input.limit || 50,
    });

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ purchaseOrders: result.data });
  },
  {
    name: "unimarket_list_purchase_orders",
    description: "List purchase orders from UniMarket with optional filters",
    schema: z.object({
      status: z.enum(["pending", "confirmed", "shipped", "delivered", "cancelled"]).optional().describe("Filter by status"),
      vendorId: z.string().optional().describe("Filter by vendor"),
      fromDate: z.string().optional().describe("Filter orders from this date (YYYY-MM-DD)"),
      toDate: z.string().optional().describe("Filter orders until this date (YYYY-MM-DD)"),
      limit: z.number().optional().describe("Maximum number of results"),
    }),
  }
);

export const unimarketTrackOrderTool = tool(
  async (input: { poNumber: string }) => {
    const client = getUniMarketClient();
    const result = await client.getOrderTracking(input.poNumber);

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ tracking: result.data });
  },
  {
    name: "unimarket_track_order",
    description: "Get tracking information for a UniMarket order",
    schema: z.object({
      poNumber: z.string().describe("Purchase order number"),
    }),
  }
);

export const unimarketCancelOrderTool = tool(
  async (input: { poNumber: string; reason: string }) => {
    const client = getUniMarketClient();
    const result = await client.cancelPurchaseOrder(input.poNumber, input.reason);

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ cancelledOrder: result.data });
  },
  {
    name: "unimarket_cancel_order",
    description: "Cancel a purchase order in UniMarket",
    schema: z.object({
      poNumber: z.string().describe("Purchase order number"),
      reason: z.string().describe("Reason for cancellation"),
    }),
  }
);

// ============================================
// Invoice Tools
// ============================================

export const unimarketGetInvoiceTool = tool(
  async (input: { invoiceNumber: string }) => {
    const client = getUniMarketClient();
    const result = await client.getInvoice(input.invoiceNumber);

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ invoice: result.data });
  },
  {
    name: "unimarket_get_invoice",
    description: "Get details of an invoice from UniMarket",
    schema: z.object({
      invoiceNumber: z.string().describe("Invoice number"),
    }),
  }
);

export const unimarketListInvoicesTool = tool(
  async (input: {
    status?: string;
    vendorId?: string;
    poNumber?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }) => {
    const client = getUniMarketClient();
    const result = await client.getInvoices({
      status: input.status,
      vendorId: input.vendorId,
      poNumber: input.poNumber,
      fromDate: input.fromDate,
      toDate: input.toDate,
      pageSize: input.limit || 50,
    });

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ invoices: result.data });
  },
  {
    name: "unimarket_list_invoices",
    description: "List invoices from UniMarket with optional filters",
    schema: z.object({
      status: z.enum(["pending", "matched", "exception", "approved", "paid", "disputed"]).optional().describe("Filter by status"),
      vendorId: z.string().optional().describe("Filter by vendor"),
      poNumber: z.string().optional().describe("Filter by PO number"),
      fromDate: z.string().optional().describe("Filter invoices from this date"),
      toDate: z.string().optional().describe("Filter invoices until this date"),
      limit: z.number().optional().describe("Maximum number of results"),
    }),
  }
);

export const unimarketMatchInvoiceTool = tool(
  async (input: { invoiceNumber: string }) => {
    const client = getUniMarketClient();
    const result = await client.matchInvoice(input.invoiceNumber);

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ matchResult: result.data });
  },
  {
    name: "unimarket_match_invoice",
    description: "Match a UniMarket invoice against PO and receipts (three-way match)",
    schema: z.object({
      invoiceNumber: z.string().describe("Invoice number to match"),
    }),
  }
);

export const unimarketApproveInvoiceTool = tool(
  async (input: { invoiceNumber: string; approverId: string; notes?: string }) => {
    const client = getUniMarketClient();
    const result = await client.approveInvoice(input.invoiceNumber, input.approverId, input.notes);

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ approvedInvoice: result.data });
  },
  {
    name: "unimarket_approve_invoice",
    description: "Approve a UniMarket invoice for payment",
    schema: z.object({
      invoiceNumber: z.string().describe("Invoice number"),
      approverId: z.string().describe("ID of the approver"),
      notes: z.string().optional().describe("Approval notes"),
    }),
  }
);

// ============================================
// Vendor Tools
// ============================================

export const unimarketListVendorsTool = tool(
  async (input: {
    category?: string;
    diversityStatus?: string[];
    certifications?: string[];
    limit?: number;
  }) => {
    const client = getUniMarketClient();
    const result = await client.getVendors({
      category: input.category,
      diversityStatus: input.diversityStatus,
      certifications: input.certifications,
      pageSize: input.limit || 50,
    });

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ vendors: result.data });
  },
  {
    name: "unimarket_list_vendors",
    description: "List vendors from UniMarket with optional filters",
    schema: z.object({
      category: z.string().optional().describe("Filter by product category"),
      diversityStatus: z.array(z.string()).optional().describe("Filter by diversity certifications (MWBE, WBE, MBE, SBE, etc.)"),
      certifications: z.array(z.string()).optional().describe("Filter by vendor certifications"),
      limit: z.number().optional().describe("Maximum number of results"),
    }),
  }
);

export const unimarketGetVendorTool = tool(
  async (input: { vendorId: string }) => {
    const client = getUniMarketClient();
    const result = await client.getVendor(input.vendorId);

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ vendor: result.data });
  },
  {
    name: "unimarket_get_vendor",
    description: "Get detailed information about a UniMarket vendor",
    schema: z.object({
      vendorId: z.string().describe("Vendor ID"),
    }),
  }
);

export const unimarketGetVendorPerformanceTool = tool(
  async (input: { vendorId: string }) => {
    const client = getUniMarketClient();
    const result = await client.getVendorPerformance(input.vendorId);

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ performance: result.data });
  },
  {
    name: "unimarket_get_vendor_performance",
    description: "Get performance metrics for a UniMarket vendor",
    schema: z.object({
      vendorId: z.string().describe("Vendor ID"),
    }),
  }
);

// ============================================
// Inventory Tools
// ============================================

export const unimarketCheckInventoryTool = tool(
  async (input: { items: Array<{ productId: string; sku: string; quantity: number }> }) => {
    const client = getUniMarketClient();
    const result = await client.checkInventory(input.items);

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ availability: result.data });
  },
  {
    name: "unimarket_check_inventory",
    description: "Check inventory availability for multiple items in UniMarket",
    schema: z.object({
      items: z.array(z.object({
        productId: z.string().describe("Product ID"),
        sku: z.string().describe("Product SKU"),
        quantity: z.number().describe("Quantity needed"),
      })).describe("Items to check"),
    }),
  }
);

// ============================================
// Contract Tools
// ============================================

export const unimarketListContractsTool = tool(
  async (input: {
    vendorId?: string;
    status?: string;
    expiringWithinDays?: number;
  }) => {
    const client = getUniMarketClient();
    const result = await client.getContracts({
      vendorId: input.vendorId,
      status: input.status as "active" | "expired" | "pending",
      expiringWithinDays: input.expiringWithinDays,
    });

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ contracts: result.data });
  },
  {
    name: "unimarket_list_contracts",
    description: "List contracts from UniMarket with optional filters",
    schema: z.object({
      vendorId: z.string().optional().describe("Filter by vendor"),
      status: z.enum(["active", "expired", "pending"]).optional().describe("Filter by status"),
      expiringWithinDays: z.number().optional().describe("Filter contracts expiring within N days"),
    }),
  }
);

export const unimarketGetContractPriceTool = tool(
  async (input: { productId: string; vendorId: string; quantity?: number }) => {
    const client = getUniMarketClient();
    const result = await client.getContractPrice(input.productId, input.vendorId, input.quantity);

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ contractPrice: result.data });
  },
  {
    name: "unimarket_get_contract_price",
    description: "Get contract price for a product from a specific vendor in UniMarket",
    schema: z.object({
      productId: z.string().describe("Product ID"),
      vendorId: z.string().describe("Vendor ID"),
      quantity: z.number().optional().describe("Quantity for volume pricing"),
    }),
  }
);

// ============================================
// Report Tools
// ============================================

export const unimarketGetSpendReportTool = tool(
  async (input: { fromDate: string; toDate: string; groupBy?: string }) => {
    const client = getUniMarketClient();
    const result = await client.getSpendReport({
      fromDate: input.fromDate,
      toDate: input.toDate,
      groupBy: input.groupBy as "vendor" | "category" | "department" | "month",
    });

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ spendReport: result.data });
  },
  {
    name: "unimarket_get_spend_report",
    description: "Get spend analytics report from UniMarket",
    schema: z.object({
      fromDate: z.string().describe("Start date (YYYY-MM-DD)"),
      toDate: z.string().describe("End date (YYYY-MM-DD)"),
      groupBy: z.enum(["vendor", "category", "department", "month"]).optional().describe("Group results by dimension"),
    }),
  }
);

export const unimarketGetSavingsReportTool = tool(
  async (input: { fromDate: string; toDate: string }) => {
    const client = getUniMarketClient();
    const result = await client.getSavingsReport({ fromDate: input.fromDate, toDate: input.toDate });

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ savingsReport: result.data });
  },
  {
    name: "unimarket_get_savings_report",
    description: "Get savings report from UniMarket purchases",
    schema: z.object({
      fromDate: z.string().describe("Start date (YYYY-MM-DD)"),
      toDate: z.string().describe("End date (YYYY-MM-DD)"),
    }),
  }
);

// ============================================
// PunchOut Tools
// ============================================

export const unimarketInitiatePunchoutTool = tool(
  async (input: { vendorId: string; userId: string; returnUrl: string }) => {
    const client = getUniMarketClient();
    const result = await client.initiatePunchOut(input.vendorId, input.userId, input.returnUrl);

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ punchoutSession: result.data });
  },
  {
    name: "unimarket_initiate_punchout",
    description: "Initiate a PunchOut session with a vendor in UniMarket",
    schema: z.object({
      vendorId: z.string().describe("Vendor ID to PunchOut to"),
      userId: z.string().describe("User initiating the session"),
      returnUrl: z.string().describe("URL to return to after PunchOut"),
    }),
  }
);

// ============================================
// Catalog Sync Tools
// ============================================

export const unimarketSyncCatalogTool = tool(
  async (input: { vendorId?: string; fullSync?: boolean }) => {
    const client = getUniMarketClient();
    const result = await client.syncCatalog(input.vendorId, { fullSync: input.fullSync });

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ syncJob: result.data });
  },
  {
    name: "unimarket_sync_catalog",
    description: "Trigger a catalog sync with UniMarket",
    schema: z.object({
      vendorId: z.string().optional().describe("Specific vendor to sync"),
      fullSync: z.boolean().optional().describe("Perform full sync instead of incremental"),
    }),
  }
);

export const unimarketGetSyncStatusTool = tool(
  async (input: { syncId: string }) => {
    const client = getUniMarketClient();
    const result = await client.getCatalogSyncStatus(input.syncId);

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ syncStatus: result.data });
  },
  {
    name: "unimarket_get_sync_status",
    description: "Get status of a UniMarket catalog sync job",
    schema: z.object({
      syncId: z.string().describe("Sync job ID"),
    }),
  }
);

// ============================================
// Export All Tools
// ============================================

export const UNIMARKET_TOOLS = [
  // Product Catalog
  unimarketSearchProductsTool,
  unimarketGetProductTool,
  unimarketGetProductPricingTool,
  unimarketComparePricesTool,
  // Shopping Cart
  unimarketCreateCartTool,
  unimarketAddToCartTool,
  unimarketGetCartTool,
  unimarketSubmitCartTool,
  // Purchase Orders
  unimarketGetPurchaseOrderTool,
  unimarketListPurchaseOrdersTool,
  unimarketTrackOrderTool,
  unimarketCancelOrderTool,
  // Invoices
  unimarketGetInvoiceTool,
  unimarketListInvoicesTool,
  unimarketMatchInvoiceTool,
  unimarketApproveInvoiceTool,
  // Vendors
  unimarketListVendorsTool,
  unimarketGetVendorTool,
  unimarketGetVendorPerformanceTool,
  // Inventory
  unimarketCheckInventoryTool,
  // Contracts
  unimarketListContractsTool,
  unimarketGetContractPriceTool,
  // Reports
  unimarketGetSpendReportTool,
  unimarketGetSavingsReportTool,
  // PunchOut
  unimarketInitiatePunchoutTool,
  // Catalog Sync
  unimarketSyncCatalogTool,
  unimarketGetSyncStatusTool,
];

// Export categorized tool sets for specific agents
export const UNIMARKET_PRICE_TOOLS = [
  unimarketSearchProductsTool,
  unimarketGetProductTool,
  unimarketGetProductPricingTool,
  unimarketComparePricesTool,
  unimarketGetContractPriceTool,
];

export const UNIMARKET_ORDER_TOOLS = [
  unimarketCreateCartTool,
  unimarketAddToCartTool,
  unimarketGetCartTool,
  unimarketSubmitCartTool,
  unimarketGetPurchaseOrderTool,
  unimarketListPurchaseOrdersTool,
  unimarketTrackOrderTool,
  unimarketCancelOrderTool,
];

export const UNIMARKET_INVOICE_TOOLS = [
  unimarketGetInvoiceTool,
  unimarketListInvoicesTool,
  unimarketMatchInvoiceTool,
  unimarketApproveInvoiceTool,
];

export const UNIMARKET_VENDOR_TOOLS = [
  unimarketListVendorsTool,
  unimarketGetVendorTool,
  unimarketGetVendorPerformanceTool,
];

export const UNIMARKET_ANALYTICS_TOOLS = [
  unimarketGetSpendReportTool,
  unimarketGetSavingsReportTool,
];

export default UNIMARKET_TOOLS;
