/**
 * Procurement Connector Types
 *
 * Unified type definitions for all procurement system connectors.
 */

/**
 * Supported procurement systems
 */
export type ProcurementSystem =
  | "jaggaer"
  | "oracle"
  | "unimarket"
  | "sciquest"
  | "workday"
  | "ariba"
  | "coupa";

/**
 * Authentication methods
 */
export type AuthMethod =
  | "oauth2"
  | "api_key"
  | "basic"
  | "certificate"
  | "saml"
  | "shared_secret";

/**
 * Connector configuration
 */
export interface ConnectorConfig {
  /** Unique identifier for this connection */
  id: string;
  /** Procurement system type */
  system: ProcurementSystem;
  /** University/organization ID */
  universityId: string;
  /** Display name */
  name: string;
  /** Environment */
  environment: "production" | "sandbox" | "test";
  /** Base URL for the system */
  baseUrl: string;
  /** Authentication configuration */
  auth: AuthConfig;
  /** Feature flags */
  features: ConnectorFeatures;
  /** System-specific settings */
  settings: Record<string, unknown>;
  /** Webhook endpoints for real-time updates */
  webhooks?: WebhookConfig;
  /** Rate limiting configuration */
  rateLimit?: RateLimitConfig;
  /** Retry configuration */
  retry?: RetryConfig;
  /** Created timestamp */
  createdAt: string;
  /** Last updated */
  updatedAt: string;
  /** Connection status */
  status: "active" | "inactive" | "error" | "pending";
}

export interface AuthConfig {
  method: AuthMethod;
  /** OAuth2 configuration */
  oauth2?: {
    clientId: string;
    clientSecret: string;
    tokenUrl: string;
    authUrl?: string;
    scopes: string[];
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
  };
  /** API key configuration */
  apiKey?: {
    key: string;
    headerName: string;
  };
  /** Basic auth */
  basic?: {
    username: string;
    password: string;
  };
  /** Certificate auth */
  certificate?: {
    certPath: string;
    keyPath: string;
    passphrase?: string;
  };
  /** Shared secret for cXML */
  sharedSecret?: {
    identity: string;
    secret: string;
    domain: string;
  };
}

export interface ConnectorFeatures {
  /** Supports catalog sync */
  catalogSync: boolean;
  /** Supports punchout */
  punchout: boolean;
  /** Supports cXML */
  cxml: boolean;
  /** Supports purchase orders */
  purchaseOrders: boolean;
  /** Supports invoices */
  invoices: boolean;
  /** Supports receipts */
  receipts: boolean;
  /** Supports requisitions */
  requisitions: boolean;
  /** Supports contracts */
  contracts: boolean;
  /** Supports suppliers/vendors */
  suppliers: boolean;
  /** Supports real-time webhooks */
  webhooks: boolean;
  /** Supports batch operations */
  batchOperations: boolean;
}

export interface WebhookConfig {
  /** Webhook endpoint URL */
  endpoint: string;
  /** Events to subscribe to */
  events: WebhookEvent[];
  /** Webhook secret for validation */
  secret: string;
  /** Active status */
  active: boolean;
}

export type WebhookEvent =
  | "catalog.updated"
  | "order.created"
  | "order.updated"
  | "order.shipped"
  | "invoice.received"
  | "receipt.confirmed"
  | "supplier.updated";

export interface RateLimitConfig {
  /** Requests per second */
  requestsPerSecond: number;
  /** Burst limit */
  burstLimit: number;
  /** Concurrent requests */
  concurrentRequests: number;
}

export interface RetryConfig {
  /** Max retry attempts */
  maxAttempts: number;
  /** Initial delay in ms */
  initialDelay: number;
  /** Max delay in ms */
  maxDelay: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
}

// ============================================================================
// Catalog Types
// ============================================================================

export interface CatalogItem {
  /** Internal ID */
  id: string;
  /** Supplier item ID */
  supplierItemId: string;
  /** Manufacturer part number */
  manufacturerPartNumber?: string;
  /** Product name */
  name: string;
  /** Description */
  description: string;
  /** Long description */
  longDescription?: string;
  /** Unit of measure */
  unitOfMeasure: string;
  /** Pack size/quantity per UOM */
  packSize: number;
  /** Price */
  price: number;
  /** Currency */
  currency: string;
  /** List/MSRP price */
  listPrice?: number;
  /** Contract price (if applicable) */
  contractPrice?: number;
  /** Contract ID */
  contractId?: string;
  /** Category/classification */
  category: string[];
  /** UNSPSC code */
  unspscCode?: string;
  /** Manufacturer */
  manufacturer?: string;
  /** Supplier/vendor info */
  supplier: {
    id: string;
    name: string;
  };
  /** Image URL */
  imageUrl?: string;
  /** Product URL */
  productUrl?: string;
  /** Lead time in days */
  leadTimeDays?: number;
  /** Availability status */
  availability: "in_stock" | "low_stock" | "out_of_stock" | "discontinued";
  /** Custom attributes */
  attributes: Record<string, string | number | boolean>;
  /** Last updated */
  updatedAt: string;
}

export interface CatalogSyncRequest {
  /** Full or incremental sync */
  syncType: "full" | "incremental";
  /** Last sync timestamp for incremental */
  lastSyncAt?: string;
  /** Specific categories to sync */
  categories?: string[];
  /** Specific suppliers to sync */
  supplierIds?: string[];
}

export interface CatalogSyncResult {
  /** Sync ID */
  syncId: string;
  /** Status */
  status: "success" | "partial" | "failed";
  /** Items synced */
  itemsSynced: number;
  /** Items added */
  itemsAdded: number;
  /** Items updated */
  itemsUpdated: number;
  /** Items removed */
  itemsRemoved: number;
  /** Errors encountered */
  errors: SyncError[];
  /** Started at */
  startedAt: string;
  /** Completed at */
  completedAt: string;
}

export interface SyncError {
  itemId?: string;
  code: string;
  message: string;
  details?: unknown;
}

// ============================================================================
// Purchase Order Types
// ============================================================================

export interface PurchaseOrder {
  /** PO ID */
  id: string;
  /** PO number */
  poNumber: string;
  /** External system PO ID */
  externalId?: string;
  /** Order date */
  orderDate: string;
  /** Supplier info */
  supplier: {
    id: string;
    name: string;
    code?: string;
  };
  /** Ship to address */
  shipTo: Address;
  /** Bill to address */
  billTo: Address;
  /** Line items */
  lineItems: PurchaseOrderLine[];
  /** Subtotal */
  subtotal: number;
  /** Tax */
  tax: number;
  /** Shipping */
  shipping: number;
  /** Total */
  total: number;
  /** Currency */
  currency: string;
  /** Payment terms */
  paymentTerms?: string;
  /** Shipping method */
  shippingMethod?: string;
  /** Special instructions */
  specialInstructions?: string;
  /** Status */
  status: POStatus;
  /** Created at */
  createdAt: string;
  /** Updated at */
  updatedAt: string;
  /** Custom fields */
  customFields?: Record<string, unknown>;
  /** Accounting info */
  accounting?: AccountingInfo;
}

export interface PurchaseOrderLine {
  /** Line number */
  lineNumber: number;
  /** Item ID */
  itemId: string;
  /** Supplier item ID */
  supplierItemId: string;
  /** Description */
  description: string;
  /** Quantity */
  quantity: number;
  /** Unit of measure */
  unitOfMeasure: string;
  /** Unit price */
  unitPrice: number;
  /** Extended price */
  extendedPrice: number;
  /** Requested delivery date */
  requestedDeliveryDate?: string;
  /** Accounting distribution */
  accounting?: AccountingInfo;
  /** Status */
  status: "open" | "partial" | "received" | "canceled";
}

export interface Address {
  name: string;
  attention?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;
  email?: string;
}

export interface AccountingInfo {
  /** Chart of accounts segment */
  chartOfAccounts?: string;
  /** Fund code */
  fund?: string;
  /** Department code */
  department?: string;
  /** Project/grant code */
  project?: string;
  /** Cost center */
  costCenter?: string;
  /** GL account */
  glAccount?: string;
  /** Custom segments */
  segments?: Record<string, string>;
}

export type POStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "sent"
  | "acknowledged"
  | "partially_received"
  | "received"
  | "invoiced"
  | "closed"
  | "canceled";

// ============================================================================
// Invoice Types
// ============================================================================

export interface Invoice {
  /** Invoice ID */
  id: string;
  /** Invoice number */
  invoiceNumber: string;
  /** External system invoice ID */
  externalId?: string;
  /** Related PO numbers */
  poNumbers: string[];
  /** Supplier info */
  supplier: {
    id: string;
    name: string;
    code?: string;
  };
  /** Invoice date */
  invoiceDate: string;
  /** Due date */
  dueDate: string;
  /** Line items */
  lineItems: InvoiceLine[];
  /** Subtotal */
  subtotal: number;
  /** Tax */
  tax: number;
  /** Shipping/handling */
  shipping: number;
  /** Discounts */
  discount: number;
  /** Total */
  total: number;
  /** Currency */
  currency: string;
  /** Payment terms */
  paymentTerms?: string;
  /** Early pay discount */
  earlyPayDiscount?: {
    percentage: number;
    daysToQualify: number;
    discountAmount: number;
  };
  /** Status */
  status: InvoiceStatus;
  /** Match status */
  matchStatus: MatchStatus;
  /** Discrepancies */
  discrepancies?: Discrepancy[];
  /** Created at */
  createdAt: string;
  /** Updated at */
  updatedAt: string;
}

export interface InvoiceLine {
  /** Line number */
  lineNumber: number;
  /** Related PO line number */
  poLineNumber?: number;
  /** Item ID */
  itemId?: string;
  /** Description */
  description: string;
  /** Quantity */
  quantity: number;
  /** Unit of measure */
  unitOfMeasure: string;
  /** Unit price */
  unitPrice: number;
  /** Extended price */
  extendedPrice: number;
  /** Match status */
  matchStatus: MatchStatus;
}

export type InvoiceStatus =
  | "received"
  | "pending_match"
  | "matched"
  | "exception"
  | "approved"
  | "scheduled"
  | "paid"
  | "disputed"
  | "canceled";

export type MatchStatus =
  | "pending"
  | "matched"
  | "quantity_mismatch"
  | "price_mismatch"
  | "no_po"
  | "no_receipt"
  | "exception";

export interface Discrepancy {
  type: "quantity" | "price" | "missing_po" | "missing_receipt" | "duplicate";
  lineNumber?: number;
  expected: number | string;
  actual: number | string;
  difference?: number;
  severity: "low" | "medium" | "high";
  resolution?: string;
}

// ============================================================================
// Requisition Types
// ============================================================================

export interface Requisition {
  /** Requisition ID */
  id: string;
  /** Requisition number */
  requisitionNumber: string;
  /** External system ID */
  externalId?: string;
  /** Title/description */
  title: string;
  /** Requester info */
  requester: {
    id: string;
    name: string;
    email: string;
    department?: string;
  };
  /** Line items */
  lineItems: RequisitionLine[];
  /** Total estimated amount */
  totalAmount: number;
  /** Currency */
  currency: string;
  /** Justification */
  justification?: string;
  /** Needed by date */
  neededByDate?: string;
  /** Ship to address */
  shipTo?: Address;
  /** Status */
  status: RequisitionStatus;
  /** Approval chain */
  approvalChain?: ApprovalStep[];
  /** Created at */
  createdAt: string;
  /** Updated at */
  updatedAt: string;
  /** Submitted at */
  submittedAt?: string;
  /** Custom fields */
  customFields?: Record<string, unknown>;
}

export interface RequisitionLine {
  /** Line number */
  lineNumber: number;
  /** Catalog item ID (if from catalog) */
  catalogItemId?: string;
  /** Supplier item ID */
  supplierItemId?: string;
  /** Description */
  description: string;
  /** Quantity */
  quantity: number;
  /** Unit of measure */
  unitOfMeasure: string;
  /** Estimated unit price */
  estimatedUnitPrice: number;
  /** Estimated extended price */
  estimatedExtendedPrice: number;
  /** Preferred supplier */
  preferredSupplier?: {
    id: string;
    name: string;
  };
  /** Accounting info */
  accounting?: AccountingInfo;
}

export type RequisitionStatus =
  | "draft"
  | "submitted"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "canceled"
  | "converted_to_po";

export interface ApprovalStep {
  /** Step number */
  stepNumber: number;
  /** Approver info */
  approver: {
    id: string;
    name: string;
    email: string;
  };
  /** Status */
  status: "pending" | "approved" | "rejected" | "skipped";
  /** Decision timestamp */
  decisionAt?: string;
  /** Comments */
  comments?: string;
}

// ============================================================================
// Supplier Types
// ============================================================================

export interface Supplier {
  /** Supplier ID */
  id: string;
  /** External system ID */
  externalId?: string;
  /** Supplier code */
  code: string;
  /** Supplier name */
  name: string;
  /** DBA name */
  dbaName?: string;
  /** Tax ID */
  taxId?: string;
  /** DUNS number */
  dunsNumber?: string;
  /** Diversity certifications */
  diversityCertifications: DiversityCertification[];
  /** Primary contact */
  primaryContact?: Contact;
  /** Addresses */
  addresses: SupplierAddress[];
  /** Payment info */
  paymentInfo?: PaymentInfo;
  /** Status */
  status: "active" | "inactive" | "blocked" | "pending";
  /** Created at */
  createdAt: string;
  /** Updated at */
  updatedAt: string;
}

export interface Contact {
  name: string;
  title?: string;
  email: string;
  phone?: string;
}

export interface SupplierAddress {
  type: "remit" | "order" | "corporate" | "shipping";
  address: Address;
  isPrimary: boolean;
}

export interface PaymentInfo {
  paymentTerms: string;
  paymentMethod: "check" | "ach" | "wire" | "card";
  bankAccount?: {
    bankName: string;
    routingNumber: string;
    accountNumber: string;
    accountType: "checking" | "savings";
  };
}

export type DiversityCertification =
  | "MBE" // Minority Business Enterprise
  | "WBE" // Women Business Enterprise
  | "VBE" // Veteran Business Enterprise
  | "SDVOB" // Service-Disabled Veteran-Owned Business
  | "WOSB" // Women-Owned Small Business
  | "HUBZone" // HUBZone certified
  | "8a" // 8(a) certified
  | "SDB" // Small Disadvantaged Business
  | "LGBTBE" // LGBT Business Enterprise
  | "DOBE"; // Disability-Owned Business Enterprise

// ============================================================================
// Punchout Types
// ============================================================================

export interface PunchoutSession {
  /** Session ID */
  sessionId: string;
  /** Buyer cookie (for return) */
  buyerCookie: string;
  /** User info */
  user: {
    id: string;
    email: string;
    name: string;
  };
  /** Supplier info */
  supplier: {
    id: string;
    name: string;
  };
  /** Punchout URL to redirect to */
  punchoutUrl: string;
  /** Return URL for cart */
  returnUrl: string;
  /** Session created at */
  createdAt: string;
  /** Session expires at */
  expiresAt: string;
  /** Status */
  status: "active" | "completed" | "expired" | "canceled";
}

export interface PunchoutCart {
  /** Session ID */
  sessionId: string;
  /** Cart items */
  items: PunchoutCartItem[];
  /** Total */
  total: number;
  /** Currency */
  currency: string;
  /** Received at */
  receivedAt: string;
}

export interface PunchoutCartItem {
  /** Supplier item ID */
  supplierItemId: string;
  /** Description */
  description: string;
  /** Quantity */
  quantity: number;
  /** Unit of measure */
  unitOfMeasure: string;
  /** Unit price */
  unitPrice: number;
  /** Extended price */
  extendedPrice: number;
  /** Manufacturer part number */
  manufacturerPartNumber?: string;
  /** Manufacturer */
  manufacturer?: string;
  /** Classification */
  classification?: {
    code: string;
    domain: string;
  };
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ConnectorResponse<T> {
  success: boolean;
  data?: T;
  error?: ConnectorError;
  metadata?: {
    requestId: string;
    timestamp: string;
    duration: number;
  };
}

export interface ConnectorError {
  code: string;
  message: string;
  details?: unknown;
  retryable: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface BatchResult<T> {
  successful: T[];
  failed: Array<{
    item: unknown;
    error: ConnectorError;
  }>;
  totalProcessed: number;
  successCount: number;
  failureCount: number;
}
