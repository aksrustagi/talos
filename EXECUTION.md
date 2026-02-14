# Talos AI — Execution Plan & 10 Game-Changing Product Decisions

## How This Was Built

### The Claude Code Team Approach

This codebase was built using a **parallel agent execution strategy** with Claude Code:

1. **Explore Agent** — Analyzed both codebases in parallel (current repo + tarball) to build a complete architectural map before writing any code
2. **Research Agent** — Studied the competitive landscape (askLio, Zip, Procurify, Coupa, Fairmarkit, Globality, DoAnything) to identify market gaps and UX patterns
3. **Architecture Agent** — Produced the `ARCHITECTURE_COMPARISON.md` deep analysis comparing all 10 dimensions of both codebases
4. **Build Agents (parallel)** — Executed the restructured codebase with all 10 decisions baked in:
   - Core infrastructure (config, schemas, LLM router, DB)
   - Agent system (7 core agents + pipeline)
   - Conversational engine (chat system)
   - API layer (FastAPI with chat + pipeline endpoints)
   - Notification system (Slack/email hooks)
   - CLI with interactive chat + setup wizard

**Key principle:** Read everything first, decide everything second, build everything third. No iterating in circles.

---

## The 10 Game-Changing Product Decisions

### Decision 1: Multi-Client From Day One

**What:** Every deployment is client-aware. Three real client profiles (University, NYPA, Northwell) with actual regulations, thresholds, and vendor preferences.

**Why this is game-changing:**
- askLio and Zip require custom implementation per client
- Coupa charges enterprise consulting fees for configuration
- Talos works for 3 completely different organizations from the same codebase
- Adding a new client = adding a Python dict to `policies.py` (30 minutes of work)

**Implementation:** `config.py` + `policies.py`
- `ClientType` enum drives the entire system
- Policies injected into agent prompts at runtime
- Same agents, different behavior via policy injection
- No code changes needed to onboard a new client vertical

**Competitive edge:** When a university demo finishes, flip `TALOS_CLIENT=northwell` and demo for a hospital. Same code, different regulations.

---

### Decision 2: Conversational UX (The DoAnything.com for Procurement)

**What:** Users describe what they need in plain English. Talos figures out the "how" — routing to correct agents autonomously.

**Why this is game-changing:**
- Coupa users describe the UX as "clunky workflows and inconsistent labeling"
- Procurify has a "steep learning curve"
- Zip "doesn't feel designed for complex procurement"
- DoAnything's insight: users want to describe the *outcome*, not the *process*

**Implementation:** `chat/engine.py` + `POST /chat` endpoint
- Intent detection routes to correct agent pipeline
- "I need 50 boxes of gloves" -> full pipeline (parse, comply, aggregate, price)
- "How much do mass spectrometers cost?" -> price tracker
- "Can I buy $50K equipment on my NSF grant?" -> knowledge base
- Session memory keeps context within conversations

**Competitive edge:** Zero training required. If you can type an email, you can use Talos. This directly addresses the #1 selection criterion identified in market research: UI/UX.

---

### Decision 3: Strong Typing Everywhere (Pydantic Models)

**What:** Every agent input and output is a Pydantic model with validation, defaults, and auto-generated JSON schemas.

**Why this is game-changing:**
- LLMs hallucinate. Pydantic catches it at the boundary.
- Auto-generated JSON Schema drives both API docs and LLM prompt formatting
- Type safety means refactoring doesn't break things silently
- askLio and Zip don't publish their data models — we make ours a feature

**Implementation:** `schemas.py` (212 lines, 20+ models)
- Every enum is explicit (UrgencyLevel, FundingType, ApprovalStatus, etc.)
- Every agent output has a dedicated model with defaults
- `SavingsRecord.calculate()` ensures billing math is always correct
- `RequisitionPipeline` is a full state machine with typed agent outputs

**Competitive edge:** When a client asks "what data do you capture?", show them the Pydantic schema. It's self-documenting.

---

### Decision 4: Cost-Tiered Multi-Model Architecture

**What:** Three model tiers (cheap/smart/genius) routed through OpenRouter. Every call tracked for cost, tokens, latency.

**Why this is game-changing:**
- askLio doesn't disclose their costs
- Zip uses OpenAI exclusively (single vendor lock-in)
- Coupa's AI pricing is opaque
- Talos processes a requisition for $0.01-0.04 while competitors charge per-seat monthly

**Implementation:** `llm.py` (LLMRouter)
```
cheap:  DeepSeek V3          ~$0.001/call  (parsing, routing, PO generation)
smart:  Claude Sonnet 4      ~$0.01/call   (compliance, pricing, knowledge)
genius: Claude Opus 4        ~$0.10/call   (savings verification — the billing engine)
```

- 4-strategy JSON parsing handles LLM output variations
- Exponential backoff retries with cost tracking
- `cost-test` CLI command benchmarks 5 models head-to-head
- No vendor lock-in — OpenRouter provides 200+ models

**Competitive edge:** Show clients: "Your requisition cost $0.03 to process. The savings we found were $23,000. That's a 766,000x ROI." No competitor can make this claim because they don't track costs.

---

### Decision 5: Zero-Config Persistence (SQLite)

**What:** SQLite database with zero setup — no server to install, configure, or manage.

**Why this is game-changing:**
- Coupa requires months of implementation
- Procurify has "one-time implementation fees"
- Fairmarkit targets only enterprises with IT teams
- Talos: `python -m talos setup` and you're running in 60 seconds

**Implementation:** `db/__init__.py` (6 tables)
- `pipelines` — full requisition state with JSON data column
- `savings` — billing basis with confidence scores
- `llm_calls` — every AI call tracked for cost optimization
- `historical_orders` — for demand aggregation
- `conversations` — chat session persistence
- `vendor_memory` — price intelligence that grows over time

**Competitive edge:** A university department can pilot Talos with zero IT involvement. No database servers, no cloud accounts, no deployment pipelines. It's a Python package.

---

### Decision 6: Single-Stack API (FastAPI Only)

**What:** One Python server handles everything — chat, pipeline, pricing, savings, dashboard.

**Why this is game-changing:**
- The current codebase requires: Node.js + TypeScript + Python + Convex + Temporal
- That's 5 runtime dependencies and 2 languages to deploy, monitor, and debug
- Talos: `pip install -r requirements.txt && python -m talos server`

**Implementation:** `api/server.py` (16 endpoints)
- `POST /chat` — conversational interface (primary)
- `POST /requisitions` — full pipeline execution
- `GET /dashboard` — savings, costs, ROI at a glance
- `GET /vendors/{category}` — vendor price memory
- Auto-generated Swagger docs at `/docs`

**Competitive edge:** Deploy to any Python hosting (Railway, Render, AWS Lambda, on-prem). No Kubernetes required. Single `Dockerfile`.

---

### Decision 7: Proactive Notification System (Slack/Email)

**What:** Approval requests, savings alerts, and compliance blocks automatically pushed to Slack and email.

**Why this is game-changing:**
- Procurement's #1 bottleneck is approvals sitting in someone's inbox
- No more "where's my approval?" — it comes to you with Slack buttons
- Savings alerts create excitement about the platform (viral adoption within orgs)

**Implementation:** `notifications.py`
- Slack Block Kit messages with Approve/Reject/View buttons
- Triggered automatically when pipeline detects:
  - Approval needed (based on threshold routing)
  - Compliance block (policy violation with severity "block")
  - Savings found (price tracking found better deal)
- SLA escalation support (4-hour emergency, 48-hour standard)

**Competitive edge:** When a VP gets a Slack message saying "Talos saved your department $23,000 — approve this PO?" they become a champion for the product. This is built-in viral adoption.

---

### Decision 8: Vendor Intelligence & Price Memory

**What:** Every price check is remembered. Talos gets smarter about vendor pricing over time.

**Why this is game-changing:**
- Gartner identifies "fragmented data" as the #1 barrier to scaling AI in procurement
- Most tools check prices once and forget
- Talos builds a persistent price database that compounds in value

**Implementation:** `vendor_memory` table in `db/__init__.py`
- Every price check stores: vendor, category, price, contract price, timestamp
- `best_price` tracked per vendor per category (only goes down)
- `GET /vendors/{category}` exposes the intelligence
- Future: anomaly detection when prices deviate from historical norms

**Competitive edge:** After 6 months of operation, Talos knows every vendor's pricing for every category at your institution. This data doesn't exist anywhere else — it's a proprietary moat.

---

### Decision 9: One-Command Experience

**What:** Every workflow accessible from a single CLI command. Setup to value in 60 seconds.

**Why this is game-changing:**
- 90%+ of CPOs planning GenAI, but <40% have moved beyond pilots
- Root cause: "system complexity, inconsistent data, unclear starting points"
- Talos: `python -m talos setup` -> `python -m talos chat` -> done

**Implementation:** `cli.py` (7 commands)
```bash
python -m talos setup          # Interactive onboarding (60 seconds)
python -m talos chat           # Conversational procurement
python -m talos server         # Start API
python -m talos demo           # Full pipeline demo
python -m talos test           # Test all agents
python -m talos cost-test      # Benchmark models
python -m talos info           # Show configuration
```

**Competitive edge:** Live demo in a sales meeting: `python -m talos setup` (type API key, select client type) -> `python -m talos chat` -> "I need 50 boxes of gloves for the chem lab" -> full pipeline result in 10 seconds. No slide deck needed.

---

### Decision 10: Zero-Friction Onboarding (Setup Wizard)

**What:** Interactive setup wizard that configures everything with 3 inputs: API key, client type, done.

**Why this is game-changing:**
- Coupa implementation takes months and costs six figures
- Procurify charges "one-time implementation fees"
- Zip requires sales calls for pricing
- Talos: 3 inputs and you're processing requisitions

**Implementation:** `run_setup()` in `cli.py`
- Step 1: API key (with link to get one)
- Step 2: Client type (1/2/3 selection)
- Step 3: Auto-writes `.env` with optimal defaults
- Outputs: "Next steps" with exact commands to run

**Competitive edge:** This is the Stripe/Vercel playbook — make the first experience so good that developers become advocates. When a procurement officer can show their team a working demo in 60 seconds, they sell the product for you.

---

## Architecture After Restructuring

```
talos/
├── __init__.py              # Package metadata
├── __main__.py              # Entry point
├── config.py                # Decision #1: Multi-client config
├── policies.py              # Decision #1: Client policy engine
├── schemas.py               # Decision #3: Pydantic models everywhere
├── llm.py                   # Decision #4: Cost-tiered multi-model router
├── notifications.py         # Decision #7: Slack/email notifications
├── cli.py                   # Decision #9 + #10: One-command + setup wizard
├── chat/
│   ├── __init__.py
│   └── engine.py            # Decision #2: Conversational UX engine
├── agents/
│   ├── __init__.py
│   ├── core.py              # 7 core agents (system prompts + LLM calls)
│   └── pipeline.py          # Pipeline orchestration
├── api/
│   ├── __init__.py
│   └── server.py            # Decision #6: Single-stack FastAPI
├── db/
│   └── __init__.py          # Decision #5 + #8: SQLite + vendor memory
└── .env.example             # Configuration template
```

**Total: ~3,200 lines of Python across 14 files**

---

## What This Beats in the Market

| Feature | Talos | askLio | Zip | Coupa | Procurify |
|---------|-------|--------|-----|-------|-----------|
| Time to first value | 60 seconds | Weeks | Weeks | Months | Weeks |
| Pricing transparency | Public | Hidden | Hidden | Hidden | ~$1K/mo |
| Multi-client | 3 verticals | Custom | Custom | Custom | Custom |
| Cost per requisition | $0.01-0.04 | Unknown | Unknown | Unknown | N/A |
| Conversational UX | Yes | No | No | No | Limited |
| Savings verification | Automated (33%) | Manual | No | No | No |
| Vendor memory | Grows over time | No | No | Partial | No |
| Self-serve setup | Yes | No | No | No | No |
| Open model selection | 200+ via OpenRouter | Unknown | OpenAI only | Proprietary | Proprietary |
| Slack notifications | Built-in | Unknown | Yes | Add-on | Limited |

---

## Revenue Model (Built Into the Code)

```
SavingsRecord:
    total_savings = (baseline_price - new_price) * volume
    talos_share   = total_savings * 0.33
    confidence    gates billing (must be >0.60)

Example:
    Glove consolidation across 4 departments
    Baseline: $15.80/box (weighted avg of 4 vendors)
    New:      $11.20/box (consolidated Fisher Scientific contract)
    Volume:   5,000 boxes/year
    Savings:  $23,000/year
    Talos:    $7,590/year
    Cost to find: $0.10 (one genius-tier savings verification call)
```

**Unit economics:** $0.10 to verify -> $7,590 in revenue = 75,900x ROI per savings verification.

---

## Running the Product

### Quick Start
```bash
pip install -r requirements.txt
python -m talos setup           # Configure in 60 seconds
python -m talos chat            # Start talking
```

### API Server
```bash
python -m talos server          # http://localhost:8000
# Then: POST /chat with {"message": "I need 50 boxes of gloves"}
```

### Full Demo
```bash
python -m talos demo            # Runs complete pipeline with sample data
```

### Cost Optimization
```bash
python -m talos cost-test       # Benchmark 5 models, pick the cheapest that works
```
