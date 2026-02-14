#!/usr/bin/env python3
"""
Talos CLI — One command to rule them all.

Game-changing decision #9: ONE-COMMAND EXPERIENCE
- `talos chat` — Interactive conversational procurement (primary)
- `talos server` — Start the API
- `talos demo` — Full pipeline demo
- `talos test` — Test all agents
- `talos cost-test` — Benchmark models
- `talos info` — Show configuration
- `talos setup` — Interactive onboarding (Decision #10)
- `talos worker` — Start Temporal worker (optional)

Usage:
    python -m talos chat           Start interactive procurement chat
    python -m talos server         Start FastAPI server
    python -m talos worker         Start Temporal worker (requires Temporal)
    python -m talos demo           Full pipeline demo
    python -m talos test           Test all 7 agents
    python -m talos cost-test      Benchmark LLM costs
    python -m talos info           Show configuration
    python -m talos setup          Interactive setup wizard
"""
from __future__ import annotations

import asyncio
import sys
import os
import logging
import stat


def _setup_logging():
    """Configure logging from config, with fallback to INFO."""
    try:
        from .config import get_config
        level = get_config().log_level
    except Exception:
        level = "INFO"
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )


log = logging.getLogger("talos")


# ==================================================================
# INTERACTIVE CHAT (Decision #2: doanything-style UX)
# ==================================================================

async def run_chat():
    """Interactive procurement chat — the primary interface."""
    from .config import get_config
    from .chat.engine import ChatEngine

    config = get_config()

    if not config.openrouter_api_key:
        print("\n  No API key found. Run 'python -m talos setup' to configure.\n")
        return

    engine = ChatEngine(config.client_type.value)

    print(f"""
{'='*60}
  TALOS AI — Procurement Intelligence
  Client: {config.client_type.value.upper()}
{'='*60}

  Just tell me what you need. Examples:
    "I need 50 boxes of gloves for the chem lab"
    "How much do mass spectrometers cost?"
    "Can I buy equipment over $5K on my NSF grant?"
    "Find savings on our lab supply spending"

  Type 'quit' to exit.
{'='*60}
""")

    session_id = None
    while True:
        try:
            user_input = input("\n  You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n\n  Goodbye!\n")
            break

        if not user_input:
            continue
        if user_input.lower() in ("quit", "exit", "q"):
            print("\n  Goodbye!\n")
            break

        print("\n  Talos is thinking...\n")
        result = await engine.message(
            text=user_input,
            session_id=session_id,
        )

        session_id = result.get("session_id")
        message = result.get("message", "I couldn't process that request.")

        # Format output
        for line in message.split("\n"):
            print(f"  {line}")

    await engine.close()


# ==================================================================
# SETUP WIZARD (Decision #10: Zero-friction onboarding)
# ==================================================================

def run_setup():
    """Interactive setup wizard — get running in 60 seconds."""
    print(f"""
{'='*60}
  TALOS AI — Setup Wizard
{'='*60}
""")

    env_path = os.path.join(os.getcwd(), ".env")
    existing = {}
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    key, val = line.split("=", 1)
                    existing[key] = val

    # Step 1: API Key
    current_key = existing.get("OPENROUTER_API_KEY", os.getenv("OPENROUTER_API_KEY", ""))
    if current_key:
        print(f"  API Key: {'*' * 8}{current_key[-4:]}")
        change = input("  Change API key? [y/N]: ").strip().lower()
        if change == "y":
            current_key = input("  Enter OpenRouter API key: ").strip()
    else:
        print("  Get your API key at: https://openrouter.ai/keys")
        current_key = input("  Enter OpenRouter API key: ").strip()

    # Step 2: Client Type
    print(f"""
  Select your organization type:
    1. University (higher education, research)
    2. NYPA (New York Power Authority / public utility)
    3. Northwell (health system / hospital)
""")
    client_choice = input("  Choice [1/2/3]: ").strip()
    client_map = {"1": "university", "2": "nypa", "3": "northwell"}
    client_type = client_map.get(client_choice, "university")

    # Step 3: Write .env with restricted permissions
    env_content = f"""# Talos AI Configuration
OPENROUTER_API_KEY={current_key}
TALOS_CLIENT={client_type}
TALOS_DB=talos.db

# Model tiers (defaults are optimized for cost/quality)
# TALOS_MODEL_CHEAP=deepseek/deepseek-chat-v3-0324:floor
# TALOS_MODEL_SMART=anthropic/claude-sonnet-4
# TALOS_MODEL_GENIUS=anthropic/claude-opus-4

# Notifications (optional)
# TALOS_SLACK_WEBHOOK=https://hooks.slack.com/services/...
# TALOS_NOTIFY_EMAIL=procurement@yourorg.com

# Authentication (optional — comma-separated API keys)
# TALOS_API_KEYS=key1,key2,key3

# SMTP for email notifications (optional)
# TALOS_SMTP_HOST=smtp.gmail.com
# TALOS_SMTP_PORT=587
# TALOS_SMTP_USER=user@example.com
# TALOS_SMTP_PASSWORD=app-password
# TALOS_SMTP_FROM=talos@yourorg.com
"""

    with open(env_path, "w") as f:
        f.write(env_content)

    # Set file permissions to owner-only (chmod 600)
    try:
        os.chmod(env_path, stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass  # Windows or restricted environments may not support this

    print(f"""
{'='*60}
  Setup complete!
{'='*60}
  Client: {client_type}
  Config: {env_path}
  Database: talos.db

  Next steps:
    python -m talos chat        Start chatting
    python -m talos test        Test all agents
    python -m talos server      Start API server
    python -m talos demo        Full pipeline demo
{'='*60}
""")


# ==================================================================
# AGENT TEST SUITE
# ==================================================================

async def run_test():
    from .config import get_config
    from .agents.core import TalosAgents

    config = get_config()
    agents = TalosAgents(config.client_type.value)

    print(f"\n{'='*65}")
    print(f"  TALOS AI — Agent Test Suite ({config.client_type.value.upper()})")
    print(f"{'='*65}\n")

    # Test 1: Intake Parser
    print("--- TEST 1: Intake Parser (cheap tier) ---")
    parsed = await agents.intake_parser(
        raw_text="I need 50 boxes of nitrile gloves (medium, powder-free) for the chemistry lab. "
                 "Also 10 safety goggles. This is for Dr. Chen's NSF grant #2024-MCB-1234. "
                 "Need them by next Monday. Ship to Havemeyer Hall Room 302.",
        requester="Dr. Wei Chen",
        department="Chemistry",
        channel="email",
    )
    print(f"  req_id:       {parsed.req_id}")
    print(f"  items:        {len(parsed.items)}")
    for item in parsed.items:
        print(f"    - {item.description} x {item.quantity} @ ${item.estimated_unit_price or 0:.2f}")
    print(f"  total:        ${parsed.estimated_total:.2f}")
    print(f"  category:     {parsed.category}")
    print(f"  urgency:      {parsed.urgency.value}")
    print(f"  funding:      {parsed.funding_source.funding_type.value} (grant: {parsed.funding_source.grant_number})")
    print(f"  confidence:   {parsed.confidence_score}")
    print(f"  flags:        {parsed.compliance_flags}")
    print()

    # Test 2: Policy Compliance
    print("--- TEST 2: Policy Compliance (smart tier) ---")
    compliance = await agents.policy_compliance(parsed)
    print(f"  compliant:    {compliance.is_compliant}")
    print(f"  violations:   {len(compliance.violations)}")
    for v in compliance.violations:
        print(f"    [{v.severity}] {v.policy_name}: {v.description[:80]}")
    print(f"  approvals:    {len(compliance.required_approvals)}")
    for a in compliance.required_approvals:
        print(f"    {a.approver_role}: {a.threshold_reason}")
    print(f"  vendors:      {len(compliance.preferred_vendors)}")
    for v in compliance.preferred_vendors:
        print(f"    -> {v.vendor_name} ({v.match_type})")
    print(f"  regulations:  {compliance.regulatory_requirements}")
    print()

    # Test 3: Demand Aggregation
    print("--- TEST 3: Demand Aggregation (cheap tier) ---")
    agg = await agents.demand_aggregation(parsed)
    print(f"  action:       {agg.recommended_action}")
    print(f"  savings est:  ${agg.consolidation_savings_estimate:.2f}")
    print()

    # Test 4: Price Tracking
    print("--- TEST 4: Price Tracking (smart tier) ---")
    prices = await agents.price_tracker(
        item_description="Nitrile examination gloves, medium, powder-free, 100/box",
        current_price=15.00,
        quantity=50,
    )
    print(f"  sources:      {prices.sources_checked}")
    print(f"  lowest:       ${prices.lowest_price:.2f}")
    print(f"  median:       ${prices.median_price:.2f}")
    print(f"  highest:      ${prices.highest_price:.2f}")
    print(f"  recommended:  {prices.recommended_vendor} @ ${prices.recommended_price:.2f}")
    if prices.savings_vs_current:
        print(f"  savings/unit: ${prices.savings_vs_current:.2f}")
    for p in prices.prices_found[:5]:
        print(f"    {p.source:25s} | {p.vendor_name:20s} | ${p.unit_price:.2f} {'[CONTRACT]' if p.contract_price else ''}")
    print()

    # Test 5: Savings Verification
    print("--- TEST 5: Savings Verification (genius tier) ---")
    savings = await agents.verify_savings(
        description="Consolidated nitrile glove purchasing across 3 departments",
        baseline_price=15.80,
        new_price=11.20,
        volume=5000,
        category="Lab Supplies",
        evidence=["PO-2024-1234 (Chemistry, $15.80)", "PO-2024-2345 (Biology, $14.50)", "New contract quote from Fisher"],
    )
    print(f"  baseline:     ${savings.baseline_price:.2f}/unit")
    print(f"  new price:    ${savings.new_price:.2f}/unit")
    print(f"  volume:       {savings.volume} units")
    print(f"  total saved:  ${savings.total_savings:,.2f}")
    print(f"  Talos share:  ${savings.talos_share:,.2f} (33%)")
    print(f"  confidence:   {savings.confidence}")
    print(f"  method:       {savings.verification_method.value}")
    print()

    # Test 6: Knowledge Base
    print("--- TEST 6: Knowledge Base (smart tier) ---")
    answer = await agents.knowledge_base(
        "Can I buy lab equipment over $5,000 on my NSF grant without prior approval?"
    )
    print(f"  Q: Can I buy lab equipment over $5,000 on my NSF grant without prior approval?")
    print(f"  A: {answer[:300]}...")
    print()

    # Test 7: Proactive Optimization
    print("--- TEST 7: Proactive Optimization (genius tier) ---")
    discovery = await agents.find_optimizations(
        "SPEND DATA ANALYSIS:\n"
        "Chemistry department: 200 boxes nitrile gloves from Fisher Scientific at $15.80/box ($3,160)\n"
        "Biology department: 150 boxes nitrile gloves from VWR at $14.50/box ($2,175)\n"
        "Medical School: 300 boxes nitrile gloves from Medline at $11.20/box ($3,360)\n"
        "Nursing School: 100 boxes nitrile gloves from Amazon Business at $16.90/box ($1,690)\n"
        "Total: 750 boxes from 4 vendors at 4 different prices. Annual consumption: ~5,000 boxes."
    )
    print(f"  type:         {discovery.discovery_type}")
    print(f"  description:  {discovery.description[:200]}")
    print(f"  est savings:  ${discovery.estimated_annual_savings:,.2f}/year")
    print(f"  confidence:   {discovery.confidence}")
    print(f"  priority:     {discovery.priority}")
    print(f"  action:       {discovery.recommended_action[:150]}")
    print()

    agents.router.print_costs()
    await agents.close()


# ==================================================================
# FULL PIPELINE DEMO
# ==================================================================

async def run_demo():
    from .config import get_config
    from .agents.pipeline import RequisitionPipelineRunner
    from .db import TalosDB

    config = get_config()
    runner = RequisitionPipelineRunner(config.client_type.value)
    database = TalosDB(config.db_path)

    scenarios = {
        "university": (
            "We need to purchase a new Thermo Fisher Orbitrap mass spectrometer for the proteomics core facility. "
            "Estimated cost is $750,000. Funded by NIH grant R01-GM-2024-5678. "
            "Need installed by September. Include 3-year service contract and training.",
            "Dr. Sarah Martinez", "Biochemistry",
        ),
        "nypa": (
            "Need 24 replacement 345kV transformer bushings for Clark Energy Center. "
            "Also 500 gallons transformer oil (mineral, inhibited). "
            "Spring maintenance outage. Capital project CP-2025-0142. Deliver by April 1.",
            "Mike Thompson", "Generation Engineering",
        ),
        "northwell": (
            "Requesting 500 Medtronic StealthStation S8 cranial navigation disposable kits "
            "for neurosurgery across LIJ, North Shore, and Lenox Hill. Contract expires 60 days. "
            "Also 200 Stryker cranial fixation pins. Class II devices. Check GPO pricing.",
            "Dr. Robert Kim", "Neurosurgery",
        ),
    }

    text, requester, dept = scenarios.get(config.client_type.value, scenarios["university"])

    print(f"\n{'='*65}")
    print(f"  TALOS AI — Full Pipeline Demo ({config.client_type.value.upper()})")
    print(f"{'='*65}")
    print(f"\n  Request: {text[:100]}...")
    print(f"  From: {requester} ({dept})")
    print(f"{'='*65}\n")

    result = await runner.process(
        raw_text=text,
        requester_name=requester,
        department=dept,
        channel="email",
    )

    database.save_pipeline(result, config.client_type.value)
    # drain_history already called in process(), save any remaining
    calls = runner.agents.router.drain_history()
    if calls:
        database.save_llm_calls(calls, result.id)

    print(f"\n{'='*65}")
    print(f"  PIPELINE RESULT: {result.id}")
    print(f"{'='*65}")
    print(f"  Status:         {result.status}")
    if result.parsed:
        print(f"  Items:          {len(result.parsed.items)}")
        print(f"  Total:          ${result.parsed.estimated_total:,.2f}")
        print(f"  Category:       {result.parsed.category}")
    if result.compliance:
        print(f"  Compliant:      {result.compliance.is_compliant}")
        print(f"  Approvals:      {len(result.compliance.required_approvals)}")
    if result.pricing:
        print(f"  Best Price:     ${result.pricing.recommended_price:,.2f} ({result.pricing.recommended_vendor})")
    if result.savings:
        print(f"  Savings Found:  ${result.savings.total_savings:,.2f}")
        print(f"  Talos Share:    ${result.savings.talos_share:,.2f}")
    print(f"  LLM Cost:       ${result.total_llm_cost:.4f}")
    print(f"  Errors:         {result.errors or 'None'}")
    print()

    dash = database.dashboard()
    print(f"  Dashboard: {dash}")

    runner.agents.router.print_costs()
    database.close()
    await runner.close()


# ==================================================================
# COST BENCHMARK
# ==================================================================

async def run_cost_benchmark():
    import time
    from .config import get_config
    from .llm import LLMRouter
    from .schemas import ParsedRequisition
    from .policies import get_policies

    config = get_config()
    if not config.openrouter_api_key:
        print("ERROR: Set OPENROUTER_API_KEY (run 'python -m talos setup')")
        return

    policies = get_policies(config.client_type.value)
    system_prompt = f"You are the Talos Intake Parser for {policies['name']}. Parse procurement requests into JSON. {policies['regulations']}"
    test_input = "I need 200 boxes of nitrile gloves for the chemistry department. Charge to operating budget CS-2025-OPS."

    models = [
        ("deepseek/deepseek-chat-v3-0324:floor", "cheap", "DeepSeek V3"),
        ("google/gemini-2.0-flash-001:floor", "cheap", "Gemini 2.0 Flash"),
        ("meta-llama/llama-3.3-70b-instruct:floor", "cheap", "Llama 3.3 70B"),
        ("mistralai/mistral-large-2411:floor", "smart", "Mistral Large"),
        ("anthropic/claude-sonnet-4:floor", "smart", "Claude Sonnet 4"),
    ]

    print(f"\n{'='*75}")
    print(f"  COST BENCHMARK: Intake Parser across models")
    print(f"{'='*75}")
    print(f"  {'Model':30s} | {'Cost':>8s} | {'In':>6s} | {'Out':>6s} | {'Latency':>8s} | {'Valid':>5s}")
    print(f"  {'-'*69}")

    router = LLMRouter()

    for model_id, _tier, name in models:
        try:
            old = config.model_cheap
            config.model_cheap = model_id
            config.model_smart = model_id

            start = time.time()
            result = await router.call(
                agent="benchmark", tier="cheap",
                system_prompt=system_prompt,
                user_message=test_input,
                response_model=ParsedRequisition,
            )
            lat = (time.time() - start) * 1000

            last = router.history[-1] if router.history else None
            valid = "Y" if result.items and result.estimated_total > 0 else "N"

            if last:
                print(f"  {name:30s} | ${last.cost:>7.4f} | {last.tokens_in:>6d} | {last.tokens_out:>6d} | {lat:>7.0f}ms | {valid:>5s}")

            config.model_cheap = old
            config.model_smart = "anthropic/claude-sonnet-4"
        except Exception as e:
            print(f"  {name:30s} | ERROR: {str(e)[:50]}")

    await router.close()
    print()


# ==================================================================
# SERVER
# ==================================================================

def run_server():
    try:
        import uvicorn
    except ImportError:
        print("Install uvicorn: pip install 'uvicorn[standard]'")
        return

    from .config import get_config
    config = get_config()
    print(f"\n  Starting Talos API server...")
    print(f"  Client: {config.client_type.value}")
    print(f"  Chat:   POST http://localhost:8000/chat")
    print(f"  Docs:   http://localhost:8000/docs\n")
    uvicorn.run("talos.api.server:app", host="0.0.0.0", port=8000, reload=True)


# ==================================================================
# TEMPORAL WORKER (Optional durable execution)
# ==================================================================

def run_temporal_worker():
    """Start the Temporal activity worker."""
    from .config import get_config
    config = get_config()

    if not config.enable_temporal:
        print("\n  Temporal is not enabled.")
        print("  Set TALOS_ENABLE_TEMPORAL=true in your .env to enable.")
        print("  Also ensure a Temporal server is running.\n")
        return

    try:
        from .workflows.worker import run_worker
    except ImportError:
        print("\n  temporalio package not installed.")
        print("  Install it: pip install temporalio\n")
        return

    asyncio.run(run_worker())


# ==================================================================
# INFO
# ==================================================================

def show_info():
    from .config import get_config
    config = get_config()

    print(f"\n{'='*50}")
    print(f"  TALOS AI Configuration")
    print(f"{'='*50}")
    print(f"  Version:   0.3.0")
    print(f"  Client:    {config.client_type.value}")
    print(f"  API Key:   {'SET' if config.openrouter_api_key else 'NOT SET'}")
    print(f"  Auth:      {'ENABLED' if config.api_keys else 'DISABLED'}")
    print(f"  Slack:     {'SET' if config.slack_webhook_url else 'NOT SET'}")
    print(f"  Email:     {'SET' if config.smtp_host else 'NOT SET'}")
    print(f"  Database:  {config.db_path}")
    print(f"  Model Tiers:")
    print(f"    cheap:   {config.model_cheap}")
    print(f"    smart:   {config.model_smart}")
    print(f"    genius:  {config.model_genius}")
    print()
    print(f"  Agents:")
    agent_tiers = [
        ("intake_parser",      "cheap",  "Parse unstructured requests"),
        ("policy_compliance",  "smart",  "Check policies, thresholds, regulations"),
        ("demand_aggregation", "cheap",  "Find consolidation opportunities"),
        ("approval_routing",   "cheap",  "Route to correct approvers"),
        ("purchase_order",     "cheap",  "Generate POs"),
        ("savings_verification","genius", "Verify savings for billing (33%)"),
        ("price_tracking",     "smart",  "Monitor prices across sources"),
        ("chat_engine",        "smart",  "Conversational procurement interface"),
    ]
    for name, tier, desc in agent_tiers:
        print(f"    [{tier:6s}] {name:25s} {desc}")
    print()
    print(f"  Temporal Workflows:")
    print(f"    Enabled:    {'YES' if config.enable_temporal else 'NO'}")
    if config.enable_temporal:
        print(f"    Address:    {config.temporal_address}")
        print(f"    Namespace:  {config.temporal_namespace}")
        print(f"    Task Queue: {config.temporal_task_queue}")
    print()


# ==================================================================
# MAIN
# ==================================================================

def main():
    _setup_logging()

    if len(sys.argv) < 2:
        print("""
  TALOS AI — Autonomous Procurement Intelligence
  "The doanything.com for procurement"

  Usage:
    python -m talos chat           Talk to Talos (primary interface)
    python -m talos server         Start API server (http://localhost:8000)
    python -m talos worker         Start Temporal worker (optional)
    python -m talos demo           Full pipeline demo
    python -m talos test           Test all agents with sample data
    python -m talos cost-test      Benchmark LLM costs across models
    python -m talos info           Show configuration
    python -m talos setup          Interactive setup wizard

  Quick start:
    python -m talos setup          (60 seconds to configure)
    python -m talos chat           (start buying things)
        """)
        return

    cmd = sys.argv[1].lower()

    if cmd == "chat":
        asyncio.run(run_chat())
    elif cmd == "test":
        asyncio.run(run_test())
    elif cmd == "demo":
        asyncio.run(run_demo())
    elif cmd == "cost-test":
        asyncio.run(run_cost_benchmark())
    elif cmd == "server":
        run_server()
    elif cmd == "worker":
        run_temporal_worker()
    elif cmd == "info":
        show_info()
    elif cmd == "setup":
        run_setup()
    else:
        print(f"Unknown command: {cmd}")


if __name__ == "__main__":
    main()
