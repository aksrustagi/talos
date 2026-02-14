# Talos Architecture Comparison: Current vs Tarball

## Executive Summary

Two fundamentally different architectures exist for Talos:

| Dimension | Current Codebase (Repo) | Tarball Codebase |
|-----------|------------------------|------------------|
| **Total Lines** | ~23,900 (TS + Python) | ~2,175 (Python only) |
| **Languages** | TypeScript + Python | Python only |
| **Agent Count** | 30 agents across 3 tiers | 7 focused agents |
| **Database** | Convex (cloud real-time DB) | SQLite (local file) |
| **Workflow Engine** | Temporal.io | Simple async pipeline |
| **Agent Framework** | LangGraph + LangChain | Raw LLM calls via OpenRouter |
| **LLM Provider** | Anthropic direct SDK | OpenRouter (multi-model routing) |
| **Web Framework** | Hono (TS) + FastAPI (Python) | FastAPI only |
| **External Integrations** | Jaggaer cXML/EDI | None |
| **Client Model** | Single (Columbia-centric) | Multi-client (University, NYPA, Northwell) |
| **Deployment Complexity** | High (Convex + Temporal + Node + Python) | Low (Python + SQLite) |
| **Cost Tracking** | None visible | Per-call, per-agent, ROI dashboard |
| **Billing Model** | Not implemented | 33% of verified savings |

---

## 1. Architecture Philosophy

### Current Codebase: Enterprise Microservices
The current repo follows an enterprise-grade microservices architecture with multiple runtime dependencies:
- **Convex** for real-time database and serverless functions
- **Temporal** for durable workflow orchestration
- **LangGraph/LangChain** for agent orchestration
- **Hono** for HTTP API layer
- **Dual-language** (TypeScript backend + Python AI layer)

This is a "build for scale" approach — lots of infrastructure, abstractions, and tooling.

### Tarball Codebase: Lean Vertical Slice
The tarball follows a lean, single-stack Python architecture:
- **No external infrastructure dependencies** beyond an LLM API
- **SQLite** for zero-config persistence
- **Raw async functions** for agent orchestration
- **Pydantic** for strong typing and validation
- **OpenRouter** for multi-model access with cost optimization

This is a "ship and iterate" approach — minimal dependencies, maximum velocity.

---

## 2. Detailed Comparison by Component

### 2.1 Agent System

#### Current: 30 Agents, Framework-Heavy
```
Tier 1: Core Price Intelligence (6 agents)
  price-watch, catalog-sync, price-compare, knowledge-graph, historical-price, contract-validator

Tier 2: Procurement Process (8 agents)
  requisition, approval-workflow, vendor-selection, rfq-rfp, po-generation,
  invoice-matching, receipt-delivery, payment-optimizer

Tier 3: Category Specialists (8 agents)
  lab-supply, it-equipment, office-supply, furniture, facilities,
  marketing, travel, professional-services, medical-supply, capital-projects

Tier 3: Intelligence & Compliance (8 agents)
  spend-analytics, budget-guardian, compliance-agent, supplier-diversity,
  sustainability-agent, risk-vendor-health, contract-lifecycle, savings-tracker
```

- Agents defined as system prompts in `src/agents/prompts.ts` (1,603 lines)
- Orchestrated via LangGraph with tool execution
- Each agent has dedicated tools via LangChain
- Complex agent routing and chaining

#### Tarball: 7 Agents, Direct LLM Calls
```
1. intake_parser       (cheap tier)  — Parse unstructured requests
2. policy_compliance   (smart tier)  — Validate against policies
3. demand_aggregation  (cheap tier)  — Find consolidation opportunities
4. approval_routing    (cheap tier)  — Route through approval chain
5. generate_po         (cheap tier)  — Create purchase orders
6. verify_savings      (genius tier) — Verify savings claims (billing basis)
7. price_tracker       (smart tier)  — Multi-source price comparison
+ knowledge_base       (smart tier)  — Q&A about procurement
```

- Agents are async methods on `TalosAgents` class
- Each agent = system prompt + Pydantic response model + LLM call
- No framework overhead — just `httpx` → OpenRouter → parse JSON → validate
- Cost-tiered: cheap tasks use DeepSeek (~$0.001), critical tasks use Claude Opus

**Verdict: Tarball is better for current stage.**
- 7 agents cover the actual procurement workflow end-to-end
- The current 30 agents are mostly system prompts without real tool implementations
- The tarball agents produce typed, validated outputs (Pydantic models)
- The tarball tracks costs per agent — critical for a savings-based business model
- 30 agents can be added incrementally; starting with 7 working ones is pragmatic

---

### 2.2 Data Models / Schemas

#### Current: Convex Schema (1,298 lines)
- 37+ tables defined in TypeScript
- Real-time subscriptions
- Indexes for common queries
- Relations between entities
- Covers: universities, users, products, vendors, requisitions, approvals, POs, invoices, contracts, price intelligence, ML models, budgets, agents, audit logs

#### Tarball: Pydantic Models (212 lines) + SQLite (283 lines)
- Strong Pydantic types for all agent inputs/outputs
- Enums: UrgencyLevel, FundingType, ApprovalStatus, NegotiationStrategy, SavingsMethod
- Core models: LineItem, FundingSource, PolicyViolation, ApprovalStep, VendorMatch
- Agent outputs: ParsedRequisition, ComplianceResult, AggregationOpportunity, PurchaseOrder, SavingsRecord, PriceTrackingResult
- Pipeline state: RequisitionPipeline (full state machine)
- SQLite: 4 tables (pipelines, savings, llm_calls, historical_orders)

**Verdict: Hybrid approach recommended.**
- The Convex schema is comprehensive and forward-looking, but many tables have no code using them yet
- The tarball's Pydantic models are production-ready with validation, defaults, and calculated fields
- **Recommendation:** Use the tarball's Pydantic models as the Python-side contract, keep Convex schema as the source of truth for persistence, but trim it to only tables that have active code paths

---

### 2.3 Policy & Compliance System

#### Current: Hardcoded Columbia-Specific
- Approval thresholds embedded in agent prompts
- Columbia $1.2B budget breakdown hardcoded in spend-analytics agent
- Single university focus
- Policies scattered across multiple prompt files
- No structured policy data model

#### Tarball: Multi-Client Policy Engine
```python
ClientType: UNIVERSITY | NYPA | NORTHWELL

Each client defines:
  - overview (spend, facilities, employees)
  - approval_thresholds (structured tiers)
  - key_regulations (client-specific laws/rules)
  - preferred_vendors
  - competitive_bid_threshold
  - procurement_system
```

- Policies injected into agent prompts at runtime via `get_policies(client_type)`
- Same agents work across all three clients
- Regulations are specific: 2 CFR 200 for universities, NY Finance Law for NYPA, FDA 510(k) for Northwell
- Approval thresholds vary by client (auto-approve at $10K for university, $5K for Northwell GPO)

**Verdict: Tarball is clearly better.**
- Multi-client support is essential for a SaaS business
- Structured policy data enables testing and validation
- Client-specific regulations are detailed and accurate
- The current codebase would need significant refactoring to support multiple clients

---

### 2.4 LLM Integration

#### Current: Anthropic SDK Direct
- `@anthropic-ai/sdk` and `@langchain/anthropic` in TypeScript
- `langchain-anthropic` in Python
- Single provider (Anthropic)
- No cost tracking
- No model tiering

#### Tarball: OpenRouter Multi-Model
```python
Model Tiers:
  cheap:  deepseek/deepseek-chat-v3-0324     (~$0.001/call)
  smart:  anthropic/claude-sonnet-4-20250514  (~$0.01/call)
  genius: anthropic/claude-opus-4-20250514    (~$0.10/call)
```

- OpenRouter provides access to 200+ models
- Provider fallbacks enabled
- Per-call cost tracking: tokens_in, tokens_out, cost, latency
- Cost reporting: total, by-agent, ROI calculation
- 4-strategy JSON parsing handles LLM output variations
- Exponential backoff retries
- Benchmark CLI command tests 5 models for cost/quality comparison

**Verdict: Tarball is significantly better.**
- Cost tracking is critical — you can't optimize what you don't measure
- Model tiering reduces costs 10-100x for simple tasks (parsing, routing)
- OpenRouter eliminates vendor lock-in
- The benchmark command enables data-driven model selection
- The current codebase has no cost visibility at all

---

### 2.5 Database & Persistence

#### Current: Convex
- Cloud-hosted real-time database
- Requires Convex deployment and account
- Real-time subscriptions
- Serverless functions (queries, mutations, actions)
- Complex schema with 37+ tables

#### Tarball: SQLite
- Zero configuration
- File-based, portable
- 4 focused tables
- JSON columns for flexible data
- Dashboard/summary queries built-in
- Cost tracking table

**Verdict: Depends on deployment target.**
- For **development and MVP**: SQLite (tarball) wins on simplicity
- For **production with real-time needs**: Convex (current) wins on features
- **Recommendation:** Start with SQLite for agent pipeline, migrate to Convex when real-time features (dashboards, notifications) are needed. The tarball's schema design is more pragmatic.

---

### 2.6 Workflow Orchestration

#### Current: Temporal.io
- 4 durable workflows: RequisitionApproval, InvoiceValidation, CatalogSync, ContractRenewal
- Activity-based decomposition
- Signal handling (approval events)
- Query support (status checks)
- SLA tracking with escalation
- Requires Temporal server deployment

#### Tarball: Simple Async Pipeline
```python
class RequisitionPipelineRunner:
    async process(raw_text, ...):
        Step 1: Parse → ParsedRequisition
        Step 2: Compliance → ComplianceResult
        Step 3: Aggregation → AggregationOpportunity
        Step 4: Pricing → PriceTrackingResult
        Step 5: PO Generation → PurchaseOrder (optional)
```

- Linear pipeline with status tracking
- Error capture per step
- Cost accumulation
- No external infrastructure needed

**Verdict: Tarball for now, Temporal later.**
- Temporal adds significant operational complexity (server, workers, versioning)
- The tarball's pipeline handles the core requisition flow well
- Temporal becomes valuable when you need: durable long-running workflows, human-in-the-loop approvals with SLA timers, cross-system integration retries
- **Recommendation:** Ship with the tarball's pipeline, add Temporal when the approval workflow needs durable state

---

### 2.7 API Layer

#### Current: Hono (TS) + FastAPI (Python)
- Hono handles HTTP routing, CORS, auth, rate limiting
- FastAPI for Python AI endpoints
- Two servers to maintain
- Middleware: JWT auth, rate limiting, error handling, security headers
- 10+ route modules

#### Tarball: FastAPI Only
- Single server
- 12 endpoints covering full functionality
- Health check, dashboard, cost reporting
- CORS configured
- Request/response models validated
- Auto-generated Swagger docs at /docs

**Verdict: Tarball's single-stack approach is better for now.**
- One server to deploy, monitor, and debug
- FastAPI's auto-docs are production-ready
- The current Hono setup duplicates effort (TS middleware + Python endpoints)
- Auth middleware from current codebase should be ported to FastAPI when needed

---

### 2.8 External Integrations

#### Current: Jaggaer cXML/EDI (759 lines)
- Purchase order transmission
- Invoice receipt and parsing
- Shipment notice processing
- Status updates
- XML message formatting

#### Tarball: None
- No external system integrations
- Focuses purely on AI pipeline

**Verdict: Keep the Jaggaer integration for production.**
- It's well-implemented and necessary for enterprise deployment
- Can be added as a module to the tarball architecture
- Not needed for MVP/demo phase

---

### 2.9 ML / Intelligence Systems

#### Current: Custom ML Models
- Hidden Markov Models (HMM) for price prediction
- Anomaly detection algorithms
- Demand forecasting
- Supply chain risk analysis
- Implemented in TypeScript (`src/intelligence/`)

#### Tarball: LLM-Based Intelligence
- Price tracking via LLM (searches multiple sources)
- Savings verification via LLM (with confidence scoring)
- Optimization discovery via LLM
- No custom ML models — uses LLM reasoning instead

**Verdict: Tarball's approach is more practical.**
- Custom ML models require training data that likely doesn't exist yet
- LLM-based intelligence works out of the box
- When sufficient data accumulates, ML models can be added alongside LLM agents
- The tarball's savings verification with confidence scoring is immediately usable

---

### 2.10 Business Model Integration

#### Current: No billing model
- No cost tracking
- No savings verification
- No ROI calculation
- No billing integration

#### Tarball: Full billing pipeline
```python
SavingsRecord:
    baseline_price, new_price, volume, period
    total_savings = (baseline - new) × volume
    talos_share = total_savings × 0.33
    confidence score gates billing
    verification_method + evidence required
```

- Dashboard shows: total_savings, total_talos_share, ROI
- Conservative verification (undercounting > overcounting)
- Per-agent cost tracking shows unit economics

**Verdict: Tarball is far ahead on monetization.**
- The savings verification agent (using Claude Opus for accuracy) is the billing engine
- Cost tracking proves unit economics work ($0.01-0.04 per requisition vs 33% of savings)
- This is the most business-critical code in either codebase

---

## 3. Recommendations

### What to Use from Each Codebase

#### ADOPT from Tarball (Priority: High)
| Component | Why |
|-----------|-----|
| **Agent architecture** (core.py) | 7 focused agents with typed outputs, cost-tiered models |
| **Pydantic schemas** (schemas.py) | Strong typing, validation, calculated fields |
| **Multi-client policies** (policies.py) | University, NYPA, Northwell support |
| **LLM router** (llm.py) | OpenRouter, cost tracking, model tiering, retry logic |
| **Pipeline runner** (pipeline.py) | Simple, effective orchestration |
| **SQLite persistence** (db/) | Zero-config, cost tracking, dashboard queries |
| **CLI** (cli.py) | Test, demo, benchmark, server commands |
| **FastAPI server** (api/server.py) | Single-stack API with auto-docs |
| **Billing model** (SavingsRecord) | 33% savings capture with verification |
| **Cost benchmarking** (cost-test) | Data-driven model selection |

#### KEEP from Current Codebase (Priority: Medium)
| Component | Why |
|-----------|-----|
| **Convex schema** (schema.ts) | Comprehensive data model for production scale |
| **Jaggaer integration** (jaggaer.ts) | Enterprise procurement system connectivity |
| **Auth middleware** (auth.ts) | JWT auth, role-based access control |
| **Rate limiting** (rateLimiter.ts) | Production API protection |
| **Agent prompts** (prompts.ts) | 30 detailed system prompts for future expansion |

#### DEFER (Priority: Low — add when needed)
| Component | Why |
|-----------|-----|
| **Temporal workflows** | Add when durable long-running workflows needed |
| **LangGraph orchestration** | Add when complex multi-agent routing needed |
| **HMM price prediction** | Add when training data available |
| **Anomaly detection** | Add when transaction volume sufficient |
| **Category specialist agents** | Add when core pipeline proven |

### Recommended Architecture (Merged)

```
talos/
├── config.py                 # FROM TARBALL: Multi-client config
├── policies.py               # FROM TARBALL: Client policy engine
├── schemas.py                # FROM TARBALL: Pydantic models
├── llm.py                    # FROM TARBALL: OpenRouter + cost tracking
├── agents/
│   ├── core.py               # FROM TARBALL: 7 core agents
│   ├── pipeline.py           # FROM TARBALL: Pipeline orchestration
│   └── prompts/              # FROM CURRENT: Extended agent prompts (add as needed)
├── db/
│   ├── sqlite.py             # FROM TARBALL: SQLite for dev/MVP
│   └── convex.py             # FROM CURRENT: Convex for production (later)
├── api/
│   ├── server.py             # FROM TARBALL: FastAPI single-stack
│   ├── auth.py               # FROM CURRENT: JWT auth middleware
│   └── rate_limit.py         # FROM CURRENT: Rate limiting
├── integrations/
│   └── jaggaer.py            # FROM CURRENT: Jaggaer cXML (ported to Python)
├── cli.py                    # FROM TARBALL: CLI commands
└── __main__.py               # FROM TARBALL: Entry point
```

### Migration Path

**Phase 1: Adopt Tarball as Base**
- Use the tarball code as the foundation
- It's a working, testable, deployable system today

**Phase 2: Port Critical Current Components**
- Add auth middleware (port from TS to Python)
- Add rate limiting (port from TS to Python)
- Integrate Convex as optional persistence backend

**Phase 3: Scale**
- Add Temporal for durable workflows
- Add more agents from the 30-agent catalog
- Add Jaggaer integration for enterprise clients
- Add ML models when data is available

---

## 4. Key Takeaways

1. **The tarball is a more mature product** despite being 10x smaller — it has billing, cost tracking, multi-client support, and working agent pipelines.

2. **The current codebase is a more mature architecture** — it has enterprise patterns, integrations, and comprehensive data modeling, but much of it is infrastructure without active code paths.

3. **The tarball's cost transparency is a competitive advantage.** Knowing that a requisition costs $0.01-0.04 to process while capturing 33% of savings is the entire business case.

4. **Multi-client support (tarball) > single-university focus (current).** The policy engine design in the tarball is ready for SaaS.

5. **Simplicity wins at this stage.** SQLite > Convex, async pipeline > Temporal, raw LLM calls > LangGraph — until the complexity is needed.

6. **The 30-agent catalog (current) is valuable IP** — but as system prompts to be added incrementally, not as day-one requirements.
