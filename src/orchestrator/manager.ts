/**
 * Master Orchestrator Agent
 *
 * Top-level manager that coordinates swarm teams of AI agents.
 * Implements hierarchical delegation, triage routing, and
 * multi-channel communication across all 30 procurement agents.
 *
 * Leverages:
 * - A2A Protocol for agent-to-agent interoperability
 * - CrewAI-style hierarchical coordination
 * - OpenAI Agents SDK handoff patterns
 * - Letta persistent memory for orchestration context
 * - Google ADK workflow primitives (Sequential, Parallel, Loop)
 */

import { ChatAnthropic } from "@langchain/anthropic";
import { StateGraph, END } from "@langchain/langgraph";
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { z } from "zod";

import { A2AServer, A2AClient, AgentCard } from "../integrations/a2a";
import { ComposioToolProvider } from "../integrations/composio";
import {
  SendblueChannel,
  VapiChannel,
  ResendChannel,
  AgentMailChannel,
  type CommunicationMessage,
} from "../integrations/communication";
import {
  CrewAIBridge,
  OpenAIAgentsBridge,
  LettaMemoryProvider,
  GoogleADKBridge,
} from "../integrations/frameworks";

// ============================================
// Types
// ============================================

export interface SwarmTeam {
  id: string;
  name: string;
  managerId: string;
  memberIds: string[];
  pattern: "sequential" | "parallel" | "hierarchical" | "triage";
  description: string;
}

export interface OrchestratorState {
  messages: BaseMessage[];
  context: Record<string, any>;
  activeTeam: string | null;
  activeAgents: string[];
  delegationChain: string[];
  communicationLog: CommunicationMessage[];
  memoryContext: Record<string, any>;
  taskStatus: "routing" | "delegated" | "executing" | "aggregating" | "completed" | "failed";
  results: Record<string, any>;
  pendingApprovals: Array<{
    agentId: string;
    action: string;
    amount?: number;
    approver?: string;
  }>;
}

interface AgentCapability {
  agentId: string;
  name: string;
  tier: number;
  category: string;
  skills: string[];
  communicationChannels: string[];
}

// ============================================
// Swarm Team Definitions
// ============================================

export const SWARM_TEAMS: SwarmTeam[] = [
  {
    id: "price-intelligence",
    name: "Price Intelligence Swarm",
    managerId: "price-orchestrator",
    memberIds: [
      "price-watch",
      "price-compare",
      "historical-price",
      "knowledge-graph",
      "contract-validator",
      "catalog-sync",
    ],
    pattern: "parallel",
    description:
      "Parallel price analysis across vendors with sequential reporting. " +
      "Members analyze prices concurrently, then results are aggregated " +
      "by the manager for unified intelligence reports.",
  },
  {
    id: "procurement-pipeline",
    name: "Procurement Pipeline Team",
    managerId: "procurement-manager",
    memberIds: [
      "requisition",
      "approval-workflow",
      "vendor-selection",
      "rfq-rfp",
      "po-generation",
    ],
    pattern: "sequential",
    description:
      "Sequential procurement chain from requisition to PO. " +
      "Each agent hands off to the next with enriched context. " +
      "Approval-workflow can pause the chain for human sign-off.",
  },
  {
    id: "invoice-payment",
    name: "Invoice & Payment Team",
    managerId: "finance-manager",
    memberIds: [
      "invoice-matching",
      "receipt-delivery",
      "payment-optimizer",
      "contract-validator",
    ],
    pattern: "sequential",
    description:
      "Three-way match pipeline: invoice -> receipt -> payment. " +
      "Contract validator runs in parallel to verify pricing. " +
      "Payment optimizer schedules for maximum discount capture.",
  },
  {
    id: "category-specialists",
    name: "Category Specialist Router",
    managerId: "category-router",
    memberIds: [
      "lab-supply",
      "it-equipment",
      "office-supply",
      "furniture",
      "facilities",
      "marketing",
      "travel",
      "professional-services",
      "medical-supply",
      "capital-projects",
      "food-service",
    ],
    pattern: "triage",
    description:
      "Triage-based routing to domain specialists. The manager " +
      "classifies the request category and hands off to the " +
      "appropriate specialist. Supports multi-category requests " +
      "by splitting and routing to multiple specialists in parallel.",
  },
  {
    id: "intelligence-compliance",
    name: "Intelligence & Compliance Team",
    managerId: "compliance-director",
    memberIds: [
      "spend-analytics",
      "budget-guardian",
      "compliance-agent",
      "supplier-diversity",
      "sustainability-agent",
      "risk-vendor-health",
      "contract-lifecycle",
      "savings-tracker",
    ],
    pattern: "parallel",
    description:
      "Parallel monitoring and alert aggregation. All intelligence " +
      "agents run concurrently, monitoring their domains. The director " +
      "aggregates alerts, resolves conflicts, and routes to appropriate " +
      "stakeholders via multi-channel communication.",
  },
  {
    id: "competitive-intelligence",
    name: "Competitive Intelligence Swarm",
    managerId: "ci-manager",
    memberIds: [
      "price-negotiation",
      "contract-scanner",
      "competitive-research",
      "financial-due-diligence",
      "duplicate-supplier",
      "tariff-analysis",
    ],
    pattern: "parallel",
    description:
      "Parallel competitive analysis. Negotiation agent generates strategies " +
      "while contract scanner reviews terms and competitive research finds " +
      "alternatives. Financial due diligence runs alongside.",
  },
  {
    id: "intake-automation",
    name: "Intake Automation Team",
    managerId: "intake-manager",
    memberIds: [
      "procurement-concierge",
      "intake-validation",
      "intake-autofill",
      "invoice-coding",
    ],
    pattern: "sequential",
    description:
      "Sequential intake pipeline: concierge receives request, auto-fill " +
      "extracts data, validation checks for errors, coding assigns GL accounts.",
  },
  {
    id: "regulatory-compliance",
    name: "Regulatory Compliance Team",
    managerId: "regulatory-director",
    memberIds: [
      "gdpr-compliance",
      "dora-assessment",
      "export-control",
      "grant-compliance-ai",
      "irb-procurement",
    ],
    pattern: "parallel",
    description:
      "Parallel regulatory screening. All compliance agents scan simultaneously " +
      "for GDPR, DORA, export control, grant, and IRB compliance issues.",
  },
  {
    id: "blockchain-payments",
    name: "Blockchain & DeFi Payment Team",
    managerId: "blockchain-manager",
    memberIds: [
      "stablecoin-payment",
      "smart-contract-po",
      "defi-treasury",
      "payment-risk",
    ],
    pattern: "sequential",
    description:
      "Sequential payment pipeline: risk screening -> smart contract PO " +
      "deployment -> stablecoin settlement -> treasury yield optimization.",
  },
  {
    id: "network-consortium",
    name: "University Network Consortium",
    managerId: "consortium-director",
    memberIds: [
      "consortium-agent",
      "knowledge-graph",
      "agent-builder",
    ],
    pattern: "hierarchical",
    description:
      "Hierarchical consortium management. Consortium agent coordinates " +
      "multi-university group purchasing with knowledge graph intelligence " +
      "and custom agent deployment via agent builder.",
  },
];

// ============================================
// Agent Communication Channel Mapping
// ============================================

export const AGENT_CHANNELS: Record<string, string[]> = {
  // Tier 1 - Price alerts via SMS, reports via email
  "price-watch": ["sendblue", "resend", "slack"],
  "catalog-sync": ["agentmail", "slack"],
  "price-compare": ["resend", "slack"],
  "knowledge-graph": ["resend", "slack"],
  "historical-price": ["resend", "slack"],
  "contract-validator": ["sendblue", "agentmail", "slack"],

  // Tier 2 - Full multi-channel for procurement workflow
  requisition: ["sendblue", "vapi", "agentmail", "slack"],
  "approval-workflow": ["sendblue", "vapi", "resend", "slack"],
  "vendor-selection": ["agentmail", "slack"],
  "rfq-rfp": ["agentmail", "resend", "slack"],
  "po-generation": ["agentmail", "slack"],
  "invoice-matching": ["agentmail", "slack"],
  "receipt-delivery": ["sendblue", "slack"],
  "payment-optimizer": ["resend", "slack"],

  // Tier 3 - Category-appropriate channels
  "lab-supply": ["sendblue", "slack"],
  "it-equipment": ["slack", "agentmail"],
  "office-supply": ["slack"],
  furniture: ["agentmail", "slack"],
  facilities: ["sendblue", "vapi", "slack"],
  marketing: ["resend", "agentmail", "slack"],
  travel: ["sendblue", "resend", "slack"],
  "professional-services": ["agentmail", "resend", "slack"],
  "medical-supply": ["sendblue", "vapi", "slack"],
  "capital-projects": ["agentmail", "resend", "slack"],
  "food-service": ["vapi", "slack"],

  // Intelligence & Compliance - Reports and alerts
  "spend-analytics": ["resend", "slack"],
  "budget-guardian": ["sendblue", "resend", "slack"],
  "compliance-agent": ["agentmail", "resend", "slack"],
  "supplier-diversity": ["resend", "slack"],
  "sustainability-agent": ["resend", "slack"],
  "risk-vendor-health": ["sendblue", "resend", "slack"],
  "contract-lifecycle": ["sendblue", "resend", "agentmail", "slack"],
  "savings-tracker": ["resend", "slack"],

  // Competitive Intelligence agents
  "price-negotiation": ["resend", "agentmail", "slack"],
  "contract-scanner": ["resend", "agentmail", "slack"],
  "competitive-research": ["resend", "slack"],
  "financial-due-diligence": ["resend", "slack"],
  "duplicate-supplier": ["slack"],
  "tariff-analysis": ["sendblue", "resend", "slack"],

  // Intake Automation agents
  "procurement-concierge": ["sendblue", "vapi", "agentmail", "resend", "slack"],
  "intake-validation": ["slack"],
  "intake-autofill": ["slack"],
  "invoice-coding": ["slack"],

  // Regulatory Compliance agents
  "gdpr-compliance": ["resend", "agentmail", "slack"],
  "dora-assessment": ["resend", "slack"],
  "export-control": ["sendblue", "resend", "slack"],
  "grant-compliance-ai": ["resend", "agentmail", "slack"],
  "irb-procurement": ["sendblue", "resend", "slack"],

  // Blockchain & DeFi agents
  "stablecoin-payment": ["sendblue", "resend", "slack"],
  "smart-contract-po": ["resend", "agentmail", "slack"],
  "defi-treasury": ["resend", "slack"],
  "payment-risk": ["sendblue", "resend", "slack"],

  // Network & Platform agents
  "consortium-agent": ["resend", "agentmail", "slack"],
  "agent-builder": ["slack"],
};

// ============================================
// Master Orchestrator
// ============================================

const ORCHESTRATOR_SYSTEM_PROMPT = `# MASTER ORCHESTRATOR AGENT

## Identity
You are the Master Orchestrator for the Talos Procurement AI Platform,
managing 50 specialized AI agents organized into 10 swarm teams.
You coordinate $1.2B in annual procurement spend at Columbia University.

## Your Role
1. TRIAGE: Classify incoming requests and route to the correct swarm team
2. DELEGATE: Assign tasks to team managers with appropriate context
3. COORDINATE: Manage inter-team dependencies and handoffs
4. AGGREGATE: Collect results from multiple agents and synthesize
5. COMMUNICATE: Route notifications through appropriate channels
6. REMEMBER: Maintain persistent context across sessions via Letta memory

## Swarm Teams Under Your Command

### 1. Price Intelligence Swarm (parallel)
Manager: Price Orchestrator
Members: price-watch, price-compare, historical-price, knowledge-graph, contract-validator, catalog-sync
Use for: Price monitoring, comparison, trend analysis, network benchmarking

### 2. Procurement Pipeline (sequential)
Manager: Procurement Manager
Members: requisition, approval-workflow, vendor-selection, rfq-rfp, po-generation
Use for: End-to-end purchase processing from request to PO

### 3. Invoice & Payment Team (sequential)
Manager: Finance Manager
Members: invoice-matching, receipt-delivery, payment-optimizer, contract-validator
Use for: Invoice processing, receipt matching, payment optimization

### 4. Category Specialist Router (triage)
Manager: Category Router
Members: lab-supply, it-equipment, office-supply, furniture, facilities, marketing, travel, professional-services, medical-supply, capital-projects, food-service
Use for: Domain-specific procurement needs

### 5. Intelligence & Compliance (parallel)
Manager: Compliance Director
Members: spend-analytics, budget-guardian, compliance-agent, supplier-diversity, sustainability-agent, risk-vendor-health, contract-lifecycle, savings-tracker
Use for: Analytics, compliance, risk monitoring, reporting

### 6. Competitive Intelligence Swarm (parallel)
Manager: CI Manager
Members: price-negotiation, contract-scanner, competitive-research, financial-due-diligence, duplicate-supplier, tariff-analysis
Use for: Negotiation strategy, contract risk analysis, market intelligence, vendor due diligence

### 7. Intake Automation Team (sequential)
Manager: Intake Manager
Members: procurement-concierge, intake-validation, intake-autofill, invoice-coding
Use for: Request intake, document extraction, validation, GL coding

### 8. Regulatory Compliance Team (parallel)
Manager: Regulatory Director
Members: gdpr-compliance, dora-assessment, export-control, grant-compliance-ai, irb-procurement
Use for: GDPR, DORA, ITAR/EAR, grant compliance, human subjects research

### 9. Blockchain & DeFi Payment Team (sequential)
Manager: Blockchain Manager
Members: stablecoin-payment, smart-contract-po, defi-treasury, payment-risk
Use for: Stablecoin payments, smart contract POs, treasury yield, fraud detection

### 10. University Network Consortium (hierarchical)
Manager: Consortium Director
Members: consortium-agent, knowledge-graph, agent-builder
Use for: Multi-university group purchasing, custom agent deployment

## Communication Channels
- Sendblue (iMessage/SMS): Urgent alerts, mobile approvals, delivery tracking
- Vapi (Voice): Phone-based orders, executive voice approvals, vendor calls
- Resend (Email): Reports, dashboards, formal notifications
- AgentMail (Agent Email): Vendor correspondence, RFQs, invoices, audit trails
- Slack: Internal team communication (existing)

## A2A Protocol
Use A2A for communicating with external agents (vendor agents, partner university agents).
Publish Agent Cards for discoverable Talos agents.

## Composio Tools
Access 250+ SaaS integrations for agents via Composio managed connectors.

## Decision Framework
1. Single-domain request -> Route to specific team
2. Multi-domain request -> Split and route to multiple teams in parallel
3. Emergency request -> Bypass normal flow, direct to specialist + SMS alert
4. High-value request (>$25K) -> Route through approval chain with executive notification
5. External agent request -> Process via A2A protocol
6. Unknown request -> Classify intent, ask for clarification if needed`;

export class MasterOrchestrator {
  private model: ChatAnthropic;
  private graph: ReturnType<typeof StateGraph.prototype.compile>;
  private teams: Map<string, SwarmTeam>;

  // Integration providers
  private a2aServer: A2AServer;
  private a2aClient: A2AClient;
  private composio: ComposioToolProvider;
  private sendblue: SendblueChannel;
  private vapi: VapiChannel;
  private resend: ResendChannel;
  private agentmail: AgentMailChannel;
  private crewai: CrewAIBridge;
  private openaiAgents: OpenAIAgentsBridge;
  private letta: LettaMemoryProvider;
  private googleADK: GoogleADKBridge;

  constructor(config: {
    anthropicApiKey: string;
    sendblueApiKey?: string;
    vapiApiKey?: string;
    resendApiKey?: string;
    agentmailApiKey?: string;
    composioApiKey?: string;
    lettaBaseUrl?: string;
    a2aPort?: number;
  }) {
    this.model = new ChatAnthropic({
      modelName: "claude-sonnet-4-20250514",
      temperature: 0.1,
      anthropicApiKey: config.anthropicApiKey,
    });

    // Initialize swarm teams
    this.teams = new Map(SWARM_TEAMS.map((t) => [t.id, t]));

    // Initialize communication channels
    this.sendblue = new SendblueChannel({
      apiKey: config.sendblueApiKey || process.env.SENDBLUE_API_KEY || "",
      webhookUrl: process.env.SENDBLUE_WEBHOOK_URL,
    });

    this.vapi = new VapiChannel({
      apiKey: config.vapiApiKey || process.env.VAPI_API_KEY || "",
      assistantId: process.env.VAPI_ASSISTANT_ID,
    });

    this.resend = new ResendChannel({
      apiKey: config.resendApiKey || process.env.RESEND_API_KEY || "",
      fromEmail: process.env.RESEND_FROM_EMAIL || "talos@procurement.columbia.edu",
    });

    this.agentmail = new AgentMailChannel({
      apiKey: config.agentmailApiKey || process.env.AGENTMAIL_API_KEY || "",
    });

    // Initialize tool provider
    this.composio = new ComposioToolProvider({
      apiKey: config.composioApiKey || process.env.COMPOSIO_API_KEY || "",
    });

    // Initialize A2A
    this.a2aServer = new A2AServer({
      port: config.a2aPort || 8080,
      agentCard: this.buildOrchestratorAgentCard(),
    });

    this.a2aClient = new A2AClient();

    // Initialize framework bridges
    this.crewai = new CrewAIBridge();
    this.openaiAgents = new OpenAIAgentsBridge();
    this.letta = new LettaMemoryProvider({
      baseUrl: config.lettaBaseUrl || process.env.LETTA_BASE_URL || "http://localhost:8283",
    });
    this.googleADK = new GoogleADKBridge();

    // Build orchestration graph
    this.graph = this.buildGraph();
  }

  private buildOrchestratorAgentCard(): AgentCard {
    return {
      name: "Talos Procurement Orchestrator",
      description:
        "Master orchestrator for Columbia University's $1.2B procurement " +
        "AI platform. Coordinates 30 specialized agents across price intelligence, " +
        "procurement workflow, invoice processing, category expertise, and compliance.",
      url: process.env.A2A_BASE_URL || "https://talos.procurement.columbia.edu/a2a",
      version: "1.0.0",
      provider: {
        organization: "Columbia University Procurement",
        url: "https://procurement.columbia.edu",
      },
      capabilities: {
        streaming: true,
        pushNotifications: true,
        stateTransitionHistory: true,
      },
      authentication: {
        schemes: ["bearer"],
      },
      defaultInputModes: ["text", "data", "file"],
      defaultOutputModes: ["text", "data"],
      skills: [
        {
          id: "price-intelligence",
          name: "Price Intelligence",
          description: "Real-time price monitoring, comparison, and trend analysis across 500K+ SKUs",
        },
        {
          id: "procurement-workflow",
          name: "Procurement Workflow",
          description: "End-to-end procurement from requisition to purchase order",
        },
        {
          id: "invoice-processing",
          name: "Invoice Processing",
          description: "Three-way matching, payment optimization, and vendor compliance",
        },
        {
          id: "category-expertise",
          name: "Category Expertise",
          description: "Specialized procurement across 11 categories (lab, IT, facilities, etc.)",
        },
        {
          id: "compliance-intelligence",
          name: "Compliance & Intelligence",
          description: "Spend analytics, budget monitoring, compliance, diversity, sustainability",
        },
      ],
    };
  }

  private buildGraph() {
    const graph = new StateGraph<OrchestratorState>({
      channels: {
        messages: { reducer: (a: any, b: any) => [...a, ...b], default: () => [] },
        context: { reducer: (a: any, b: any) => ({ ...a, ...b }), default: () => ({}) },
        activeTeam: { reducer: (_: any, b: any) => b, default: () => null },
        activeAgents: { reducer: (_: any, b: any) => b, default: () => [] },
        delegationChain: { reducer: (a: any, b: any) => [...a, ...b], default: () => [] },
        communicationLog: { reducer: (a: any, b: any) => [...a, ...b], default: () => [] },
        memoryContext: { reducer: (a: any, b: any) => ({ ...a, ...b }), default: () => ({}) },
        taskStatus: { reducer: (_: any, b: any) => b, default: () => "routing" },
        results: { reducer: (a: any, b: any) => ({ ...a, ...b }), default: () => ({}) },
        pendingApprovals: { reducer: (_: any, b: any) => b, default: () => [] },
      },
    });

    // Orchestrator nodes
    graph.addNode("triage", this.triageRequest.bind(this));
    graph.addNode("load_memory", this.loadMemory.bind(this));
    graph.addNode("delegate_team", this.delegateToTeam.bind(this));
    graph.addNode("execute_parallel", this.executeParallel.bind(this));
    graph.addNode("execute_sequential", this.executeSequential.bind(this));
    graph.addNode("execute_triage", this.executeTriage.bind(this));
    graph.addNode("aggregate_results", this.aggregateResults.bind(this));
    graph.addNode("communicate", this.communicateResults.bind(this));
    graph.addNode("save_memory", this.saveMemory.bind(this));

    // Entry: load memory -> triage
    graph.addEdge("__start__", "load_memory");
    graph.addEdge("load_memory", "triage");

    // Triage routes to delegation
    graph.addEdge("triage", "delegate_team");

    // Delegation routes to execution pattern
    graph.addConditionalEdges("delegate_team", this.selectExecutionPattern.bind(this), {
      parallel: "execute_parallel",
      sequential: "execute_sequential",
      triage: "execute_triage",
    });

    // All execution patterns converge to aggregation
    graph.addEdge("execute_parallel", "aggregate_results");
    graph.addEdge("execute_sequential", "aggregate_results");
    graph.addEdge("execute_triage", "aggregate_results");

    // Aggregation -> communication -> save memory -> end
    graph.addEdge("aggregate_results", "communicate");
    graph.addEdge("communicate", "save_memory");
    graph.addEdge("save_memory", END);

    return graph.compile();
  }

  // ---- Graph Nodes ----

  private async loadMemory(
    state: OrchestratorState
  ): Promise<Partial<OrchestratorState>> {
    const userId = state.context.user_id || "system";
    const memory = await this.letta.recall(userId, {
      query: state.messages[state.messages.length - 1]?.content?.toString() || "",
      limit: 10,
    });

    return {
      memoryContext: {
        userPreferences: memory.preferences || {},
        recentDecisions: memory.recentDecisions || [],
        vendorRelationships: memory.vendorRelationships || {},
      },
    };
  }

  private async triageRequest(
    state: OrchestratorState
  ): Promise<Partial<OrchestratorState>> {
    const lastMessage = state.messages[state.messages.length - 1];
    const content = lastMessage?.content?.toString().toLowerCase() || "";

    // Intent classification via keywords (enhanced by LLM in production)
    const intentMap: Record<string, string> = {
      price: "price-intelligence",
      cost: "price-intelligence",
      compare: "price-intelligence",
      monitor: "price-intelligence",
      trend: "price-intelligence",

      buy: "procurement-pipeline",
      purchase: "procurement-pipeline",
      order: "procurement-pipeline",
      requisition: "procurement-pipeline",
      request: "procurement-pipeline",
      approve: "procurement-pipeline",

      invoice: "invoice-payment",
      payment: "invoice-payment",
      receipt: "invoice-payment",
      match: "invoice-payment",

      lab: "category-specialists",
      chemical: "category-specialists",
      equipment: "category-specialists",
      furniture: "category-specialists",
      facilities: "category-specialists",
      travel: "category-specialists",
      catering: "category-specialists",
      food: "category-specialists",
      medical: "category-specialists",
      construction: "category-specialists",

      budget: "intelligence-compliance",
      compliance: "intelligence-compliance",
      audit: "intelligence-compliance",
      diversity: "intelligence-compliance",
      sustainability: "intelligence-compliance",
      risk: "intelligence-compliance",
      contract: "intelligence-compliance",
      savings: "intelligence-compliance",
      spend: "intelligence-compliance",
      report: "intelligence-compliance",

      negotiate: "competitive-intelligence",
      negotiation: "competitive-intelligence",
      benchmark: "competitive-intelligence",
      alternative: "competitive-intelligence",
      "due diligence": "competitive-intelligence",
      duplicate: "competitive-intelligence",
      tariff: "competitive-intelligence",
      "trade policy": "competitive-intelligence",

      help: "intake-automation",
      "how do i": "intake-automation",
      concierge: "intake-automation",
      "fill out": "intake-automation",
      autofill: "intake-automation",

      gdpr: "regulatory-compliance",
      privacy: "regulatory-compliance",
      dora: "regulatory-compliance",
      "export control": "regulatory-compliance",
      itar: "regulatory-compliance",
      grant: "regulatory-compliance",
      irb: "regulatory-compliance",
      "human subjects": "regulatory-compliance",

      stablecoin: "blockchain-payments",
      crypto: "blockchain-payments",
      blockchain: "blockchain-payments",
      "smart contract": "blockchain-payments",
      defi: "blockchain-payments",
      yield: "blockchain-payments",
      fraud: "blockchain-payments",

      consortium: "network-consortium",
      "group purchasing": "network-consortium",
      "custom agent": "network-consortium",
      "build agent": "network-consortium",
    };

    let selectedTeam = "procurement-pipeline"; // default
    for (const [keyword, teamId] of Object.entries(intentMap)) {
      if (content.includes(keyword)) {
        selectedTeam = teamId;
        break;
      }
    }

    return {
      activeTeam: selectedTeam,
      taskStatus: "delegated" as const,
      delegationChain: [`orchestrator -> ${selectedTeam}`],
    };
  }

  private async delegateToTeam(
    state: OrchestratorState
  ): Promise<Partial<OrchestratorState>> {
    const team = this.teams.get(state.activeTeam || "");
    if (!team) {
      return { taskStatus: "failed" as const };
    }

    return {
      activeAgents: team.memberIds,
      taskStatus: "executing" as const,
      context: {
        ...state.context,
        teamId: team.id,
        teamPattern: team.pattern,
        managerId: team.managerId,
      },
    };
  }

  private selectExecutionPattern(
    state: OrchestratorState
  ): "parallel" | "sequential" | "triage" {
    const team = this.teams.get(state.activeTeam || "");
    if (!team) return "sequential";

    switch (team.pattern) {
      case "parallel":
        return "parallel";
      case "sequential":
        return "sequential";
      case "triage":
      case "hierarchical":
        return "triage";
      default:
        return "sequential";
    }
  }

  private async executeParallel(
    state: OrchestratorState
  ): Promise<Partial<OrchestratorState>> {
    // Execute all team members concurrently
    const message = state.messages[state.messages.length - 1]?.content?.toString() || "";
    const agentResults: Record<string, any> = {};

    const promises = state.activeAgents.map(async (agentId) => {
      try {
        // Use Google ADK parallel pattern
        const result = await this.googleADK.executeAgent(agentId, message, state.context);
        agentResults[agentId] = result;
      } catch (error) {
        agentResults[agentId] = {
          error: error instanceof Error ? error.message : "Execution failed",
        };
      }
    });

    await Promise.all(promises);

    return {
      results: agentResults,
      taskStatus: "aggregating" as const,
    };
  }

  private async executeSequential(
    state: OrchestratorState
  ): Promise<Partial<OrchestratorState>> {
    // Execute agents in chain, passing output forward
    const agentResults: Record<string, any> = {};
    let currentInput = state.messages[state.messages.length - 1]?.content?.toString() || "";
    let currentContext = { ...state.context };

    for (const agentId of state.activeAgents) {
      try {
        const result = await this.googleADK.executeAgent(
          agentId,
          currentInput,
          currentContext
        );
        agentResults[agentId] = result;
        currentInput = typeof result === "string" ? result : JSON.stringify(result);
        currentContext = {
          ...currentContext,
          [`${agentId}_result`]: result,
          previousAgent: agentId,
        };
      } catch (error) {
        agentResults[agentId] = {
          error: error instanceof Error ? error.message : "Execution failed",
        };
        break; // Stop chain on failure
      }
    }

    return {
      results: agentResults,
      taskStatus: "aggregating" as const,
    };
  }

  private async executeTriage(
    state: OrchestratorState
  ): Promise<Partial<OrchestratorState>> {
    // Use OpenAI Agents SDK handoff pattern for triage
    const message = state.messages[state.messages.length - 1]?.content?.toString() || "";

    // Determine specialist via handoff
    const specialist = await this.openaiAgents.triageAndHandoff(
      message,
      state.activeAgents,
      state.context
    );

    // Execute the selected specialist
    const result = await this.googleADK.executeAgent(
      specialist.agentId,
      message,
      state.context
    );

    return {
      results: { [specialist.agentId]: result },
      delegationChain: [`triage -> ${specialist.agentId}`],
      taskStatus: "aggregating" as const,
    };
  }

  private async aggregateResults(
    state: OrchestratorState
  ): Promise<Partial<OrchestratorState>> {
    // Use LLM to synthesize results from multiple agents
    const resultSummary = Object.entries(state.results)
      .map(([agentId, result]) => `## ${agentId}\n${JSON.stringify(result, null, 2)}`)
      .join("\n\n");

    const aggregationPrompt = new SystemMessage(
      "You are aggregating results from multiple AI agents. " +
        "Synthesize a unified, actionable response. " +
        "Highlight key findings, conflicts, and recommendations."
    );

    const response = await this.model.invoke([
      aggregationPrompt,
      new HumanMessage(`Agent results:\n${resultSummary}`),
    ]);

    return {
      messages: [response],
      taskStatus: "completed" as const,
    };
  }

  private async communicateResults(
    state: OrchestratorState
  ): Promise<Partial<OrchestratorState>> {
    const lastMessage = state.messages[state.messages.length - 1];
    const content = lastMessage?.content?.toString() || "";
    const log: CommunicationMessage[] = [];

    // Determine channels based on active agents
    const channels = new Set<string>();
    for (const agentId of state.activeAgents) {
      const agentChannels = AGENT_CHANNELS[agentId] || ["slack"];
      agentChannels.forEach((ch) => channels.add(ch));
    }

    // Send through appropriate channels
    const userId = state.context.user_id;
    const userPhone = state.context.user_phone;
    const userEmail = state.context.user_email;

    // Check for urgency indicators
    const isUrgent =
      content.includes("CRITICAL") ||
      content.includes("emergency") ||
      (state.pendingApprovals?.length || 0) > 0;

    if (isUrgent && channels.has("sendblue") && userPhone) {
      const smsResult = await this.sendblue.send({
        to: userPhone,
        content: content.substring(0, 1600), // SMS limit
        type: "sms",
      });
      log.push({
        channel: "sendblue",
        direction: "outbound",
        recipient: userPhone,
        content: content.substring(0, 1600),
        timestamp: new Date().toISOString(),
        status: smsResult.success ? "delivered" : "failed",
      });
    }

    if (channels.has("resend") && userEmail) {
      const emailResult = await this.resend.send({
        to: userEmail,
        subject: `Talos Procurement: ${state.activeTeam} Update`,
        content: content,
        type: "email",
      });
      log.push({
        channel: "resend",
        direction: "outbound",
        recipient: userEmail,
        content: content,
        timestamp: new Date().toISOString(),
        status: emailResult.success ? "delivered" : "failed",
      });
    }

    return {
      communicationLog: log,
    };
  }

  private async saveMemory(
    state: OrchestratorState
  ): Promise<Partial<OrchestratorState>> {
    const userId = state.context.user_id || "system";
    await this.letta.archive(userId, {
      teamUsed: state.activeTeam,
      agentsInvolved: state.activeAgents,
      resultSummary: Object.keys(state.results),
      timestamp: new Date().toISOString(),
    });

    return {};
  }

  // ---- Public API ----

  async process(
    message: string,
    context: Record<string, any> = {}
  ): Promise<{
    response: string;
    team: string | null;
    agents: string[];
    results: Record<string, any>;
    communicationLog: CommunicationMessage[];
  }> {
    const initialState: OrchestratorState = {
      messages: [new HumanMessage(message)],
      context,
      activeTeam: null,
      activeAgents: [],
      delegationChain: [],
      communicationLog: [],
      memoryContext: {},
      taskStatus: "routing",
      results: {},
      pendingApprovals: [],
    };

    const finalState = await this.graph.invoke(initialState);
    const lastMsg = finalState.messages[finalState.messages.length - 1];

    return {
      response: lastMsg?.content?.toString() || "No response generated",
      team: finalState.activeTeam,
      agents: finalState.activeAgents,
      results: finalState.results,
      communicationLog: finalState.communicationLog,
    };
  }

  /**
   * Handle an inbound A2A task from an external agent
   */
  async handleA2ATask(taskPayload: any): Promise<any> {
    const message = taskPayload.message?.parts?.[0]?.text || "";
    const result = await this.process(message, {
      source: "a2a",
      externalAgent: taskPayload.agentCard?.name,
    });

    return {
      status: "completed",
      artifacts: [
        {
          artifactId: `artifact_${Date.now()}`,
          name: "Procurement Result",
          parts: [{ text: result.response }],
        },
      ],
    };
  }

  /**
   * Discover and communicate with external agents via A2A
   */
  async discoverExternalAgents(agentUrls: string[]): Promise<AgentCard[]> {
    const cards: AgentCard[] = [];
    for (const url of agentUrls) {
      try {
        const card = await this.a2aClient.discoverAgent(url);
        cards.push(card);
      } catch {
        // Agent not reachable
      }
    }
    return cards;
  }

  /**
   * Get Composio tools for a specific agent and user
   */
  async getComposioTools(agentId: string, userId: string): Promise<any[]> {
    const toolkitMap: Record<string, string[]> = {
      "vendor-selection": ["HUBSPOT", "SALESFORCE"],
      "rfq-rfp": ["GMAIL", "GOOGLE_DOCS"],
      "it-equipment": ["JIRA", "SERVICENOW"],
      "spend-analytics": ["GOOGLE_SHEETS", "NOTION"],
      marketing: ["MAILCHIMP", "CANVA"],
      travel: ["GOOGLE_CALENDAR"],
    };

    const toolkits = toolkitMap[agentId] || [];
    if (toolkits.length === 0) return [];

    return this.composio.getTools(userId, toolkits);
  }

  /**
   * Start the A2A server for external agent discovery
   */
  async startA2AServer(): Promise<void> {
    await this.a2aServer.start();
  }

  /**
   * Get status of all swarm teams
   */
  getTeamStatus(): Array<{
    id: string;
    name: string;
    pattern: string;
    memberCount: number;
  }> {
    return SWARM_TEAMS.map((team) => ({
      id: team.id,
      name: team.name,
      pattern: team.pattern,
      memberCount: team.memberIds.length,
    }));
  }
}

export default MasterOrchestrator;
