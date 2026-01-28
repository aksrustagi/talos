/**
 * Composio Service
 *
 * Centralized service for managing Composio integrations.
 * Handles authentication, connection management, and tool execution.
 */

import { Composio } from "@composio/core";
import { LangchainProvider } from "@composio/langchain";
import type {
  ComposioConfig,
  EntityConnection,
  ToolDefinition,
  ToolExecutionResult,
  GetToolsOptions,
  ExecuteToolOptions,
  InitiateConnectionOptions,
  ConnectionInitiationResult,
  ProcurementAppName,
  ProcurementToolCategory,
  ToolUsageMetrics,
} from "./types";

/**
 * App category mappings for procurement use cases
 */
const CATEGORY_APP_MAPPINGS: Record<ProcurementToolCategory, ProcurementAppName[]> = {
  email: ["GMAIL", "OUTLOOK"],
  communication: ["SLACK", "MICROSOFT_TEAMS", "DISCORD"],
  spreadsheet: ["GOOGLE_SHEETS", "MICROSOFT_EXCEL", "AIRTABLE"],
  crm: ["SALESFORCE", "HUBSPOT", "ZOHO_CRM"],
  project: ["JIRA", "ASANA", "LINEAR", "TRELLO", "CLICKUP", "NOTION"],
  calendar: ["GOOGLE_CALENDAR", "OUTLOOK_CALENDAR"],
  storage: ["GOOGLE_DRIVE", "DROPBOX", "ONEDRIVE", "BOX"],
  finance: ["QUICKBOOKS", "XERO", "STRIPE"],
  erp: [], // SAP, Oracle - typically custom integrations
  "e-signature": ["DOCUSIGN", "HELLOSIGN"],
  analytics: ["TABLEAU", "GOOGLE_ANALYTICS"],
  custom: ["WEBHOOK", "GITHUB"],
};

/**
 * Procurement-specific tool presets
 */
export const PROCUREMENT_TOOL_PRESETS = {
  /** Tools for vendor communication */
  vendorCommunication: [
    "GMAIL_SEND_EMAIL",
    "GMAIL_READ_EMAIL",
    "GMAIL_SEARCH_EMAILS",
    "OUTLOOK_SEND_EMAIL",
    "OUTLOOK_READ_EMAIL",
  ],
  /** Tools for internal notifications */
  internalNotifications: [
    "SLACK_SEND_MESSAGE",
    "SLACK_CREATE_CHANNEL",
    "SLACK_ADD_USERS_TO_CHANNEL",
    "MICROSOFT_TEAMS_SEND_MESSAGE",
  ],
  /** Tools for data management */
  dataManagement: [
    "GOOGLE_SHEETS_READ_SHEET",
    "GOOGLE_SHEETS_WRITE_SHEET",
    "GOOGLE_SHEETS_APPEND_ROW",
    "AIRTABLE_GET_RECORDS",
    "AIRTABLE_CREATE_RECORD",
  ],
  /** Tools for document management */
  documentManagement: [
    "GOOGLE_DRIVE_UPLOAD_FILE",
    "GOOGLE_DRIVE_CREATE_FOLDER",
    "GOOGLE_DRIVE_SEARCH_FILES",
    "DROPBOX_UPLOAD_FILE",
  ],
  /** Tools for contract management */
  contractManagement: [
    "DOCUSIGN_SEND_ENVELOPE",
    "DOCUSIGN_GET_ENVELOPE_STATUS",
    "HELLOSIGN_CREATE_SIGNATURE_REQUEST",
  ],
  /** Tools for calendar/scheduling */
  scheduling: [
    "GOOGLE_CALENDAR_CREATE_EVENT",
    "GOOGLE_CALENDAR_GET_EVENTS",
    "OUTLOOK_CALENDAR_CREATE_EVENT",
  ],
  /** Tools for CRM/vendor tracking */
  vendorTracking: [
    "SALESFORCE_CREATE_RECORD",
    "SALESFORCE_UPDATE_RECORD",
    "SALESFORCE_QUERY",
    "HUBSPOT_CREATE_CONTACT",
    "HUBSPOT_CREATE_DEAL",
  ],
  /** Tools for project tracking */
  projectTracking: [
    "JIRA_CREATE_ISSUE",
    "JIRA_UPDATE_ISSUE",
    "JIRA_GET_ISSUE",
    "LINEAR_CREATE_ISSUE",
    "ASANA_CREATE_TASK",
  ],
} as const;

export class ComposioService {
  private client: Composio;
  private config: ComposioConfig;
  private toolCache: Map<string, { tools: ToolDefinition[]; expiresAt: number }> = new Map();
  private metricsCache: Map<string, ToolUsageMetrics> = new Map();
  private initialized = false;

  constructor(config?: Partial<ComposioConfig>) {
    this.config = {
      apiKey: config?.apiKey || process.env.COMPOSIO_API_KEY || "",
      baseUrl: config?.baseUrl,
      defaultEntityId: config?.defaultEntityId || "default",
      enableToolCache: config?.enableToolCache ?? true,
      toolCacheTtl: config?.toolCacheTtl ?? 5 * 60 * 1000, // 5 minutes
    };

    // Initialize Composio client with LangChain provider for LangGraph compatibility
    this.client = new Composio({
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
    });
  }

  /**
   * Initialize the service and verify API key
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Verify API key by fetching available apps
      await this.client.getEntity(this.config.defaultEntityId!);
      this.initialized = true;
      console.log("[ComposioService] Initialized successfully");
    } catch (error) {
      console.error("[ComposioService] Failed to initialize:", error);
      throw new Error(
        `Composio initialization failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Get tools by category, app names, or specific tool names
   */
  async getTools(options: GetToolsOptions = {}): Promise<ToolDefinition[]> {
    const entityId = options.entityId || this.config.defaultEntityId!;
    const cacheKey = this.getCacheKey(options);

    // Check cache
    if (this.config.enableToolCache) {
      const cached = this.toolCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.tools;
      }
    }

    try {
      let apps: string[] = [];

      // Determine which apps to fetch tools from
      if (options.apps?.length) {
        apps = options.apps;
      } else if (options.category) {
        apps = CATEGORY_APP_MAPPINGS[options.category] || [];
      }

      // Get entity for connection context
      const entity = await this.client.getEntity(entityId);

      // Fetch tools from Composio
      let tools: any[];
      if (options.toolNames?.length) {
        tools = await entity.getTools({
          actions: options.toolNames,
        });
      } else if (apps.length) {
        tools = await entity.getTools({
          apps: apps,
        });
      } else {
        // Default: get commonly used procurement tools
        tools = await entity.getTools({
          apps: ["GMAIL", "SLACK", "GOOGLE_SHEETS"],
        });
      }

      // Transform to our tool definition format
      const toolDefinitions: ToolDefinition[] = tools.map((tool: any) => ({
        name: tool.name,
        displayName: tool.displayName || tool.name,
        description: tool.description || "",
        appName: tool.appName || this.extractAppName(tool.name),
        category: this.categorizeApp(tool.appName || this.extractAppName(tool.name)),
        parameters: tool.parameters || { type: "object", properties: {}, required: [] },
        returns: tool.returns,
      }));

      // Cache results
      if (this.config.enableToolCache) {
        this.toolCache.set(cacheKey, {
          tools: toolDefinitions,
          expiresAt: Date.now() + this.config.toolCacheTtl!,
        });
      }

      return toolDefinitions;
    } catch (error) {
      console.error("[ComposioService] Failed to get tools:", error);
      throw error;
    }
  }

  /**
   * Get tools formatted for LangGraph/LangChain
   */
  async getLangGraphTools(options: GetToolsOptions = {}): Promise<any[]> {
    const entityId = options.entityId || this.config.defaultEntityId!;

    try {
      const entity = await this.client.getEntity(entityId);

      let apps: string[] = [];
      if (options.apps?.length) {
        apps = options.apps;
      } else if (options.category) {
        apps = CATEGORY_APP_MAPPINGS[options.category] || [];
      }

      if (options.toolNames?.length) {
        return entity.getTools({
          actions: options.toolNames,
        });
      } else if (apps.length) {
        return entity.getTools({
          apps: apps,
        });
      }

      return entity.getTools({
        apps: ["GMAIL", "SLACK", "GOOGLE_SHEETS"],
      });
    } catch (error) {
      console.error("[ComposioService] Failed to get LangGraph tools:", error);
      throw error;
    }
  }

  /**
   * Get preset tools for common procurement scenarios
   */
  async getPresetTools(
    preset: keyof typeof PROCUREMENT_TOOL_PRESETS,
    entityId?: string
  ): Promise<any[]> {
    const toolNames = PROCUREMENT_TOOL_PRESETS[preset] as readonly string[];
    return this.getLangGraphTools({
      toolNames: [...toolNames],
      entityId,
    });
  }

  /**
   * Execute a tool directly
   */
  async executeTool(
    toolName: string,
    params: Record<string, unknown>,
    options: ExecuteToolOptions = {}
  ): Promise<ToolExecutionResult> {
    const entityId = options.entityId || this.config.defaultEntityId!;
    const startTime = Date.now();

    try {
      const entity = await this.client.getEntity(entityId);
      const result = await entity.execute(toolName, params);

      const executionTime = Date.now() - startTime;

      // Update metrics
      this.updateMetrics(toolName, true, executionTime);

      return {
        success: true,
        data: result,
        executionTime,
        toolName,
        appName: this.extractAppName(toolName),
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      // Update metrics
      this.updateMetrics(toolName, false, executionTime);

      return {
        success: false,
        error: {
          code: "EXECUTION_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
          details: error,
        },
        executionTime,
        toolName,
        appName: this.extractAppName(toolName),
      };
    }
  }

  /**
   * Get all connections for an entity
   */
  async getConnections(entityId?: string): Promise<EntityConnection[]> {
    const id = entityId || this.config.defaultEntityId!;

    try {
      const entity = await this.client.getEntity(id);
      const connections = await entity.getConnections();

      return connections.map((conn: any) => ({
        id: conn.id,
        entityId: id,
        appName: conn.appName,
        status: conn.status || "active",
        connectedAt: conn.createdAt,
        expiresAt: conn.expiresAt,
        scopes: conn.scopes || [],
        metadata: conn.metadata,
      }));
    } catch (error) {
      console.error("[ComposioService] Failed to get connections:", error);
      throw error;
    }
  }

  /**
   * Check if an app is connected for an entity
   */
  async isAppConnected(
    appName: ProcurementAppName,
    entityId?: string
  ): Promise<boolean> {
    const connections = await this.getConnections(entityId);
    return connections.some(
      (conn) => conn.appName === appName && conn.status === "active"
    );
  }

  /**
   * Initiate a new connection (OAuth flow)
   */
  async initiateConnection(
    options: InitiateConnectionOptions
  ): Promise<ConnectionInitiationResult> {
    try {
      const entity = await this.client.getEntity(options.entityId);
      const result = await entity.initiateConnection({
        appName: options.appName,
        redirectUrl: options.redirectUrl,
        // Additional options as needed
      });

      return {
        connectionId: result.connectionId,
        authUrl: result.redirectUrl,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min default
      };
    } catch (error) {
      console.error("[ComposioService] Failed to initiate connection:", error);
      throw error;
    }
  }

  /**
   * Disconnect an app
   */
  async disconnectApp(connectionId: string, entityId?: string): Promise<void> {
    const id = entityId || this.config.defaultEntityId!;

    try {
      const entity = await this.client.getEntity(id);
      await entity.disableConnection(connectionId);
    } catch (error) {
      console.error("[ComposioService] Failed to disconnect app:", error);
      throw error;
    }
  }

  /**
   * Get available apps that can be connected
   */
  async getAvailableApps(): Promise<string[]> {
    // Return procurement-relevant apps
    return Object.values(CATEGORY_APP_MAPPINGS).flat();
  }

  /**
   * Get apps by category
   */
  getAppsByCategory(category: ProcurementToolCategory): ProcurementAppName[] {
    return CATEGORY_APP_MAPPINGS[category] || [];
  }

  /**
   * Get tool usage metrics
   */
  getMetrics(): ToolUsageMetrics[] {
    return Array.from(this.metricsCache.values());
  }

  /**
   * Clear tool cache
   */
  clearCache(): void {
    this.toolCache.clear();
  }

  // Private helpers

  private getCacheKey(options: GetToolsOptions): string {
    return JSON.stringify({
      apps: options.apps?.sort(),
      category: options.category,
      toolNames: options.toolNames?.sort(),
      entityId: options.entityId || this.config.defaultEntityId,
    });
  }

  private extractAppName(toolName: string): string {
    // Tool names are typically formatted as APP_NAME_ACTION
    const parts = toolName.split("_");
    if (parts.length >= 2) {
      // Handle multi-word app names like GOOGLE_SHEETS
      if (parts[0] === "GOOGLE" || parts[0] === "MICROSOFT") {
        return `${parts[0]}_${parts[1]}`;
      }
      return parts[0];
    }
    return toolName;
  }

  private categorizeApp(appName: string): string {
    for (const [category, apps] of Object.entries(CATEGORY_APP_MAPPINGS)) {
      if (apps.includes(appName as ProcurementAppName)) {
        return category;
      }
    }
    return "custom";
  }

  private updateMetrics(
    toolName: string,
    success: boolean,
    executionTime: number
  ): void {
    const existing = this.metricsCache.get(toolName) || {
      toolName,
      appName: this.extractAppName(toolName),
      executionCount: 0,
      successCount: 0,
      errorCount: 0,
      averageExecutionTime: 0,
    };

    const newCount = existing.executionCount + 1;
    const newAvg =
      (existing.averageExecutionTime * existing.executionCount + executionTime) /
      newCount;

    this.metricsCache.set(toolName, {
      ...existing,
      executionCount: newCount,
      successCount: existing.successCount + (success ? 1 : 0),
      errorCount: existing.errorCount + (success ? 0 : 1),
      averageExecutionTime: newAvg,
      lastExecutedAt: new Date().toISOString(),
    });
  }
}

// Export singleton instance
export const composioService = new ComposioService();
