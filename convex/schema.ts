import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Comprehensive schema for University Procurement AI Platform
export default defineSchema({
  // ============================================
  // CORE ENTITIES
  // ============================================

  // Universities/Organizations
  universities: defineTable({
    name: v.string(),
    type: v.union(
      v.literal("R1"),
      v.literal("R2"),
      v.literal("liberal_arts"),
      v.literal("community")
    ),
    region: v.string(),
    annualSpend: v.number(),
    settings: v.object({
      diversityTarget: v.number(),
      sustainabilityTarget: v.number(),
      autoApprovalLimit: v.number(),
      timezone: v.string(),
    }),
    subscription: v.object({
      plan: v.union(
        v.literal("flat"),
        v.literal("performance"),
        v.literal("hybrid"),
        v.literal("trial")
      ),
      monthlyFee: v.number(),
      savingsSharePercent: v.number(),
      startDate: v.number(),
      endDate: v.optional(v.number()),
      cap: v.optional(v.number()),
    }),
    integrations: v.object({
      procurementSystem: v.optional(v.string()),
      erpSystem: v.optional(v.string()),
      slackWorkspace: v.optional(v.string()),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_type", ["type"])
    .index("by_region", ["region"]),

  // Users
  users: defineTable({
    universityId: v.id("universities"),
    email: v.string(),
    name: v.string(),
    role: v.union(
      v.literal("admin"),
      v.literal("procurement_manager"),
      v.literal("approver"),
      v.literal("requester"),
      v.literal("viewer")
    ),
    department: v.string(),
    approvalLimit: v.number(),
    delegateTo: v.optional(v.id("users")),
    delegateUntil: v.optional(v.number()),
    preferences: v.object({
      notifications: v.object({
        email: v.boolean(),
        slack: v.boolean(),
        priceAlerts: v.boolean(),
        approvalReminders: v.boolean(),
      }),
      defaultBudgetCode: v.optional(v.string()),
    }),
    lastActiveAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_university", ["universityId"])
    .index("by_email", ["email"])
    .index("by_department", ["universityId", "department"]),

  // ============================================
  // PRODUCT & CATALOG
  // ============================================

  // Canonical Products (unified across vendors)
  products: defineTable({
    canonicalId: v.string(), // UUID
    name: v.string(),
    normalizedName: v.string(), // Lowercase, cleaned for matching
    description: v.string(),
    categoryPath: v.array(v.string()), // ["Lab Supplies", "Plasticware", "Tubes"]
    unspscCode: v.optional(v.string()),
    manufacturer: v.string(),
    manufacturerPartNumber: v.string(),
    specifications: v.any(), // Flexible specs object
    equivalentProducts: v.array(v.string()), // Other canonical IDs
    substituteProducts: v.array(v.string()),
    compliance: v.object({
      diversityCertified: v.boolean(),
      sustainabilityRating: v.optional(v.string()),
      grantEligible: v.boolean(),
      hazardClass: v.optional(v.string()),
      exportControlled: v.boolean(),
    }),
    metadata: v.object({
      lastUpdated: v.number(),
      dataSource: v.string(),
      matchConfidence: v.number(),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_canonical_id", ["canonicalId"])
    .index("by_manufacturer", ["manufacturer", "manufacturerPartNumber"])
    .index("by_category", ["categoryPath"])
    .index("by_normalized_name", ["normalizedName"])
    .searchIndex("search_products", {
      searchField: "name",
      filterFields: ["manufacturer", "categoryPath"],
    }),

  // Vendor Product Listings
  vendorListings: defineTable({
    productId: v.id("products"),
    vendorId: v.id("vendors"),
    vendorSku: v.string(),
    vendorProductName: v.string(),
    price: v.number(),
    currency: v.string(),
    unitOfMeasure: v.string(),
    packSize: v.number(),
    pricePerUnit: v.number(),
    availability: v.union(
      v.literal("in_stock"),
      v.literal("limited"),
      v.literal("backorder"),
      v.literal("discontinued")
    ),
    leadTimeDays: v.number(),
    minimumOrderQty: v.number(),
    volumeDiscounts: v.array(
      v.object({
        minQty: v.number(),
        price: v.number(),
        discountPercent: v.number(),
      })
    ),
    catalogUrl: v.optional(v.string()),
    lastSyncedAt: v.number(),
    priceHistory: v.array(
      v.object({
        price: v.number(),
        date: v.number(),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_product", ["productId"])
    .index("by_vendor", ["vendorId"])
    .index("by_vendor_sku", ["vendorId", "vendorSku"])
    .index("by_price", ["productId", "pricePerUnit"]),

  // ============================================
  // VENDORS
  // ============================================

  vendors: defineTable({
    name: v.string(),
    code: v.string(), // Short code like "FISHER", "VWR"
    type: v.union(
      v.literal("distributor"),
      v.literal("manufacturer"),
      v.literal("reseller")
    ),
    categories: v.array(v.string()),
    diversityStatus: v.array(
      v.union(
        v.literal("MWBE"),
        v.literal("WBE"),
        v.literal("MBE"),
        v.literal("SBE"),
        v.literal("SDVOSB"),
        v.literal("HUBZone"),
        v.literal("LGBT")
      )
    ),
    certifications: v.array(v.string()),
    sustainability: v.object({
      rating: v.optional(v.string()),
      certifications: v.array(v.string()),
    }),
    contact: v.object({
      email: v.string(),
      phone: v.optional(v.string()),
      accountRep: v.optional(v.string()),
      address: v.optional(v.string()),
    }),
    integration: v.object({
      type: v.union(
        v.literal("api"),
        v.literal("cxml"),
        v.literal("edi"),
        v.literal("manual")
      ),
      endpoint: v.optional(v.string()),
      credentials: v.optional(v.string()), // Encrypted reference
      lastSyncAt: v.optional(v.number()),
      syncStatus: v.union(
        v.literal("active"),
        v.literal("error"),
        v.literal("pending")
      ),
    }),
    performance: v.object({
      overallScore: v.number(),
      priceScore: v.number(),
      qualityScore: v.number(),
      deliveryScore: v.number(),
      serviceScore: v.number(),
      complianceScore: v.number(),
      onTimeRate: v.number(),
      defectRate: v.number(),
      invoiceAccuracy: v.number(),
    }),
    riskScore: v.number(),
    riskFactors: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_type", ["type"])
    .index("by_diversity", ["diversityStatus"])
    .index("by_performance", ["performance.overallScore"]),

  // ============================================
  // CONTRACTS
  // ============================================

  contracts: defineTable({
    universityId: v.id("universities"),
    vendorId: v.id("vendors"),
    contractNumber: v.string(),
    name: v.string(),
    type: v.union(
      v.literal("master"),
      v.literal("blanket"),
      v.literal("spot"),
      v.literal("consortium")
    ),
    status: v.union(
      v.literal("active"),
      v.literal("expired"),
      v.literal("pending"),
      v.literal("terminated")
    ),
    startDate: v.number(),
    endDate: v.number(),
    autoRenewal: v.boolean(),
    renewalNoticeDays: v.number(),
    terms: v.object({
      paymentTerms: v.string(), // "Net 30", "2/10 Net 30"
      shippingTerms: v.string(),
      minimumOrder: v.optional(v.number()),
      volumeCommitment: v.optional(v.number()),
    }),
    pricing: v.object({
      discountType: v.union(
        v.literal("percent_off_list"),
        v.literal("fixed_price"),
        v.literal("tiered"),
        v.literal("cost_plus")
      ),
      baseDiscount: v.number(),
      tiers: v.array(
        v.object({
          minSpend: v.number(),
          discountPercent: v.number(),
        })
      ),
      categoryDiscounts: v.array(
        v.object({
          category: v.string(),
          discountPercent: v.number(),
        })
      ),
    }),
    documents: v.array(
      v.object({
        name: v.string(),
        type: v.string(),
        storageId: v.optional(v.id("_storage")),
        url: v.optional(v.string()),
      })
    ),
    riskFlags: v.array(v.string()),
    riskScore: v.number(),
    extractedClauses: v.any(), // NLU-extracted contract intelligence
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_university", ["universityId"])
    .index("by_vendor", ["vendorId"])
    .index("by_status", ["status"])
    .index("by_end_date", ["endDate"])
    .index("by_contract_number", ["contractNumber"]),

  // Contract Line Items (specific product pricing)
  contractLineItems: defineTable({
    contractId: v.id("contracts"),
    productId: v.optional(v.id("products")),
    vendorSku: v.string(),
    description: v.string(),
    category: v.optional(v.string()),
    unitPrice: v.number(),
    unitOfMeasure: v.string(),
    minimumQty: v.optional(v.number()),
    maximumQty: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_contract", ["contractId"])
    .index("by_product", ["productId"])
    .index("by_sku", ["vendorSku"]),

  // ============================================
  // PROCUREMENT WORKFLOW
  // ============================================

  // Requisitions
  requisitions: defineTable({
    universityId: v.id("universities"),
    requesterId: v.id("users"),
    requisitionNumber: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("pending_approval"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("ordered"),
      v.literal("cancelled")
    ),
    urgency: v.union(
      v.literal("standard"),
      v.literal("rush"),
      v.literal("emergency")
    ),
    neededByDate: v.optional(v.number()),
    department: v.string(),
    budgetCode: v.string(),
    grantNumber: v.optional(v.string()),
    justification: v.optional(v.string()),
    subtotal: v.number(),
    shippingCost: v.number(),
    taxAmount: v.number(),
    totalAmount: v.number(),
    sourceChannel: v.union(
      v.literal("web"),
      v.literal("email"),
      v.literal("slack"),
      v.literal("api")
    ),
    originalRequest: v.optional(v.string()), // Original natural language
    aiProcessingNotes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    submittedAt: v.optional(v.number()),
    approvedAt: v.optional(v.number()),
  })
    .index("by_university", ["universityId"])
    .index("by_requester", ["requesterId"])
    .index("by_status", ["status"])
    .index("by_number", ["requisitionNumber"])
    .index("by_department", ["universityId", "department"]),

  // Requisition Line Items
  requisitionLineItems: defineTable({
    requisitionId: v.id("requisitions"),
    lineNumber: v.number(),
    productId: v.optional(v.id("products")),
    vendorListingId: v.optional(v.id("vendorListings")),
    description: v.string(),
    quantity: v.number(),
    unitPrice: v.number(),
    extendedPrice: v.number(),
    vendorId: v.optional(v.id("vendors")),
    vendorSku: v.optional(v.string()),
    alternativesAvailable: v.boolean(),
    aiSuggestions: v.optional(
      v.object({
        betterPriceVendor: v.optional(v.string()),
        betterPriceAmount: v.optional(v.number()),
        diverseAlternative: v.optional(v.string()),
      })
    ),
    createdAt: v.number(),
  })
    .index("by_requisition", ["requisitionId"])
    .index("by_product", ["productId"]),

  // Approvals
  approvals: defineTable({
    requisitionId: v.id("requisitions"),
    approverId: v.id("users"),
    step: v.number(),
    approverRole: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("delegated"),
      v.literal("skipped")
    ),
    delegatedTo: v.optional(v.id("users")),
    comments: v.optional(v.string()),
    actionAt: v.optional(v.number()),
    dueAt: v.number(),
    remindersSent: v.number(),
    escalatedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_requisition", ["requisitionId"])
    .index("by_approver", ["approverId", "status"])
    .index("by_due", ["status", "dueAt"]),

  // Purchase Orders
  purchaseOrders: defineTable({
    universityId: v.id("universities"),
    requisitionId: v.optional(v.id("requisitions")),
    vendorId: v.id("vendors"),
    poNumber: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("acknowledged"),
      v.literal("partially_received"),
      v.literal("received"),
      v.literal("closed"),
      v.literal("cancelled")
    ),
    orderDate: v.number(),
    expectedDeliveryDate: v.optional(v.number()),
    shippingAddress: v.object({
      name: v.string(),
      line1: v.string(),
      line2: v.optional(v.string()),
      city: v.string(),
      state: v.string(),
      postalCode: v.string(),
      country: v.string(),
    }),
    billingAddress: v.object({
      name: v.string(),
      line1: v.string(),
      line2: v.optional(v.string()),
      city: v.string(),
      state: v.string(),
      postalCode: v.string(),
      country: v.string(),
    }),
    subtotal: v.number(),
    shippingCost: v.number(),
    taxAmount: v.number(),
    totalAmount: v.number(),
    paymentTerms: v.string(),
    transmissionMethod: v.union(
      v.literal("email"),
      v.literal("cxml"),
      v.literal("edi"),
      v.literal("portal")
    ),
    transmissionStatus: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("confirmed"),
      v.literal("error")
    ),
    vendorOrderNumber: v.optional(v.string()),
    specialInstructions: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_university", ["universityId"])
    .index("by_vendor", ["vendorId"])
    .index("by_status", ["status"])
    .index("by_po_number", ["poNumber"])
    .index("by_order_date", ["orderDate"]),

  // PO Line Items
  poLineItems: defineTable({
    purchaseOrderId: v.id("purchaseOrders"),
    lineNumber: v.number(),
    productId: v.optional(v.id("products")),
    vendorSku: v.string(),
    description: v.string(),
    quantity: v.number(),
    unitPrice: v.number(),
    extendedPrice: v.number(),
    quantityReceived: v.number(),
    glCode: v.string(),
    budgetCode: v.string(),
    grantNumber: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_po", ["purchaseOrderId"])
    .index("by_product", ["productId"]),

  // ============================================
  // INVOICING & PAYMENTS
  // ============================================

  invoices: defineTable({
    universityId: v.id("universities"),
    vendorId: v.id("vendors"),
    purchaseOrderId: v.optional(v.id("purchaseOrders")),
    invoiceNumber: v.string(),
    vendorInvoiceNumber: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("matched"),
      v.literal("exception"),
      v.literal("approved"),
      v.literal("paid"),
      v.literal("disputed")
    ),
    invoiceDate: v.number(),
    dueDate: v.number(),
    receivedDate: v.number(),
    subtotal: v.number(),
    taxAmount: v.number(),
    shippingAmount: v.number(),
    totalAmount: v.number(),
    validatedTotal: v.optional(v.number()),
    discrepancyAmount: v.optional(v.number()),
    matchStatus: v.union(
      v.literal("pending"),
      v.literal("matched"),
      v.literal("partial_match"),
      v.literal("no_match"),
      v.literal("exception")
    ),
    matchDetails: v.optional(
      v.object({
        poMatched: v.boolean(),
        receiptMatched: v.boolean(),
        priceMatched: v.boolean(),
        quantityMatched: v.boolean(),
        exceptions: v.array(v.string()),
      })
    ),
    paymentDate: v.optional(v.number()),
    paymentReference: v.optional(v.string()),
    earlyPayDiscount: v.optional(
      v.object({
        discountPercent: v.number(),
        discountAmount: v.number(),
        deadlineDate: v.number(),
        captured: v.boolean(),
      })
    ),
    documentStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_university", ["universityId"])
    .index("by_vendor", ["vendorId"])
    .index("by_po", ["purchaseOrderId"])
    .index("by_status", ["status"])
    .index("by_due_date", ["dueDate"]),

  // Invoice Line Items
  invoiceLineItems: defineTable({
    invoiceId: v.id("invoices"),
    lineNumber: v.number(),
    poLineItemId: v.optional(v.id("poLineItems")),
    vendorSku: v.string(),
    description: v.string(),
    quantity: v.number(),
    unitPrice: v.number(),
    extendedPrice: v.number(),
    matchStatus: v.union(
      v.literal("matched"),
      v.literal("price_variance"),
      v.literal("quantity_variance"),
      v.literal("not_on_po"),
      v.literal("pending")
    ),
    contractPrice: v.optional(v.number()),
    priceVariance: v.optional(v.number()),
    priceVariancePercent: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_invoice", ["invoiceId"])
    .index("by_po_line", ["poLineItemId"]),

  // Receipts/Deliveries
  receipts: defineTable({
    universityId: v.id("universities"),
    purchaseOrderId: v.id("purchaseOrders"),
    receiptNumber: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("partial"),
      v.literal("complete"),
      v.literal("exception")
    ),
    receivedDate: v.number(),
    receivedBy: v.id("users"),
    carrierName: v.optional(v.string()),
    trackingNumber: v.optional(v.string()),
    deliveryLocation: v.string(),
    notes: v.optional(v.string()),
    hasIssues: v.boolean(),
    issueDescription: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_university", ["universityId"])
    .index("by_po", ["purchaseOrderId"])
    .index("by_date", ["receivedDate"]),

  // Receipt Line Items
  receiptLineItems: defineTable({
    receiptId: v.id("receipts"),
    poLineItemId: v.id("poLineItems"),
    quantityReceived: v.number(),
    quantityRejected: v.number(),
    rejectionReason: v.optional(v.string()),
    condition: v.union(
      v.literal("good"),
      v.literal("damaged"),
      v.literal("wrong_item"),
      v.literal("short")
    ),
    createdAt: v.number(),
  })
    .index("by_receipt", ["receiptId"])
    .index("by_po_line", ["poLineItemId"]),

  // ============================================
  // PRICE INTELLIGENCE
  // ============================================

  // Historical Prices (time series)
  priceHistory: defineTable({
    productId: v.id("products"),
    vendorId: v.id("vendors"),
    price: v.number(),
    pricePerUnit: v.number(),
    listPrice: v.number(),
    recordedAt: v.number(),
    source: v.union(
      v.literal("catalog_sync"),
      v.literal("invoice"),
      v.literal("quote"),
      v.literal("manual")
    ),
    metadata: v.optional(v.any()),
  })
    .index("by_product", ["productId", "recordedAt"])
    .index("by_vendor_product", ["vendorId", "productId", "recordedAt"])
    .index("by_date", ["recordedAt"]),

  // Price Alerts
  priceAlerts: defineTable({
    universityId: v.id("universities"),
    userId: v.id("users"),
    productId: v.id("products"),
    alertType: v.union(
      v.literal("price_drop"),
      v.literal("price_increase"),
      v.literal("target_price"),
      v.literal("contract_violation"),
      v.literal("better_price_found")
    ),
    threshold: v.optional(v.number()),
    targetPrice: v.optional(v.number()),
    isActive: v.boolean(),
    lastTriggeredAt: v.optional(v.number()),
    triggeredCount: v.number(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_product", ["productId"])
    .index("by_active", ["isActive"]),

  // Price Alert Notifications
  priceAlertNotifications: defineTable({
    alertId: v.id("priceAlerts"),
    productId: v.id("products"),
    vendorId: v.id("vendors"),
    previousPrice: v.number(),
    currentPrice: v.number(),
    changePercent: v.number(),
    alertLevel: v.union(
      v.literal("critical"),
      v.literal("high"),
      v.literal("medium"),
      v.literal("low")
    ),
    message: v.string(),
    recommendedAction: v.string(),
    annualImpact: v.optional(v.number()),
    acknowledged: v.boolean(),
    acknowledgedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_alert", ["alertId"])
    .index("by_acknowledged", ["acknowledged"])
    .index("by_level", ["alertLevel"]),

  // ============================================
  // AI / ML MODELS
  // ============================================

  // HMM Price States
  priceStateHistory: defineTable({
    productId: v.id("products"),
    vendorId: v.optional(v.id("vendors")),
    state: v.union(
      v.literal("stable"),
      v.literal("rising"),
      v.literal("peak"),
      v.literal("declining"),
      v.literal("trough"),
      v.literal("volatile")
    ),
    stateProbability: v.number(),
    predictions: v.object({
      day7: v.object({ price: v.number(), confidence: v.number() }),
      day30: v.object({ price: v.number(), confidence: v.number() }),
      day90: v.object({ price: v.number(), confidence: v.number() }),
    }),
    observedEmissions: v.object({
      priceChange: v.number(),
      volumeIndicator: v.number(),
      seasonalIndicator: v.number(),
      newsIndicator: v.number(),
    }),
    recommendation: v.union(
      v.literal("buy_now"),
      v.literal("wait"),
      v.literal("urgent")
    ),
    waitUntil: v.optional(v.number()),
    expectedSavings: v.optional(v.number()),
    calculatedAt: v.number(),
  })
    .index("by_product", ["productId", "calculatedAt"])
    .index("by_state", ["state"])
    .index("by_recommendation", ["recommendation"]),

  // Anomaly Detections
  anomalyDetections: defineTable({
    universityId: v.id("universities"),
    entityType: v.union(
      v.literal("invoice"),
      v.literal("order"),
      v.literal("vendor"),
      v.literal("user"),
      v.literal("price")
    ),
    entityId: v.string(),
    anomalyType: v.union(
      v.literal("price_anomaly"),
      v.literal("volume_anomaly"),
      v.literal("timing_anomaly"),
      v.literal("pattern_anomaly"),
      v.literal("fraud_indicator"),
      v.literal("policy_violation")
    ),
    severity: v.union(
      v.literal("critical"),
      v.literal("high"),
      v.literal("medium"),
      v.literal("low")
    ),
    confidence: v.number(),
    detectionMethod: v.union(
      v.literal("isolation_forest"),
      v.literal("autoencoder"),
      v.literal("graph_anomaly"),
      v.literal("rule_based")
    ),
    description: v.string(),
    details: v.any(),
    status: v.union(
      v.literal("new"),
      v.literal("investigating"),
      v.literal("confirmed"),
      v.literal("false_positive"),
      v.literal("resolved")
    ),
    assignedTo: v.optional(v.id("users")),
    resolvedAt: v.optional(v.number()),
    resolution: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_university", ["universityId"])
    .index("by_entity", ["entityType", "entityId"])
    .index("by_severity", ["severity", "status"])
    .index("by_status", ["status"]),

  // Demand Forecasts
  demandForecasts: defineTable({
    universityId: v.id("universities"),
    productId: v.id("products"),
    department: v.optional(v.string()),
    forecastDate: v.number(), // Date being forecasted
    forecastedAt: v.number(), // When forecast was made
    predictedQuantity: v.number(),
    confidenceInterval: v.object({
      lower: v.number(),
      upper: v.number(),
      confidence: v.number(),
    }),
    predictedSpend: v.number(),
    factors: v.object({
      seasonality: v.number(),
      trend: v.number(),
      grantCycle: v.number(),
      academicCalendar: v.number(),
    }),
    anomalyFlag: v.boolean(),
    anomalyReason: v.optional(v.string()),
    recommendation: v.optional(v.string()),
    actualQuantity: v.optional(v.number()), // Filled in later
    forecastAccuracy: v.optional(v.number()),
  })
    .index("by_product", ["productId", "forecastDate"])
    .index("by_university", ["universityId", "forecastDate"])
    .index("by_department", ["universityId", "department", "forecastDate"]),

  // ============================================
  // SUPPLIER RISK & NETWORK
  // ============================================

  // Supplier Risk Assessments
  supplierRiskAssessments: defineTable({
    vendorId: v.id("vendors"),
    assessmentDate: v.number(),
    overallRiskScore: v.number(),
    riskFactors: v.array(
      v.object({
        factor: v.string(),
        score: v.number(),
        weight: v.number(),
        details: v.string(),
      })
    ),
    financialHealth: v.object({
      score: v.number(),
      indicators: v.any(),
    }),
    supplyChainRisk: v.object({
      score: v.number(),
      dependencies: v.array(v.string()),
      geographicRisks: v.array(v.string()),
    }),
    complianceRisk: v.object({
      score: v.number(),
      issues: v.array(v.string()),
    }),
    recommendations: v.array(v.string()),
    nextReviewDate: v.number(),
  })
    .index("by_vendor", ["vendorId", "assessmentDate"])
    .index("by_risk_score", ["overallRiskScore"]),

  // Supply Chain Network (Graph edges)
  supplyChainRelationships: defineTable({
    sourceVendorId: v.id("vendors"),
    targetVendorId: v.id("vendors"),
    relationshipType: v.union(
      v.literal("supplies_to"),
      v.literal("sub_tier"),
      v.literal("competes_with"),
      v.literal("partners_with")
    ),
    materialCategory: v.optional(v.string()),
    dependencyStrength: v.number(), // 0-1
    geographicLocation: v.optional(v.string()),
    riskPropagationFactor: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_source", ["sourceVendorId"])
    .index("by_target", ["targetVendorId"])
    .index("by_type", ["relationshipType"]),

  // ============================================
  // BUDGETS & GRANTS
  // ============================================

  budgets: defineTable({
    universityId: v.id("universities"),
    budgetCode: v.string(),
    name: v.string(),
    department: v.string(),
    fiscalYear: v.number(),
    allocatedAmount: v.number(),
    spentAmount: v.number(),
    committedAmount: v.number(), // In pending POs
    availableAmount: v.number(),
    ownerId: v.id("users"),
    status: v.union(v.literal("active"), v.literal("closed"), v.literal("frozen")),
    grantInfo: v.optional(
      v.object({
        grantNumber: v.string(),
        fundingAgency: v.string(),
        startDate: v.number(),
        endDate: v.number(),
        indirectCostRate: v.number(),
        allowableCategories: v.array(v.string()),
        restrictions: v.array(v.string()),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_university", ["universityId"])
    .index("by_code", ["budgetCode"])
    .index("by_department", ["universityId", "department"])
    .index("by_owner", ["ownerId"]),

  // ============================================
  // SAVINGS TRACKING
  // ============================================

  savingsRecords: defineTable({
    universityId: v.id("universities"),
    savingsType: v.union(
      v.literal("price_reduction"),
      v.literal("vendor_switch"),
      v.literal("contract_negotiation"),
      v.literal("demand_optimization"),
      v.literal("early_pay_discount"),
      v.literal("error_recovery"),
      v.literal("bundle_discount"),
      v.literal("timing_optimization")
    ),
    amount: v.number(),
    verificationStatus: v.union(
      v.literal("calculated"),
      v.literal("verified"),
      v.literal("disputed")
    ),
    description: v.string(),
    relatedEntityType: v.optional(v.string()),
    relatedEntityId: v.optional(v.string()),
    productId: v.optional(v.id("products")),
    vendorId: v.optional(v.id("vendors")),
    agentId: v.string(), // Which AI agent found this
    calculationMethod: v.string(),
    baselinePrice: v.optional(v.number()),
    achievedPrice: v.optional(v.number()),
    quantity: v.optional(v.number()),
    recordedAt: v.number(),
    verifiedAt: v.optional(v.number()),
    verifiedBy: v.optional(v.id("users")),
  })
    .index("by_university", ["universityId"])
    .index("by_type", ["savingsType"])
    .index("by_date", ["recordedAt"])
    .index("by_verification", ["verificationStatus"]),

  // ============================================
  // AGENT SYSTEM
  // ============================================

  // AI Agent Configurations
  agentConfigurations: defineTable({
    agentId: v.string(),
    name: v.string(),
    tier: v.union(v.literal(1), v.literal(2), v.literal(3)),
    category: v.string(),
    description: v.string(),
    systemPrompt: v.string(),
    capabilities: v.array(v.string()),
    tools: v.array(v.string()),
    isActive: v.boolean(),
    configuration: v.object({
      model: v.string(),
      temperature: v.number(),
      maxTokens: v.number(),
      timeout: v.number(),
    }),
    integrations: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_agent_id", ["agentId"])
    .index("by_tier", ["tier"])
    .index("by_active", ["isActive"]),

  // Agent Executions (audit trail)
  agentExecutions: defineTable({
    agentId: v.string(),
    universityId: v.id("universities"),
    userId: v.optional(v.id("users")),
    executionType: v.union(
      v.literal("scheduled"),
      v.literal("triggered"),
      v.literal("user_request"),
      v.literal("agent_chain")
    ),
    input: v.any(),
    output: v.any(),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    error: v.optional(v.string()),
    tokensUsed: v.optional(v.number()),
    durationMs: v.number(),
    workflowId: v.optional(v.string()), // Temporal workflow ID
    parentExecutionId: v.optional(v.id("agentExecutions")),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_agent", ["agentId"])
    .index("by_university", ["universityId"])
    .index("by_status", ["status"])
    .index("by_workflow", ["workflowId"]),

  // Agent Messages (conversation history)
  agentMessages: defineTable({
    executionId: v.id("agentExecutions"),
    role: v.union(v.literal("system"), v.literal("user"), v.literal("assistant")),
    content: v.string(),
    toolCalls: v.optional(v.array(v.any())),
    toolResults: v.optional(v.array(v.any())),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_execution", ["executionId", "createdAt"]),

  // ============================================
  // NOTIFICATIONS & COMMUNICATIONS
  // ============================================

  notifications: defineTable({
    universityId: v.id("universities"),
    userId: v.id("users"),
    type: v.union(
      v.literal("approval_required"),
      v.literal("approval_complete"),
      v.literal("price_alert"),
      v.literal("delivery_update"),
      v.literal("contract_expiring"),
      v.literal("anomaly_detected"),
      v.literal("savings_opportunity"),
      v.literal("system")
    ),
    title: v.string(),
    message: v.string(),
    priority: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
    relatedEntityType: v.optional(v.string()),
    relatedEntityId: v.optional(v.string()),
    actionUrl: v.optional(v.string()),
    channels: v.array(
      v.union(v.literal("in_app"), v.literal("email"), v.literal("slack"))
    ),
    sentVia: v.array(v.string()),
    read: v.boolean(),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "read"])
    .index("by_type", ["type"])
    .index("by_priority", ["priority"]),

  // ============================================
  // TRIAL & SUBSCRIPTION
  // ============================================

  trialProgress: defineTable({
    universityId: v.id("universities"),
    phase: v.union(
      v.literal("discovery"),
      v.literal("activation"),
      v.literal("proof")
    ),
    week: v.number(),
    startDate: v.number(),
    endDate: v.number(),
    milestones: v.array(
      v.object({
        name: v.string(),
        description: v.string(),
        completed: v.boolean(),
        completedAt: v.optional(v.number()),
        metrics: v.optional(v.any()),
      })
    ),
    vendorsCataloged: v.number(),
    agentsDeployed: v.array(v.string()),
    savingsIdentified: v.number(),
    savingsCaptured: v.number(),
    deliverables: v.array(
      v.object({
        name: v.string(),
        status: v.union(
          v.literal("pending"),
          v.literal("in_progress"),
          v.literal("delivered")
        ),
        deliveredAt: v.optional(v.number()),
        documentUrl: v.optional(v.string()),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_university", ["universityId"])
    .index("by_phase", ["phase"]),

  // ============================================
  // SPEND ANALYTICS
  // ============================================

  // Spending Categories for classification
  spendingCategories: defineTable({
    universityId: v.id("universities"),
    code: v.string(),
    name: v.string(),
    description: v.string(),
    parentCategoryId: v.optional(v.id("spendingCategories")),
    annualBudget: v.number(),
    percentOfTotalTarget: v.number(),
    glCodePrefix: v.optional(v.string()),
    unspscCodes: v.array(v.string()),
    diversityTargetPercent: v.optional(v.number()),
    sustainabilityTargetPercent: v.optional(v.number()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_university", ["universityId"])
    .index("by_code", ["universityId", "code"])
    .index("by_parent", ["parentCategoryId"]),

  // Cost Centers for budget allocation tracking
  costCenters: defineTable({
    universityId: v.id("universities"),
    code: v.string(),
    name: v.string(),
    department: v.string(),
    managerId: v.optional(v.id("users")),
    parentCostCenterId: v.optional(v.id("costCenters")),
    fiscalYear: v.number(),
    allocatedBudget: v.number(),
    spentAmount: v.number(),
    committedAmount: v.number(),
    availableAmount: v.number(),
    utilizationPercent: v.number(),
    spendingLimit: v.optional(v.number()),
    requiresApprovalAbove: v.optional(v.number()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_university", ["universityId"])
    .index("by_code", ["universityId", "code"])
    .index("by_department", ["universityId", "department"])
    .index("by_manager", ["managerId"])
    .index("by_parent", ["parentCostCenterId"]),

  // Spend Snapshots for historical tracking
  spendSnapshots: defineTable({
    universityId: v.id("universities"),
    snapshotDate: v.number(),
    granularity: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("quarterly"),
      v.literal("yearly")
    ),
    totalSpend: v.number(),
    orderCount: v.number(),
    vendorCount: v.number(),
    diverseSpendAmount: v.number(),
    diverseSpendPercent: v.number(),
    sustainableSpendAmount: v.number(),
    sustainableSpendPercent: v.number(),
    savingsAmount: v.number(),
    savingsPercent: v.number(),
    avgOrderValue: v.number(),
    categoryBreakdown: v.array(
      v.object({
        categoryCode: v.string(),
        categoryName: v.string(),
        amount: v.number(),
        percentOfTotal: v.number(),
      })
    ),
    departmentBreakdown: v.array(
      v.object({
        department: v.string(),
        amount: v.number(),
        percentOfTotal: v.number(),
      })
    ),
    topVendors: v.array(
      v.object({
        vendorId: v.string(),
        vendorName: v.string(),
        amount: v.number(),
        isDiverse: v.boolean(),
      })
    ),
    createdAt: v.number(),
  })
    .index("by_university", ["universityId", "snapshotDate"])
    .index("by_granularity", ["universityId", "granularity", "snapshotDate"]),

  // Diversity Spend Targets and Tracking
  diversitySpendTargets: defineTable({
    universityId: v.id("universities"),
    fiscalYear: v.number(),
    diversityType: v.union(
      v.literal("MWBE"),
      v.literal("WBE"),
      v.literal("MBE"),
      v.literal("SBE"),
      v.literal("SDVOSB"),
      v.literal("HUBZone"),
      v.literal("LGBT"),
      v.literal("total_diverse")
    ),
    targetPercent: v.number(),
    targetAmount: v.number(),
    currentPercent: v.number(),
    currentAmount: v.number(),
    gapPercent: v.number(),
    gapAmount: v.number(),
    meetsTarget: v.boolean(),
    lastCalculatedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_university", ["universityId", "fiscalYear"])
    .index("by_type", ["universityId", "diversityType", "fiscalYear"]),

  // Sustainability Spend Tracking
  sustainabilitySpendTargets: defineTable({
    universityId: v.id("universities"),
    fiscalYear: v.number(),
    category: v.union(
      v.literal("renewable_energy"),
      v.literal("recycled_materials"),
      v.literal("carbon_neutral"),
      v.literal("eco_certified"),
      v.literal("local_sourcing"),
      v.literal("total_sustainable")
    ),
    targetPercent: v.number(),
    targetAmount: v.number(),
    currentPercent: v.number(),
    currentAmount: v.number(),
    gapPercent: v.number(),
    gapAmount: v.number(),
    meetsTarget: v.boolean(),
    carbonImpactKg: v.optional(v.number()),
    lastCalculatedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_university", ["universityId", "fiscalYear"])
    .index("by_category", ["universityId", "category", "fiscalYear"]),

  // ============================================
  // AUDIT LOG
  // ============================================

  auditLog: defineTable({
    universityId: v.id("universities"),
    userId: v.optional(v.id("users")),
    agentId: v.optional(v.string()),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    previousValue: v.optional(v.any()),
    newValue: v.optional(v.any()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    metadata: v.optional(v.any()),
    timestamp: v.number(),
  })
    .index("by_university", ["universityId", "timestamp"])
    .index("by_entity", ["entityType", "entityId"])
    .index("by_user", ["userId"])
    .index("by_action", ["action"]),

  // ============================================
  // UNIMARKET INTEGRATION
  // ============================================

  // UniMarket Configuration per University
  unimarketConfigurations: defineTable({
    universityId: v.id("universities"),
    apiKey: v.string(),
    apiSecretRef: v.string(), // Reference to secure storage
    organizationId: v.string(),
    environment: v.union(v.literal("sandbox"), v.literal("production")),
    webhookSecret: v.optional(v.string()),
    baseUrl: v.string(),
    isActive: v.boolean(),
    lastSyncAt: v.optional(v.number()),
    syncStatus: v.union(
      v.literal("idle"),
      v.literal("syncing"),
      v.literal("error"),
      v.literal("success")
    ),
    syncErrorMessage: v.optional(v.string()),
    settings: v.object({
      autoSyncEnabled: v.boolean(),
      syncIntervalMinutes: v.number(),
      priceAlertThreshold: v.number(),
      inventoryAlertEnabled: v.boolean(),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_university", ["universityId"])
    .index("by_active", ["isActive"]),

  // UniMarket Shopping Carts
  unimarketCarts: defineTable({
    universityId: v.id("universities"),
    userId: v.id("users"),
    unimarketCartId: v.string(), // Cart ID from UniMarket
    status: v.union(
      v.literal("active"),
      v.literal("submitted"),
      v.literal("expired"),
      v.literal("abandoned")
    ),
    items: v.array(
      v.object({
        productId: v.string(),
        sku: v.string(),
        name: v.string(),
        quantity: v.number(),
        unitPrice: v.number(),
        extendedPrice: v.number(),
        currency: v.string(),
        unitOfMeasure: v.string(),
        vendorId: v.optional(v.string()),
        vendorName: v.optional(v.string()),
        notes: v.optional(v.string()),
      })
    ),
    subtotal: v.number(),
    currency: v.string(),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_university", ["universityId"])
    .index("by_user", ["userId", "status"])
    .index("by_unimarket_id", ["unimarketCartId"]),

  // UniMarket PunchOut Sessions
  unimarketPunchoutSessions: defineTable({
    universityId: v.id("universities"),
    userId: v.id("users"),
    sessionId: v.string(),
    vendorId: v.string(),
    vendorName: v.string(),
    sessionUrl: v.string(),
    returnUrl: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("expired"),
      v.literal("cancelled")
    ),
    operation: v.union(
      v.literal("create"),
      v.literal("edit"),
      v.literal("inspect")
    ),
    resultCartId: v.optional(v.id("unimarketCarts")),
    expiresAt: v.number(),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_university", ["universityId"])
    .index("by_user", ["userId"])
    .index("by_session", ["sessionId"])
    .index("by_status", ["status"]),

  // UniMarket Catalog Sync Jobs
  unimarketCatalogSyncs: defineTable({
    universityId: v.id("universities"),
    syncId: v.string(),
    vendorId: v.optional(v.string()),
    syncType: v.union(v.literal("full"), v.literal("incremental")),
    status: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("failed")
    ),
    progress: v.number(), // 0-100
    stats: v.object({
      productsProcessed: v.number(),
      productsAdded: v.number(),
      productsUpdated: v.number(),
      productsRemoved: v.number(),
      priceChanges: v.number(),
      errors: v.number(),
    }),
    errorMessages: v.array(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_university", ["universityId"])
    .index("by_sync_id", ["syncId"])
    .index("by_status", ["status"]),

  // UniMarket Webhook Events
  unimarketWebhookEvents: defineTable({
    universityId: v.id("universities"),
    eventId: v.string(),
    eventType: v.string(),
    payload: v.any(),
    status: v.union(
      v.literal("received"),
      v.literal("processing"),
      v.literal("processed"),
      v.literal("failed")
    ),
    processingNotes: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    relatedEntityType: v.optional(v.string()),
    relatedEntityId: v.optional(v.string()),
    receivedAt: v.number(),
    processedAt: v.optional(v.number()),
  })
    .index("by_university", ["universityId"])
    .index("by_event_id", ["eventId"])
    .index("by_event_type", ["eventType"])
    .index("by_status", ["status"]),

  // UniMarket Order Transmissions
  unimarketOrderTransmissions: defineTable({
    universityId: v.id("universities"),
    purchaseOrderId: v.id("purchaseOrders"),
    transmissionId: v.string(),
    method: v.union(
      v.literal("api"),
      v.literal("cxml"),
      v.literal("email")
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("confirmed"),
      v.literal("failed")
    ),
    vendorConfirmationNumber: v.optional(v.string()),
    cxmlPayload: v.optional(v.string()),
    responsePayload: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    retryCount: v.number(),
    sentAt: v.optional(v.number()),
    confirmedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_university", ["universityId"])
    .index("by_po", ["purchaseOrderId"])
    .index("by_transmission_id", ["transmissionId"])
    .index("by_status", ["status"]),

  // UniMarket Product Mappings (local product to UniMarket product)
  unimarketProductMappings: defineTable({
    productId: v.id("products"),
    unimarketProductId: v.string(),
    unimarketSku: v.string(),
    vendorId: v.string(),
    vendorName: v.string(),
    lastPrice: v.number(),
    lastPriceDate: v.number(),
    availability: v.union(
      v.literal("in_stock"),
      v.literal("limited"),
      v.literal("backorder"),
      v.literal("out_of_stock"),
      v.literal("discontinued")
    ),
    leadTimeDays: v.number(),
    contractPrice: v.optional(v.number()),
    contractId: v.optional(v.string()),
    isBestPrice: v.boolean(),
    lastSyncedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_product", ["productId"])
    .index("by_unimarket_product", ["unimarketProductId"])
    .index("by_vendor", ["vendorId"])
    .index("by_best_price", ["productId", "isBestPrice"]),

  // UniMarket Contract Tracking
  unimarketContracts: defineTable({
    universityId: v.id("universities"),
    vendorId: v.id("vendors"),
    unimarketContractId: v.string(),
    contractName: v.string(),
    contractType: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("expired"),
      v.literal("pending")
    ),
    startDate: v.number(),
    endDate: v.number(),
    baseDiscount: v.number(),
    categoryDiscounts: v.array(
      v.object({
        category: v.string(),
        discountPercent: v.number(),
      })
    ),
    terms: v.object({
      paymentTerms: v.string(),
      shippingTerms: v.string(),
      minimumOrder: v.optional(v.number()),
    }),
    spendYtd: v.number(),
    spendCommitment: v.optional(v.number()),
    utilizationRate: v.number(),
    lastSyncedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_university", ["universityId"])
    .index("by_vendor", ["vendorId"])
    .index("by_unimarket_id", ["unimarketContractId"])
    .index("by_status", ["status"])
    .index("by_end_date", ["endDate"]),

  // UniMarket Spend Analytics Cache
  unimarketSpendAnalytics: defineTable({
    universityId: v.id("universities"),
    periodType: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("quarterly"),
      v.literal("yearly")
    ),
    periodStart: v.number(),
    periodEnd: v.number(),
    totalSpend: v.number(),
    orderCount: v.number(),
    avgOrderValue: v.number(),
    vendorBreakdown: v.array(
      v.object({
        vendorId: v.string(),
        vendorName: v.string(),
        spend: v.number(),
        orderCount: v.number(),
        percentage: v.number(),
      })
    ),
    categoryBreakdown: v.array(
      v.object({
        category: v.string(),
        spend: v.number(),
        percentage: v.number(),
      })
    ),
    savingsFromContracts: v.number(),
    savingsFromVolumeDiscounts: v.number(),
    totalSavings: v.number(),
    calculatedAt: v.number(),
  })
    .index("by_university", ["universityId", "periodType", "periodStart"])
    .index("by_period", ["periodType", "periodStart"]),

  // UniMarket Inventory Alerts
  unimarketInventoryAlerts: defineTable({
    universityId: v.id("universities"),
    productId: v.id("products"),
    unimarketProductId: v.string(),
    alertType: v.union(
      v.literal("out_of_stock"),
      v.literal("low_stock"),
      v.literal("back_in_stock"),
      v.literal("discontinued"),
      v.literal("lead_time_change")
    ),
    previousValue: v.optional(v.string()),
    currentValue: v.string(),
    severity: v.union(
      v.literal("critical"),
      v.literal("high"),
      v.literal("medium"),
      v.literal("low")
    ),
    isAcknowledged: v.boolean(),
    acknowledgedBy: v.optional(v.id("users")),
    acknowledgedAt: v.optional(v.number()),
    alternativeProducts: v.array(
      v.object({
        productId: v.string(),
        name: v.string(),
        vendorId: v.string(),
        price: v.number(),
        availability: v.string(),
      })
    ),
    createdAt: v.number(),
  })
    .index("by_university", ["universityId"])
    .index("by_product", ["productId"])
    .index("by_acknowledged", ["isAcknowledged"])
    .index("by_severity", ["severity"]),
});
