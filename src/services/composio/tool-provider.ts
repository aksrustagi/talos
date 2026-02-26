/**
 * Composio Tool Provider
 *
 * Organizes and provides tools by category for procurement use cases.
 * Simplifies tool selection for different agent types.
 */

import { ComposioService, composioService } from "./service";
import type {
  ProcurementToolCategory,
  ProcurementAppName,
  ToolDefinition,
  GetToolsOptions,
} from "./types";

/**
 * Tool category enum for type-safe category selection
 */
export enum ToolCategory {
  EMAIL = "email",
  COMMUNICATION = "communication",
  SPREADSHEET = "spreadsheet",
  CRM = "crm",
  PROJECT = "project",
  CALENDAR = "calendar",
  STORAGE = "storage",
  FINANCE = "finance",
  ERP = "erp",
  E_SIGNATURE = "e-signature",
  ANALYTICS = "analytics",
  CUSTOM = "custom",
}

/**
 * Tool bundle - a collection of related tools for a specific use case
 */
export interface ToolBundle {
  name: string;
  description: string;
  categories: ToolCategory[];
  apps: ProcurementAppName[];
  tools: string[];
}

/**
 * Pre-configured tool bundles for common procurement scenarios
 */
export const TOOL_BUNDLES: Record<string, ToolBundle> = {
  vendorOnboarding: {
    name: "Vendor Onboarding",
    description: "Tools for onboarding new vendors",
    categories: [ToolCategory.EMAIL, ToolCategory.CRM, ToolCategory.STORAGE, ToolCategory.E_SIGNATURE],
    apps: ["GMAIL", "SALESFORCE", "GOOGLE_DRIVE", "DOCUSIGN"],
    tools: [
      "GMAIL_SEND_EMAIL",
      "SALESFORCE_CREATE_RECORD",
      "GOOGLE_DRIVE_CREATE_FOLDER",
      "DOCUSIGN_SEND_ENVELOPE",
    ],
  },
  purchaseRequest: {
    name: "Purchase Request",
    description: "Tools for processing purchase requests",
    categories: [ToolCategory.COMMUNICATION, ToolCategory.PROJECT, ToolCategory.SPREADSHEET],
    apps: ["SLACK", "JIRA", "GOOGLE_SHEETS"],
    tools: [
      "SLACK_SEND_MESSAGE",
      "JIRA_CREATE_ISSUE",
      "GOOGLE_SHEETS_APPEND_ROW",
    ],
  },
  invoiceProcessing: {
    name: "Invoice Processing",
    description: "Tools for processing and reconciling invoices",
    categories: [ToolCategory.FINANCE, ToolCategory.SPREADSHEET, ToolCategory.STORAGE],
    apps: ["QUICKBOOKS", "GOOGLE_SHEETS", "GOOGLE_DRIVE"],
    tools: [
      "QUICKBOOKS_CREATE_INVOICE",
      "GOOGLE_SHEETS_READ_SHEET",
      "GOOGLE_DRIVE_SEARCH_FILES",
    ],
  },
  contractManagement: {
    name: "Contract Management",
    description: "Tools for managing vendor contracts",
    categories: [ToolCategory.STORAGE, ToolCategory.E_SIGNATURE, ToolCategory.CALENDAR],
    apps: ["GOOGLE_DRIVE", "DOCUSIGN", "GOOGLE_CALENDAR"],
    tools: [
      "GOOGLE_DRIVE_UPLOAD_FILE",
      "DOCUSIGN_GET_ENVELOPE_STATUS",
      "GOOGLE_CALENDAR_CREATE_EVENT",
    ],
  },
  vendorCommunication: {
    name: "Vendor Communication",
    description: "Tools for communicating with vendors",
    categories: [ToolCategory.EMAIL, ToolCategory.CALENDAR],
    apps: ["GMAIL", "OUTLOOK", "GOOGLE_CALENDAR"],
    tools: [
      "GMAIL_SEND_EMAIL",
      "GMAIL_READ_EMAIL",
      "GOOGLE_CALENDAR_CREATE_EVENT",
    ],
  },
  spendAnalytics: {
    name: "Spend Analytics",
    description: "Tools for analyzing procurement spend",
    categories: [ToolCategory.SPREADSHEET, ToolCategory.ANALYTICS],
    apps: ["GOOGLE_SHEETS", "AIRTABLE"],
    tools: [
      "GOOGLE_SHEETS_READ_SHEET",
      "AIRTABLE_GET_RECORDS",
    ],
  },
  approvalWorkflow: {
    name: "Approval Workflow",
    description: "Tools for approval notifications and tracking",
    categories: [ToolCategory.COMMUNICATION, ToolCategory.PROJECT],
    apps: ["SLACK", "MICROSOFT_TEAMS", "JIRA"],
    tools: [
      "SLACK_SEND_MESSAGE",
      "MICROSOFT_TEAMS_SEND_MESSAGE",
      "JIRA_UPDATE_ISSUE",
    ],
  },
  complianceTracking: {
    name: "Compliance Tracking",
    description: "Tools for tracking and documenting compliance",
    categories: [ToolCategory.SPREADSHEET, ToolCategory.STORAGE, ToolCategory.PROJECT],
    apps: ["GOOGLE_SHEETS", "GOOGLE_DRIVE", "JIRA"],
    tools: [
      "GOOGLE_SHEETS_WRITE_SHEET",
      "GOOGLE_DRIVE_UPLOAD_FILE",
      "JIRA_CREATE_ISSUE",
    ],
  },
};

/**
 * Tool provider class for organized tool access
 */
export class ComposioToolProvider {
  private service: ComposioService;

  constructor(service?: ComposioService) {
    this.service = service || composioService;
  }

  /**
   * Get tools by category
   */
  async getToolsByCategory(
    category: ToolCategory,
    entityId?: string
  ): Promise<any[]> {
    return this.service.getLangGraphTools({
      category: category as ProcurementToolCategory,
      entityId,
    });
  }

  /**
   * Get tools by app name
   */
  async getToolsByApp(
    appName: ProcurementAppName,
    entityId?: string
  ): Promise<any[]> {
    return this.service.getLangGraphTools({
      apps: [appName],
      entityId,
    });
  }

  /**
   * Get tools from a pre-configured bundle
   */
  async getToolBundle(
    bundleName: keyof typeof TOOL_BUNDLES,
    entityId?: string
  ): Promise<any[]> {
    const bundle = TOOL_BUNDLES[bundleName];
    if (!bundle) {
      throw new Error(`Unknown tool bundle: ${bundleName}`);
    }

    return this.service.getLangGraphTools({
      toolNames: bundle.tools,
      entityId,
    });
  }

  /**
   * Get multiple tool bundles merged
   */
  async getToolBundles(
    bundleNames: (keyof typeof TOOL_BUNDLES)[],
    entityId?: string
  ): Promise<any[]> {
    const toolNames = new Set<string>();

    for (const bundleName of bundleNames) {
      const bundle = TOOL_BUNDLES[bundleName];
      if (bundle) {
        bundle.tools.forEach(tool => toolNames.add(tool));
      }
    }

    return this.service.getLangGraphTools({
      toolNames: Array.from(toolNames),
      entityId,
    });
  }

  /**
   * Get tool definitions (metadata only, not executable)
   */
  async getToolDefinitions(
    options: GetToolsOptions = {}
  ): Promise<ToolDefinition[]> {
    return this.service.getTools(options);
  }

  /**
   * Get all available bundles
   */
  getAvailableBundles(): typeof TOOL_BUNDLES {
    return TOOL_BUNDLES;
  }

  /**
   * Get all available categories
   */
  getAvailableCategories(): ToolCategory[] {
    return Object.values(ToolCategory);
  }

  /**
   * Check if tools from a category are available (connected)
   */
  async isCategoryAvailable(
    category: ToolCategory,
    entityId?: string
  ): Promise<boolean> {
    const apps = this.service.getAppsByCategory(category as ProcurementToolCategory);

    for (const app of apps) {
      if (await this.service.isAppConnected(app, entityId)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get recommended tools for a specific procurement task
   */
  async getToolsForTask(
    task: ProcurementTask,
    entityId?: string
  ): Promise<any[]> {
    const bundleMap: Record<ProcurementTask, (keyof typeof TOOL_BUNDLES)[]> = {
      "create-requisition": ["purchaseRequest"],
      "vendor-lookup": ["vendorCommunication", "spendAnalytics"],
      "send-rfq": ["vendorCommunication"],
      "process-approval": ["approvalWorkflow"],
      "match-invoice": ["invoiceProcessing"],
      "onboard-vendor": ["vendorOnboarding"],
      "manage-contract": ["contractManagement"],
      "analyze-spend": ["spendAnalytics"],
      "check-compliance": ["complianceTracking"],
      "schedule-meeting": ["vendorCommunication"],
    };

    const bundles = bundleMap[task] || [];
    return this.getToolBundles(bundles, entityId);
  }

  /**
   * Create a custom tool collection
   */
  async createCustomCollection(
    config: {
      categories?: ToolCategory[];
      apps?: ProcurementAppName[];
      toolNames?: string[];
    },
    entityId?: string
  ): Promise<any[]> {
    const allTools: any[] = [];
    const toolNames = new Set<string>();

    // Get tools by category
    if (config.categories?.length) {
      for (const category of config.categories) {
        const tools = await this.getToolsByCategory(category, entityId);
        for (const tool of tools) {
          if (!toolNames.has(tool.name)) {
            toolNames.add(tool.name);
            allTools.push(tool);
          }
        }
      }
    }

    // Get tools by app
    if (config.apps?.length) {
      const tools = await this.service.getLangGraphTools({
        apps: config.apps,
        entityId,
      });
      for (const tool of tools) {
        if (!toolNames.has(tool.name)) {
          toolNames.add(tool.name);
          allTools.push(tool);
        }
      }
    }

    // Get specific tools
    if (config.toolNames?.length) {
      const tools = await this.service.getLangGraphTools({
        toolNames: config.toolNames,
        entityId,
      });
      for (const tool of tools) {
        if (!toolNames.has(tool.name)) {
          toolNames.add(tool.name);
          allTools.push(tool);
        }
      }
    }

    return allTools;
  }
}

/**
 * Procurement task types
 */
export type ProcurementTask =
  | "create-requisition"
  | "vendor-lookup"
  | "send-rfq"
  | "process-approval"
  | "match-invoice"
  | "onboard-vendor"
  | "manage-contract"
  | "analyze-spend"
  | "check-compliance"
  | "schedule-meeting";

// Export singleton instance
export const composioToolProvider = new ComposioToolProvider();
