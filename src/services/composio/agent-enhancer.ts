/**
 * Composio Agent Enhancer
 *
 * Enhances existing LangGraph agents with Composio tools.
 * Provides a simple way to add external app integrations to any agent.
 */

import { ChatAnthropic } from "@langchain/anthropic";
import { DynamicStructuredTool, StructuredTool } from "@langchain/core/tools";
import { ComposioService, composioService } from "./service";
import { ComposioLangGraphAdapter, PHASE1_AGENT_TOOL_CONFIGS } from "./langgraph-adapter";
import { ToolCategory, composioToolProvider, TOOL_BUNDLES } from "./tool-provider";
import type { ProcurementAppName, GetToolsOptions } from "./types";

/**
 * Configuration for enhancing an agent with Composio tools
 */
export interface AgentEnhancementConfig {
  /** Agent identifier (e.g., "catalog-intelligence") */
  agentId: string;
  /** Entity ID for multi-tenant scenarios */
  entityId?: string;
  /** Override default tools for this agent */
  customApps?: ProcurementAppName[];
  /** Additional tool bundles to include */
  bundles?: (keyof typeof TOOL_BUNDLES)[];
  /** Include custom procurement tools */
  includeProcurementTools?: boolean;
  /** Filter tools by category */
  categories?: ToolCategory[];
}

/**
 * Result of enhancing an agent
 */
export interface EnhancedAgentResult {
  /** Original tools */
  originalTools: StructuredTool[];
  /** Composio tools added */
  composioTools: StructuredTool[];
  /** All tools combined */
  allTools: StructuredTool[];
  /** Model with all tools bound */
  modelWithTools: ReturnType<ChatAnthropic["bindTools"]>;
}

/**
 * Agent Enhancer class for adding Composio capabilities
 */
export class ComposioAgentEnhancer {
  private service: ComposioService;
  private adapter: ComposioLangGraphAdapter;

  constructor(service?: ComposioService) {
    this.service = service || composioService;
    this.adapter = new ComposioLangGraphAdapter(this.service);
  }

  /**
   * Enhance an agent with Composio tools
   */
  async enhance(
    model: ChatAnthropic,
    originalTools: StructuredTool[],
    config: AgentEnhancementConfig
  ): Promise<EnhancedAgentResult> {
    const composioTools: StructuredTool[] = [];

    // Get agent-specific tools from config
    if (PHASE1_AGENT_TOOL_CONFIGS[config.agentId]) {
      const agentTools = await this.adapter.getToolsForAgent(
        config.agentId,
        config.entityId
      );
      composioTools.push(...agentTools);
    }

    // Add tools from custom apps
    if (config.customApps?.length) {
      const customTools = await this.service.getLangGraphTools({
        apps: config.customApps,
        entityId: config.entityId,
      });
      composioTools.push(...customTools);
    }

    // Add tools from bundles
    if (config.bundles?.length) {
      const bundleTools = await composioToolProvider.getToolBundles(
        config.bundles,
        config.entityId
      );
      composioTools.push(...bundleTools);
    }

    // Add tools by category
    if (config.categories?.length) {
      for (const category of config.categories) {
        const categoryTools = await composioToolProvider.getToolsByCategory(
          category,
          config.entityId
        );
        composioTools.push(...categoryTools);
      }
    }

    // Add custom procurement tools
    if (config.includeProcurementTools !== false) {
      const procurementTools = this.adapter.createProcurementTools(config.entityId);
      composioTools.push(...procurementTools);
    }

    // Deduplicate tools by name
    const toolMap = new Map<string, StructuredTool>();
    for (const tool of [...originalTools, ...composioTools]) {
      if (!toolMap.has(tool.name)) {
        toolMap.set(tool.name, tool);
      }
    }

    const allTools = Array.from(toolMap.values());
    const modelWithTools = model.bindTools(allTools);

    return {
      originalTools,
      composioTools,
      allTools,
      modelWithTools,
    };
  }

  /**
   * Quick enhance for Phase 1 agents using default configs
   */
  async enhancePhase1Agent(
    agentId: string,
    model: ChatAnthropic,
    originalTools: StructuredTool[],
    entityId?: string
  ): Promise<EnhancedAgentResult> {
    return this.enhance(model, originalTools, {
      agentId,
      entityId,
      includeProcurementTools: true,
    });
  }

  /**
   * Get all Composio tools for an agent without enhancement
   */
  async getComposioToolsForAgent(
    agentId: string,
    entityId?: string
  ): Promise<StructuredTool[]> {
    return this.adapter.getAllToolsForAgent(agentId, [], entityId);
  }

  /**
   * Create an enhanced model with Composio tools
   */
  async createEnhancedModel(
    agentId: string,
    originalTools: StructuredTool[] = [],
    entityId?: string
  ): Promise<ReturnType<ChatAnthropic["bindTools"]>> {
    const model = new ChatAnthropic({
      modelName: "claude-sonnet-4-20250514",
      temperature: 0.3,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    });

    const result = await this.enhancePhase1Agent(
      agentId,
      model,
      originalTools,
      entityId
    );

    return result.modelWithTools;
  }
}

// Export singleton
export const composioAgentEnhancer = new ComposioAgentEnhancer();

/**
 * Helper function to quickly enhance any agent
 */
export async function enhanceAgentWithComposio(
  agentId: string,
  model: ChatAnthropic,
  tools: StructuredTool[],
  entityId?: string
): Promise<EnhancedAgentResult> {
  return composioAgentEnhancer.enhancePhase1Agent(agentId, model, tools, entityId);
}

/**
 * Helper function to get Composio tools for any agent
 */
export async function getComposioTools(
  options: GetToolsOptions = {}
): Promise<StructuredTool[]> {
  return composioService.getLangGraphTools(options);
}
