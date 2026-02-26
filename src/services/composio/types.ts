/**
 * Composio Service Types
 */

/**
 * Configuration for Composio service
 */
export interface ComposioConfig {
  apiKey: string;
  baseUrl?: string;
  /** Default entity ID for multi-tenant scenarios */
  defaultEntityId?: string;
  /** Enable caching for tool definitions */
  enableToolCache?: boolean;
  /** Cache TTL in milliseconds */
  toolCacheTtl?: number;
}

/**
 * Represents a connection to an external app for an entity
 */
export interface EntityConnection {
  id: string;
  entityId: string;
  appName: string;
  status: "active" | "expired" | "pending" | "error";
  connectedAt: string;
  expiresAt?: string;
  scopes: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Tool definition from Composio
 */
export interface ToolDefinition {
  name: string;
  displayName: string;
  description: string;
  appName: string;
  category: string;
  parameters: {
    type: "object";
    properties: Record<string, ParameterDefinition>;
    required: string[];
  };
  returns?: {
    type: string;
    description: string;
  };
}

export interface ParameterDefinition {
  type: string;
  description: string;
  enum?: string[];
  default?: unknown;
  required?: boolean;
}

/**
 * Result of executing a tool
 */
export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  executionTime: number;
  toolName: string;
  appName: string;
}

/**
 * Procurement-specific tool categories
 */
export type ProcurementToolCategory =
  | "email" // Gmail, Outlook - for vendor communication
  | "communication" // Slack, Teams - internal notifications
  | "spreadsheet" // Google Sheets, Excel - data analysis
  | "crm" // Salesforce, HubSpot - vendor management
  | "project" // Jira, Asana, Linear - procurement tracking
  | "calendar" // Google Calendar, Outlook - meeting scheduling
  | "storage" // Google Drive, Dropbox - document storage
  | "finance" // QuickBooks, Xero - payment reconciliation
  | "erp" // SAP, Oracle - enterprise integration
  | "e-signature" // DocuSign, HelloSign - contract signing
  | "analytics" // Tableau, Looker - spend analytics
  | "custom"; // Custom integrations

/**
 * App names available in Composio relevant to procurement
 */
export type ProcurementAppName =
  // Email
  | "GMAIL"
  | "OUTLOOK"
  // Communication
  | "SLACK"
  | "MICROSOFT_TEAMS"
  | "DISCORD"
  // Spreadsheets
  | "GOOGLE_SHEETS"
  | "MICROSOFT_EXCEL"
  | "AIRTABLE"
  // CRM
  | "SALESFORCE"
  | "HUBSPOT"
  | "ZOHO_CRM"
  // Project Management
  | "JIRA"
  | "ASANA"
  | "LINEAR"
  | "TRELLO"
  | "CLICKUP"
  | "NOTION"
  // Calendar
  | "GOOGLE_CALENDAR"
  | "OUTLOOK_CALENDAR"
  // Storage
  | "GOOGLE_DRIVE"
  | "DROPBOX"
  | "ONEDRIVE"
  | "BOX"
  // Finance
  | "QUICKBOOKS"
  | "XERO"
  | "STRIPE"
  // E-Signature
  | "DOCUSIGN"
  | "HELLOSIGN"
  // Analytics
  | "TABLEAU"
  | "GOOGLE_ANALYTICS"
  // Development/Webhook
  | "GITHUB"
  | "WEBHOOK";

/**
 * Tool request options
 */
export interface GetToolsOptions {
  /** Filter by app names */
  apps?: ProcurementAppName[];
  /** Filter by category */
  category?: ProcurementToolCategory;
  /** Specific tool names to fetch */
  toolNames?: string[];
  /** Entity ID for multi-tenant scenarios */
  entityId?: string;
  /** Include inactive/disconnected apps */
  includeInactive?: boolean;
}

/**
 * Tool execution options
 */
export interface ExecuteToolOptions {
  /** Entity ID for multi-tenant scenarios */
  entityId?: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Retry configuration */
  retry?: {
    maxAttempts: number;
    backoffMs: number;
  };
}

/**
 * Connection initiation options
 */
export interface InitiateConnectionOptions {
  entityId: string;
  appName: ProcurementAppName;
  /** Redirect URL after OAuth completion */
  redirectUrl?: string;
  /** Requested scopes */
  scopes?: string[];
  /** Additional metadata to store with connection */
  metadata?: Record<string, unknown>;
}

/**
 * Connection initiation result
 */
export interface ConnectionInitiationResult {
  connectionId: string;
  authUrl: string;
  expiresAt: string;
}

/**
 * Webhook event from Composio
 */
export interface ComposioWebhookEvent {
  eventType: string;
  appName: string;
  entityId: string;
  connectionId: string;
  timestamp: string;
  data: unknown;
}

/**
 * Tool usage metrics
 */
export interface ToolUsageMetrics {
  toolName: string;
  appName: string;
  executionCount: number;
  successCount: number;
  errorCount: number;
  averageExecutionTime: number;
  lastExecutedAt?: string;
}
