/**
 * Composio Integration
 *
 * Provides 250+ managed tool integrations for AI agents.
 * Handles OAuth, API keys, and tool execution through Composio's
 * unified SDK, giving Talos agents access to SaaS tools without
 * building custom connectors.
 *
 * https://github.com/ComposioHQ/composio
 */

// ============================================
// Types
// ============================================

export interface ComposioConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface ComposioTool {
  name: string;
  description: string;
  toolkit: string;
  parameters: Record<string, any>;
}

export interface ComposioToolExecution {
  toolName: string;
  args: Record<string, any>;
  userId: string;
}

export interface ComposioToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface ComposioConnection {
  id: string;
  userId: string;
  toolkit: string;
  status: "active" | "expired" | "revoked";
  connectedAt: string;
}

// Toolkit categories for Talos procurement agents
export const PROCUREMENT_TOOLKITS = {
  // CRM & Sales -- for vendor management
  CRM: ["HUBSPOT", "SALESFORCE"],

  // Communication -- for vendor outreach
  COMMUNICATION: ["GMAIL", "SLACK", "MICROSOFT_TEAMS"],

  // Productivity -- for document management
  PRODUCTIVITY: ["GOOGLE_DOCS", "GOOGLE_SHEETS", "NOTION", "AIRTABLE"],

  // Project Management -- for procurement tracking
  PROJECT: ["JIRA", "LINEAR", "ASANA", "TRELLO"],

  // IT Service -- for IT equipment procurement
  IT_SERVICE: ["SERVICENOW", "ZENDESK"],

  // Calendar -- for scheduling
  CALENDAR: ["GOOGLE_CALENDAR", "OUTLOOK_CALENDAR"],

  // File Storage -- for document handling
  STORAGE: ["GOOGLE_DRIVE", "DROPBOX", "BOX"],

  // Search -- for market research
  SEARCH: ["GOOGLE_SEARCH", "PERPLEXITY", "TAVILY"],

  // Finance -- for payment and invoicing
  FINANCE: ["QUICKBOOKS", "XERO", "STRIPE"],
} as const;

// Agent-to-toolkit mapping
export const AGENT_TOOLKIT_MAP: Record<string, string[]> = {
  // Tier 1: Price Intelligence
  "price-watch": ["GOOGLE_SEARCH", "TAVILY", "GOOGLE_SHEETS"],
  "catalog-sync": ["GOOGLE_DRIVE", "AIRTABLE", "GOOGLE_SHEETS"],
  "price-compare": ["GOOGLE_SEARCH", "PERPLEXITY", "GOOGLE_SHEETS"],
  "knowledge-graph": ["NOTION", "AIRTABLE"],
  "historical-price": ["GOOGLE_SHEETS"],
  "contract-validator": ["GOOGLE_DRIVE", "GOOGLE_DOCS"],

  // Tier 2: Procurement Process
  requisition: ["SLACK", "GOOGLE_DOCS", "GOOGLE_SHEETS"],
  "approval-workflow": ["SLACK", "GMAIL", "MICROSOFT_TEAMS", "GOOGLE_CALENDAR"],
  "vendor-selection": ["HUBSPOT", "SALESFORCE", "GOOGLE_SHEETS"],
  "rfq-rfp": ["GMAIL", "GOOGLE_DOCS", "GOOGLE_DRIVE", "GOOGLE_SHEETS"],
  "po-generation": ["GOOGLE_DOCS", "QUICKBOOKS"],
  "invoice-matching": ["QUICKBOOKS", "XERO", "GOOGLE_DRIVE"],
  "receipt-delivery": ["SLACK", "GOOGLE_SHEETS"],
  "payment-optimizer": ["QUICKBOOKS", "XERO", "GOOGLE_SHEETS"],

  // Tier 3: Category Specialists
  "lab-supply": ["GOOGLE_SEARCH", "GOOGLE_SHEETS"],
  "it-equipment": ["JIRA", "SERVICENOW", "ZENDESK"],
  "office-supply": ["GOOGLE_SHEETS", "AIRTABLE"],
  furniture: ["GOOGLE_DRIVE", "AIRTABLE"],
  facilities: ["JIRA", "SERVICENOW", "GOOGLE_CALENDAR"],
  marketing: ["GOOGLE_DOCS", "CANVA", "GOOGLE_DRIVE"],
  travel: ["GOOGLE_CALENDAR", "GOOGLE_SHEETS", "GMAIL"],
  "professional-services": ["HUBSPOT", "GOOGLE_DOCS", "GOOGLE_CALENDAR"],
  "medical-supply": ["GOOGLE_SHEETS", "GOOGLE_SEARCH"],
  "capital-projects": ["JIRA", "ASANA", "GOOGLE_DRIVE", "GOOGLE_SHEETS"],
  "food-service": ["GOOGLE_SHEETS", "AIRTABLE"],

  // Intelligence & Compliance
  "spend-analytics": ["GOOGLE_SHEETS", "NOTION", "AIRTABLE"],
  "budget-guardian": ["QUICKBOOKS", "XERO", "GOOGLE_SHEETS"],
  "compliance-agent": ["GOOGLE_DRIVE", "GOOGLE_DOCS", "NOTION"],
  "supplier-diversity": ["GOOGLE_SEARCH", "HUBSPOT", "GOOGLE_SHEETS"],
  "sustainability-agent": ["GOOGLE_SEARCH", "GOOGLE_SHEETS", "NOTION"],
  "risk-vendor-health": ["GOOGLE_SEARCH", "PERPLEXITY", "TAVILY", "GOOGLE_SHEETS"],
  "contract-lifecycle": ["GOOGLE_DRIVE", "GOOGLE_DOCS", "GOOGLE_CALENDAR"],
  "savings-tracker": ["GOOGLE_SHEETS", "NOTION"],
};

// ============================================
// Composio Tool Provider
// ============================================

export class ComposioToolProvider {
  private apiKey: string;
  private baseUrl: string;
  private toolCache: Map<string, ComposioTool[]> = new Map();

  constructor(config: ComposioConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || "https://backend.composio.dev/api/v2";
  }

  /**
   * Get tools for a specific user and set of toolkits
   */
  async getTools(userId: string, toolkits: string[]): Promise<ComposioTool[]> {
    const cacheKey = `${userId}:${toolkits.sort().join(",")}`;

    if (this.toolCache.has(cacheKey)) {
      return this.toolCache.get(cacheKey)!;
    }

    try {
      const response = await fetch(`${this.baseUrl}/tools`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify({
          userId,
          toolkits,
        }),
      });

      if (!response.ok) {
        throw new Error(`Composio API error: ${response.status}`);
      }

      const data = await response.json();
      const tools = (data.tools || []) as ComposioTool[];
      this.toolCache.set(cacheKey, tools);
      return tools;
    } catch (error) {
      console.error("Failed to fetch Composio tools:", error);
      return [];
    }
  }

  /**
   * Get tools for a specific Talos agent
   */
  async getToolsForAgent(agentId: string, userId: string): Promise<ComposioTool[]> {
    const toolkits = AGENT_TOOLKIT_MAP[agentId] || [];
    if (toolkits.length === 0) return [];
    return this.getTools(userId, toolkits);
  }

  /**
   * Execute a tool on behalf of a user
   */
  async executeTool(execution: ComposioToolExecution): Promise<ComposioToolResult> {
    try {
      const response = await fetch(`${this.baseUrl}/tools/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify({
          toolName: execution.toolName,
          args: execution.args,
          userId: execution.userId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `Composio execution failed: ${errorText}` };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Initialize a connection for a user to a specific toolkit
   */
  async initConnection(
    userId: string,
    toolkit: string
  ): Promise<{ redirectUrl: string; connectionId: string }> {
    const response = await fetch(`${this.baseUrl}/connections/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
      },
      body: JSON.stringify({ userId, toolkit }),
    });

    if (!response.ok) {
      throw new Error(`Failed to init Composio connection: ${response.status}`);
    }

    return response.json();
  }

  /**
   * List active connections for a user
   */
  async listConnections(userId: string): Promise<ComposioConnection[]> {
    const response = await fetch(
      `${this.baseUrl}/connections?userId=${encodeURIComponent(userId)}`,
      {
        headers: { "X-API-Key": this.apiKey },
      }
    );

    if (!response.ok) return [];
    const data = await response.json();
    return data.connections || [];
  }

  /**
   * Convert Composio tools to LangChain tool format for agent integration
   */
  toLangChainTools(composioTools: ComposioTool[], userId: string): any[] {
    return composioTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      execute: async (args: Record<string, any>) => {
        const result = await this.executeTool({
          toolName: tool.name,
          args,
          userId,
        });
        return result.success ? result.data : { error: result.error };
      },
    }));
  }

  /**
   * Clear the tool cache
   */
  clearCache(): void {
    this.toolCache.clear();
  }
}

export default ComposioToolProvider;
