# Talos AI Agent Audit Report

**Date:** 2026-02-14
**Scope:** Full audit of 30 AI agents across 3 tiers + integration gap analysis
**Platform:** Talos Procurement AI ($1.2B Columbia University)

---

## Executive Summary

Talos currently operates **30 specialized AI agents** organized in 3 tiers, orchestrated via LangGraph (TypeScript), a Python AgentFactory/AgentOrchestrator, and Temporal durable workflows. This audit identifies critical gaps in agent interoperability, external communication, and swarm coordination -- and prescribes 7 state-of-the-art integrations to close them.

---

## 1. Current Agent Inventory

### Tier 1: Core Price Intelligence (6 agents)

| Agent ID | Name | Status | Gaps |
|----------|------|--------|------|
| `price-watch` | PriceWatch Agent | Active | No A2A card, no voice/SMS alerts |
| `catalog-sync` | Catalog Sync Agent | Active | No Composio connectors for vendor APIs |
| `price-compare` | Price Compare Agent | Active | No cross-agent delegation protocol |
| `knowledge-graph` | Knowledge Graph Builder | Active | No persistent memory (Letta) |
| `historical-price` | Historical Price Agent | Active | No A2A discovery for network peers |
| `contract-validator` | Contract Price Validator | Active | No email/SMS notification channel |

### Tier 2: Procurement Process (8 agents)

| Agent ID | Name | Status | Gaps |
|----------|------|--------|------|
| `requisition` | Requisition Agent | Active | No iMessage/SMS intake (Sendblue) |
| `approval-workflow` | Approval Workflow Agent | Active | No voice approvals (Vapi), no email (AgentMail) |
| `vendor-selection` | Vendor Selection Agent | Active | No Composio CRM connectors |
| `rfq-rfp` | RFQ/RFP Agent | Active | No agent email (AgentMail) for vendor comms |
| `po-generation` | PO Generation Agent | Active | No A2A handoff to vendor agents |
| `invoice-matching` | Invoice Matching Agent | Active | No OCR via Composio tools |
| `receipt-delivery` | Receipt & Delivery Agent | Active | No SMS delivery alerts (Sendblue) |
| `payment-optimizer` | Payment Optimization Agent | Active | No cross-framework interop |

### Tier 3: Category Specialists + Intelligence (16 agents)

| Agent ID | Name | Status | Gaps |
|----------|------|--------|------|
| `lab-supply` | Lab Supply Agent | Active | No persistent memory for researcher prefs |
| `it-equipment` | IT Equipment Agent | Active | No Composio for IT service desk tools |
| `office-supply` | Office Supply Agent | Active | No demand prediction via Letta memory |
| `furniture` | Furniture Agent | Active | No voice ordering (Vapi) |
| `facilities` | Facilities Agent | Active | No emergency SMS alerts (Sendblue) |
| `marketing` | Marketing & Events Agent | Active | No email campaigns (Resend) |
| `travel` | Travel & Conference Agent | Active | No Composio booking tool integrations |
| `professional-services` | Professional Services Agent | Active | No A2A for external consultant agents |
| `medical-supply` | Medical Supply Agent | Active | No urgent recall SMS (Sendblue) |
| `capital-projects` | Capital Projects Agent | Active | No contractor email comms (AgentMail) |
| `food-service` | Food Service Agent | Active | No supplier voice ordering (Vapi) |
| `spend-analytics` | Spend Analytics Agent | Active | No Resend for executive email reports |
| `budget-guardian` | Budget Guardian Agent | Active | No multi-channel overspend alerts |
| `compliance-agent` | Compliance Agent | Active | No audit trail email (AgentMail) |
| `supplier-diversity` | Supplier Diversity Agent | Active | No Composio for certification DBs |
| `sustainability-agent` | Sustainability Agent | Active | No ESG reporting email (Resend) |
| `risk-vendor-health` | Risk & Vendor Health Agent | Active | No persistent memory (Letta) |
| `contract-lifecycle` | Contract Lifecycle Agent | Active | No renewal SMS/email alerts |
| `savings-tracker` | Savings Tracker Agent | Active | No executive email reports (Resend) |

---

## 2. Required Integrations: 7 State-of-the-Art Tools

### Tool 1: A2A Protocol (Google/Linux Foundation)
**Purpose:** Agent-to-agent interoperability standard
**Why:** Enables Talos agents to communicate with external vendor agents, partner university agents, and third-party service agents using a standardized protocol (JSON-RPC 2.0 over HTTPS).
**Key Features:**
- Agent Cards for discovery (`.well-known/agent.json`)
- Task lifecycle management (submitted -> working -> completed)
- Streaming via SSE, push notifications via webhooks
- Framework-agnostic (works with LangGraph, CrewAI, any framework)

### Tool 2: Composio
**Purpose:** 250+ tool integrations for AI agents
**Why:** Instead of building custom connectors for each SaaS tool, Composio provides pre-built, auth-managed connectors. Agents get access to GitHub, Slack, Gmail, HubSpot, Salesforce, Notion, and 200+ more tools.
**Key Features:**
- Managed OAuth 2.0 lifecycle
- Per-user tool connections
- 40% improved tool call accuracy via optimized schemas
- Native LangChain/LangGraph integration

### Tool 3: CrewAI
**Purpose:** Role-based multi-agent orchestration
**Why:** CrewAI's Crews + Flows dual architecture enables Talos to define agent teams with clear roles, hierarchical coordination, and authority levels -- perfect for procurement approval chains.
**Key Features:**
- Hierarchical coordination with manager agents
- Shared memory across crew members
- Planning agent for step-by-step task decomposition
- Event-driven Flows for production pipelines

### Tool 4: OpenAI Agents SDK
**Purpose:** Lightweight handoff-based multi-agent routing
**Why:** The triage/handoff pattern is ideal for Talos's intent-based routing. A triage agent classifies requests and hands off to specialists without context window overflow.
**Key Features:**
- Handoff primitives for clean agent-to-agent transfer
- Built-in guardrails (input validation, safety)
- Built-in tracing and observability
- Realtime voice agent support

### Tool 5: Letta (MemGPT)
**Purpose:** Stateful agents with persistent long-term memory
**Why:** Procurement agents need to remember user preferences, past decisions, vendor relationships, and negotiation history across sessions. Letta's memory hierarchy (core/archival/recall) solves this.
**Key Features:**
- Self-editing memory (agents manage their own context)
- Memory hierarchy (RAM-like core + disk-like archival)
- White-box transparency into agent reasoning
- REST API for composability with other frameworks

### Tool 6: Google ADK (Agent Development Kit)
**Purpose:** Multi-agent composition with A2A protocol support
**Why:** Google ADK provides SequentialAgent, ParallelAgent, and LoopAgent workflow primitives that map directly to Talos's existing chain/parallel execution patterns, plus native A2A integration.
**Key Features:**
- Built-in multi-agent workflow agents (Sequential, Parallel, Loop)
- Native A2A protocol support
- Model-agnostic (Gemini, Claude, GPT-4o)
- Bi-directional LangChain/CrewAI interop

### Tool 7: LangGraph (Enhanced)
**Purpose:** Graph-based agent state machines (already in use, needs upgrade)
**Why:** Talos already uses LangGraph but only for simple agent loops. The upgrade adds Agent Supervisor patterns, hierarchical teams, and persistence for pause/resume workflows.
**Key Features:**
- Agent Supervisor node for orchestration
- Hierarchical teams (graphs within graphs)
- State persistence for long-running procurement workflows
- Conditional routing with complex branching

---

## 3. Required Communication Channels

### Sendblue (iMessage/SMS/RCS)
**Use Cases:**
- Approval requests via iMessage to executives
- Urgent price alerts and recall notifications via SMS
- Purchase request intake from mobile
- Delivery confirmations and tracking updates
**Integration:** REST API with webhooks for inbound messages

### Vapi AI (Voice)
**Use Cases:**
- Voice-activated purchase requests ("Order 500 pipette tips")
- Phone-based approval workflows for executives on the go
- Vendor negotiation calls with AI assistance
- Emergency procurement hotline
**Integration:** Configurable voice pipeline with custom tool calling

### Resend (Outbound Email)
**Use Cases:**
- Executive spend reports and dashboards
- Contract renewal notifications
- Savings attribution reports
- Marketing campaign emails for events
**Integration:** REST API with React Email templates

### AgentMail (Agent Email Inboxes)
**Use Cases:**
- Each agent gets its own email inbox for vendor communications
- RFQ distribution and response collection via email
- Invoice receipt and processing
- Audit trail with full email thread history
**Integration:** Two-way email API with threading, native LangChain support

---

## 4. Swarm & Team Architecture

### Manager/Orchestrator Agent
A new top-level **Orchestrator Agent** coordinates all 30 agents using:
- **CrewAI Hierarchical Coordination** for authority-based delegation
- **A2A Protocol** for communication with external agents
- **OpenAI Agents SDK Handoffs** for clean inter-agent routing
- **Letta Memory** for persistent orchestration context

### Swarm Teams

| Team | Manager | Members | Pattern |
|------|---------|---------|---------|
| Price Intelligence | Price Orchestrator | price-watch, price-compare, historical-price, knowledge-graph, contract-validator, catalog-sync | Parallel analysis + sequential reporting |
| Procurement Pipeline | Procurement Manager | requisition, approval-workflow, vendor-selection, rfq-rfp, po-generation | Sequential chain with conditional branching |
| Invoice & Payment | Finance Manager | invoice-matching, receipt-delivery, payment-optimizer, contract-validator | Three-way match pipeline |
| Category Specialists | Category Router | lab-supply, it-equipment, office-supply, furniture, facilities, marketing, travel, professional-services, medical-supply, capital-projects, food-service | Triage + handoff |
| Intelligence & Compliance | Compliance Director | spend-analytics, budget-guardian, compliance-agent, supplier-diversity, sustainability-agent, risk-vendor-health, contract-lifecycle, savings-tracker | Parallel monitoring + alert aggregation |

### Communication Matrix

| Channel | Inbound | Outbound | Agents |
|---------|---------|----------|--------|
| Sendblue (iMessage/SMS) | Purchase requests, approvals | Alerts, confirmations, tracking | requisition, approval-workflow, receipt-delivery, facilities |
| Vapi (Voice) | Voice orders, phone approvals | Outbound vendor calls, notifications | requisition, approval-workflow, rfq-rfp |
| Resend (Email) | -- | Reports, notifications, campaigns | spend-analytics, budget-guardian, savings-tracker, marketing |
| AgentMail (Agent Email) | Vendor responses, invoices, RFQ replies | RFQs, POs, dispute letters, audit trails | rfq-rfp, po-generation, invoice-matching, compliance-agent |
| Slack (existing) | Commands, messages | Alerts, approvals | All agents |

---

## 5. Gap Analysis Summary

| Gap | Severity | Solution | Impact |
|-----|----------|----------|--------|
| No agent-to-agent protocol | HIGH | A2A Protocol | External agent interop |
| No managed tool integrations | HIGH | Composio | 250+ SaaS connectors |
| No persistent agent memory | HIGH | Letta (MemGPT) | Cross-session learning |
| No voice channel | MEDIUM | Vapi AI | Executive accessibility |
| No iMessage/SMS channel | MEDIUM | Sendblue | Mobile-first approvals |
| No agent email inboxes | MEDIUM | AgentMail | Vendor communication |
| No outbound email API | MEDIUM | Resend | Report distribution |
| No hierarchical team mgmt | HIGH | CrewAI + Google ADK | Swarm coordination |
| No triage/handoff pattern | MEDIUM | OpenAI Agents SDK | Clean intent routing |
| No supervisor pattern | HIGH | LangGraph Enhanced | Orchestrator control |

---

## 6. Implementation Files

| File | Purpose |
|------|---------|
| `src/orchestrator/manager.ts` | Master orchestrator agent with swarm teams |
| `src/integrations/a2a.ts` | A2A protocol server/client implementation |
| `src/integrations/composio.ts` | Composio tool provider integration |
| `src/integrations/communication.ts` | Sendblue + Vapi + Resend + AgentMail |
| `src/integrations/frameworks.ts` | CrewAI + OpenAI Agents SDK + Letta + Google ADK |
| `python/agents/core/orchestrator.py` | Python swarm orchestrator with team management |
| `python/integrations/` | Python-side integration modules |
