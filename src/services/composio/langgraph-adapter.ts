/**
 * Composio LangGraph Adapter
 *
 * Provides seamless integration between Composio tools and LangGraph agents.
 * Handles tool binding, state management, and execution within LangGraph workflows.
 */

import { ToolNode } from "@langchain/langgraph/prebuilt";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { ComposioService, composioService, PROCUREMENT_TOOL_PRESETS } from "./service";
import type {
  GetToolsOptions,
  ProcurementToolCategory,
  ProcurementAppName,
} from "./types";

/**
 * Agent-specific tool configuration
 */
export interface AgentToolConfig {
  /** Agent identifier */
  agentId: string;
  /** Tool categories this agent needs */
  categories?: ProcurementToolCategory[];
  /** Specific apps this agent needs */
  apps?: ProcurementAppName[];
  /** Specific tool names */
  toolNames?: string[];
  /** Use a preset tool collection */
  preset?: keyof typeof PROCUREMENT_TOOL_PRESETS;
  /** Entity ID for multi-tenant scenarios */
  entityId?: string;
}

/**
 * Tool configuration for Phase 1 agents
 */
export const PHASE1_AGENT_TOOL_CONFIGS: Record<string, AgentToolConfig> = {
  "catalog-intelligence": {
    agentId: "catalog-intelligence",
    categories: ["spreadsheet", "storage"],
    apps: ["GOOGLE_SHEETS", "AIRTABLE", "GOOGLE_DRIVE"],
  },
  "price-discovery": {
    agentId: "price-discovery",
    preset: "vendorCommunication",
    apps: ["GMAIL", "GOOGLE_SHEETS", "SLACK"],
  },
  "vendor-intelligence": {
    agentId: "vendor-intelligence",
    preset: "vendorTracking",
    apps: ["SALESFORCE", "HUBSPOT", "GOOGLE_SHEETS", "SLACK"],
  },
  "policy-compliance": {
    agentId: "policy-compliance",
    categories: ["spreadsheet", "storage", "communication"],
    apps: ["GOOGLE_SHEETS", "GOOGLE_DRIVE", "SLACK"],
  },
  "approval-routing": {
    agentId: "approval-routing",
    preset: "internalNotifications",
    apps: ["SLACK", "MICROSOFT_TEAMS", "GMAIL"],
  },
  "email-communication": {
    agentId: "email-communication",
    preset: "vendorCommunication",
    apps: ["GMAIL", "OUTLOOK"],
  },
  "payment-reconciliation": {
    agentId: "payment-reconciliation",
    categories: ["finance", "spreadsheet"],
    apps: ["QUICKBOOKS", "XERO", "GOOGLE_SHEETS", "SLACK"],
  },
  "software-license": {
    agentId: "software-license",
    preset: "dataManagement",
    apps: ["GOOGLE_SHEETS", "AIRTABLE", "SLACK", "GMAIL"],
  },
};

/**
 * Adapter for integrating Composio tools with LangGraph agents
 */
export class ComposioLangGraphAdapter {
  private service: ComposioService;
  private toolCache: Map<string, any[]> = new Map();

  constructor(service?: ComposioService) {
    this.service = service || composioService;
  }

  /**
   * Get tools for a specific Phase 1 agent
   */
  async getToolsForAgent(agentId: string, entityId?: string): Promise<any[]> {
    const config = PHASE1_AGENT_TOOL_CONFIGS[agentId];
    if (!config) {
      console.warn(`[ComposioLangGraphAdapter] No config found for agent: ${agentId}`);
      return [];
    }

    const cacheKey = `${agentId}:${entityId || "default"}`;
    if (this.toolCache.has(cacheKey)) {
      return this.toolCache.get(cacheKey)!;
    }

    try {
      let tools: any[];

      if (config.preset) {
        tools = await this.service.getPresetTools(config.preset, entityId);
      } else {
        tools = await this.service.getLangGraphTools({
          apps: config.apps,
          category: config.categories?.[0],
          entityId,
        });
      }

      this.toolCache.set(cacheKey, tools);
      return tools;
    } catch (error) {
      console.error(
        `[ComposioLangGraphAdapter] Failed to get tools for ${agentId}:`,
        error
      );
      return [];
    }
  }

  /**
   * Create a ToolNode for LangGraph with Composio tools
   */
  async createToolNode(options: GetToolsOptions): Promise<ToolNode<any>> {
    const tools = await this.service.getLangGraphTools(options);
    return new ToolNode(tools);
  }

  /**
   * Create a ToolNode for a specific agent
   */
  async createAgentToolNode(agentId: string, entityId?: string): Promise<ToolNode<any>> {
    const tools = await this.getToolsForAgent(agentId, entityId);
    return new ToolNode(tools);
  }

  /**
   * Merge Composio tools with existing agent tools
   */
  async mergeWithAgentTools(
    agentId: string,
    existingTools: any[],
    entityId?: string
  ): Promise<any[]> {
    const composioTools = await this.getToolsForAgent(agentId, entityId);
    return [...existingTools, ...composioTools];
  }

  /**
   * Create custom procurement tools that wrap Composio functionality
   */
  createProcurementTools(entityId?: string): DynamicStructuredTool[] {
    return [
      // Send vendor email tool
      new DynamicStructuredTool({
        name: "send_vendor_email",
        description: "Send an email to a vendor using Gmail or Outlook",
        schema: z.object({
          to: z.string().describe("Recipient email address"),
          subject: z.string().describe("Email subject"),
          body: z.string().describe("Email body content"),
          cc: z.array(z.string()).optional().describe("CC recipients"),
          attachments: z
            .array(
              z.object({
                name: z.string(),
                content: z.string().describe("Base64 encoded content"),
                mimeType: z.string(),
              })
            )
            .optional(),
        }),
        func: async ({ to, subject, body, cc, attachments }) => {
          try {
            const result = await this.service.executeTool(
              "GMAIL_SEND_EMAIL",
              {
                to,
                subject,
                body,
                cc,
                attachments,
              },
              { entityId }
            );
            return JSON.stringify(result);
          } catch (error) {
            return JSON.stringify({
              error: error instanceof Error ? error.message : "Failed to send email",
            });
          }
        },
      }),

      // Post to Slack channel tool
      new DynamicStructuredTool({
        name: "notify_slack_channel",
        description: "Post a notification to a Slack channel",
        schema: z.object({
          channel: z.string().describe("Slack channel name or ID"),
          message: z.string().describe("Message to post"),
          blocks: z.array(z.any()).optional().describe("Slack block kit blocks"),
        }),
        func: async ({ channel, message, blocks }) => {
          try {
            const result = await this.service.executeTool(
              "SLACK_SEND_MESSAGE",
              {
                channel,
                text: message,
                blocks,
              },
              { entityId }
            );
            return JSON.stringify(result);
          } catch (error) {
            return JSON.stringify({
              error: error instanceof Error ? error.message : "Failed to send Slack message",
            });
          }
        },
      }),

      // Update spreadsheet tool
      new DynamicStructuredTool({
        name: "update_procurement_spreadsheet",
        description: "Update data in a Google Sheets procurement spreadsheet",
        schema: z.object({
          spreadsheetId: z.string().describe("Google Sheets spreadsheet ID"),
          sheetName: z.string().describe("Name of the sheet tab"),
          range: z.string().describe("Cell range (e.g., A1:D10)"),
          values: z.array(z.array(z.any())).describe("2D array of values to write"),
        }),
        func: async ({ spreadsheetId, sheetName, range, values }) => {
          try {
            const result = await this.service.executeTool(
              "GOOGLE_SHEETS_WRITE_SHEET",
              {
                spreadsheetId,
                range: `${sheetName}!${range}`,
                values,
              },
              { entityId }
            );
            return JSON.stringify(result);
          } catch (error) {
            return JSON.stringify({
              error: error instanceof Error ? error.message : "Failed to update spreadsheet",
            });
          }
        },
      }),

      // Create Jira ticket for procurement issues
      new DynamicStructuredTool({
        name: "create_procurement_ticket",
        description: "Create a Jira ticket for procurement-related issues or requests",
        schema: z.object({
          projectKey: z.string().describe("Jira project key"),
          summary: z.string().describe("Ticket summary/title"),
          description: z.string().describe("Detailed description"),
          issueType: z
            .enum(["Task", "Bug", "Story", "Epic"])
            .default("Task")
            .describe("Type of issue"),
          priority: z
            .enum(["Highest", "High", "Medium", "Low", "Lowest"])
            .default("Medium"),
          labels: z.array(z.string()).optional(),
          assignee: z.string().optional().describe("Assignee username"),
        }),
        func: async ({
          projectKey,
          summary,
          description,
          issueType,
          priority,
          labels,
          assignee,
        }) => {
          try {
            const result = await this.service.executeTool(
              "JIRA_CREATE_ISSUE",
              {
                project: projectKey,
                summary,
                description,
                issuetype: issueType,
                priority,
                labels,
                assignee,
              },
              { entityId }
            );
            return JSON.stringify(result);
          } catch (error) {
            return JSON.stringify({
              error: error instanceof Error ? error.message : "Failed to create Jira ticket",
            });
          }
        },
      }),

      // Schedule meeting tool
      new DynamicStructuredTool({
        name: "schedule_vendor_meeting",
        description: "Schedule a meeting with vendors using Google Calendar",
        schema: z.object({
          title: z.string().describe("Meeting title"),
          description: z.string().optional().describe("Meeting description"),
          startTime: z.string().describe("Start time in ISO 8601 format"),
          endTime: z.string().describe("End time in ISO 8601 format"),
          attendees: z.array(z.string()).describe("List of attendee email addresses"),
          location: z.string().optional().describe("Meeting location or video link"),
        }),
        func: async ({ title, description, startTime, endTime, attendees, location }) => {
          try {
            const result = await this.service.executeTool(
              "GOOGLE_CALENDAR_CREATE_EVENT",
              {
                summary: title,
                description,
                start: { dateTime: startTime },
                end: { dateTime: endTime },
                attendees: attendees.map((email) => ({ email })),
                location,
              },
              { entityId }
            );
            return JSON.stringify(result);
          } catch (error) {
            return JSON.stringify({
              error: error instanceof Error ? error.message : "Failed to schedule meeting",
            });
          }
        },
      }),

      // Upload document tool
      new DynamicStructuredTool({
        name: "upload_procurement_document",
        description: "Upload a procurement document to Google Drive",
        schema: z.object({
          fileName: z.string().describe("Name of the file"),
          content: z.string().describe("File content (base64 encoded for binary)"),
          mimeType: z.string().describe("MIME type of the file"),
          folderId: z.string().optional().describe("Target folder ID"),
        }),
        func: async ({ fileName, content, mimeType, folderId }) => {
          try {
            const result = await this.service.executeTool(
              "GOOGLE_DRIVE_UPLOAD_FILE",
              {
                name: fileName,
                content,
                mimeType,
                parents: folderId ? [folderId] : undefined,
              },
              { entityId }
            );
            return JSON.stringify(result);
          } catch (error) {
            return JSON.stringify({
              error: error instanceof Error ? error.message : "Failed to upload document",
            });
          }
        },
      }),

      // Update CRM vendor record
      new DynamicStructuredTool({
        name: "update_vendor_crm",
        description: "Update vendor information in Salesforce CRM",
        schema: z.object({
          vendorId: z.string().describe("Salesforce Account ID for the vendor"),
          updates: z
            .record(z.any())
            .describe("Field updates as key-value pairs"),
        }),
        func: async ({ vendorId, updates }) => {
          try {
            const result = await this.service.executeTool(
              "SALESFORCE_UPDATE_RECORD",
              {
                objectType: "Account",
                recordId: vendorId,
                fields: updates,
              },
              { entityId }
            );
            return JSON.stringify(result);
          } catch (error) {
            return JSON.stringify({
              error: error instanceof Error ? error.message : "Failed to update CRM",
            });
          }
        },
      }),

      // Send for e-signature
      new DynamicStructuredTool({
        name: "send_for_signature",
        description: "Send a document for electronic signature via DocuSign",
        schema: z.object({
          documentName: z.string().describe("Name of the document"),
          documentContent: z.string().describe("Base64 encoded document content"),
          signers: z
            .array(
              z.object({
                email: z.string(),
                name: z.string(),
                routingOrder: z.number().optional(),
              })
            )
            .describe("List of signers"),
          emailSubject: z.string().describe("Email subject for the signing request"),
          emailMessage: z.string().optional().describe("Email message body"),
        }),
        func: async ({
          documentName,
          documentContent,
          signers,
          emailSubject,
          emailMessage,
        }) => {
          try {
            const result = await this.service.executeTool(
              "DOCUSIGN_SEND_ENVELOPE",
              {
                documents: [
                  {
                    name: documentName,
                    documentBase64: documentContent,
                  },
                ],
                recipients: {
                  signers: signers.map((s, i) => ({
                    email: s.email,
                    name: s.name,
                    routingOrder: s.routingOrder || i + 1,
                  })),
                },
                emailSubject,
                emailBlurb: emailMessage,
                status: "sent",
              },
              { entityId }
            );
            return JSON.stringify(result);
          } catch (error) {
            return JSON.stringify({
              error:
                error instanceof Error ? error.message : "Failed to send for signature",
            });
          }
        },
      }),
    ];
  }

  /**
   * Get all tools for an agent including Composio and custom procurement tools
   */
  async getAllToolsForAgent(
    agentId: string,
    existingTools: any[] = [],
    entityId?: string
  ): Promise<any[]> {
    // Get Composio tools for this agent
    const composioTools = await this.getToolsForAgent(agentId, entityId);

    // Get custom procurement tools
    const procurementTools = this.createProcurementTools(entityId);

    // Merge all tools, avoiding duplicates by name
    const toolNames = new Set<string>();
    const allTools: any[] = [];

    for (const tool of [...existingTools, ...composioTools, ...procurementTools]) {
      const name = tool.name || tool.displayName;
      if (!toolNames.has(name)) {
        toolNames.add(name);
        allTools.push(tool);
      }
    }

    return allTools;
  }

  /**
   * Clear the tool cache
   */
  clearCache(): void {
    this.toolCache.clear();
  }
}

// Export singleton instance
export const composioLangGraphAdapter = new ComposioLangGraphAdapter();
