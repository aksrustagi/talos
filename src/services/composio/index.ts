/**
 * Composio Service
 *
 * Centralized service layer for Composio integration.
 * Provides 500+ app integrations for AI agents including:
 * - Gmail, Outlook (Email)
 * - Slack, Teams (Communication)
 * - Google Sheets, Notion (Productivity)
 * - Salesforce, HubSpot (CRM)
 * - GitHub, Jira, Linear (Development)
 *
 * Architecture: Centralized service for efficient:
 * - OAuth/authentication management
 * - Connection pooling
 * - Tool caching and reuse
 * - Cost optimization
 *
 * @see https://github.com/ComposioHQ/composio
 * @see https://docs.composio.dev
 */

// Core service
export { ComposioService, composioService, PROCUREMENT_TOOL_PRESETS } from "./service";

// Tool provider for organized tool access
export {
  ComposioToolProvider,
  composioToolProvider,
  ToolCategory,
  TOOL_BUNDLES,
} from "./tool-provider";

// LangGraph adapter for agent integration
export {
  ComposioLangGraphAdapter,
  composioLangGraphAdapter,
  PHASE1_AGENT_TOOL_CONFIGS,
} from "./langgraph-adapter";

// Agent enhancer for easy integration
export {
  ComposioAgentEnhancer,
  composioAgentEnhancer,
  enhanceAgentWithComposio,
  getComposioTools,
} from "./agent-enhancer";

// Types
export type {
  ComposioConfig,
  EntityConnection,
  ToolDefinition,
  ToolExecutionResult,
  ProcurementToolCategory,
  ProcurementAppName,
  GetToolsOptions,
  ExecuteToolOptions,
  InitiateConnectionOptions,
  ConnectionInitiationResult,
  ComposioWebhookEvent,
  ToolUsageMetrics,
} from "./types";

export type {
  AgentEnhancementConfig,
  EnhancedAgentResult,
} from "./agent-enhancer";
