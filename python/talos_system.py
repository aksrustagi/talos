#!/usr/bin/env python3
"""
TALOS AI — Complete Runnable Agent System
==========================================
Install:
    pip install pydantic httpx temporalio python-dotenv jinja2 --break-system-packages

Run locally:
    # Terminal 1: Start Temporal dev server
    temporal server start-dev

    # Terminal 2: Start worker
    python talos_system.py worker

    # Terminal 3: Test agents
    python talos_system.py test
    python talos_system.py cost-test
    python talos_system.py demo

Environment (.env):
    OPENROUTER_API_KEY=sk-or-...
    TALOS_CLIENT=university          # university | nypa | northwell
    TALOS_LLM_PROVIDER=openrouter    # openrouter | bedrock
    AWS_REGION=us-east-1             # for bedrock
    TEMPORAL_ADDRESS=localhost:7233
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time
from datetime import datetime, timedelta
from typing import Any, Optional, Union
from uuid import uuid4

from pydantic import BaseModel, Field

# Optional imports — graceful fallback
try:
    import httpx
except ImportError:
    httpx = None
    print("WARNING: httpx not installed. Run: pip install httpx --break-system-packages")

try:
    from temporalio import workflow, activity
    from temporalio.client import Client as TemporalClient
    from temporalio.worker import Worker
    from temporalio.common import RetryPolicy
    HAS_TEMPORAL = True
except ImportError:
    HAS_TEMPORAL = False
    print("WARNING: temporalio not installed. Run: pip install temporalio --break-system-packages")

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Import from modular codebase
try:
    from config.settings import Settings, get_settings
except ImportError:
    Settings = None
    get_settings = None
from models.core import (
    UrgencyLevel, FundingType, ApprovalStatus, NegotiationStrategy, SavingsMethod,
    Attachment, LineItem, FundingSource, PolicyViolation, ApprovalStep, VendorMatch,
    NegotiationRound, PricingDataPoint,
    RequisitionInput, ParsedRequisition, ComplianceResult, AggregationOpportunity,
    SourcingRecommendation, NegotiationState, NegotiationResult,
    PurchaseOrder, InvoiceMatchResult, SavingsRecord,
    PriceTrackingResult, OptimizationDiscovery,
)
from llm.router import LLMRouter, LLMConfig, LLMProvider, ModelTier
from llm.cost_tracker import CostTracker, get_cost_tracker
from llm.client_policies import CLIENT_POLICIES, build_agent_prompt
from agents.runner import AgentRunner, AGENT_PROMPTS

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("talos")


# =============================================================================
# CONFIGURATION — Bridges env vars to modular config
# =============================================================================

class ClientType:
    UNIVERSITY = "university"
    NYPA = "nypa"
    NORTHWELL = "northwell"


class TalosConfig(BaseModel):
    """Global configuration — loaded from env vars."""
    client_type: str = "university"
    llm_provider: str = "openrouter"
    openrouter_api_key: str = ""
    aws_region: str = "us-east-1"
    temporal_address: str = "localhost:7233"
    temporal_namespace: str = "default"
    task_queue: str = "talos-agents"

    tier_models: dict = {
        "cheap": {
            "openrouter": "deepseek/deepseek-chat-v3-0324:floor",
            "bedrock": "amazon.nova-micro-v1:0",
        },
        "smart": {
            "openrouter": "anthropic/claude-sonnet-4",
            "bedrock": "anthropic.claude-sonnet-4-20250514-v1:0",
        },
        "genius": {
            "openrouter": "anthropic/claude-opus-4",
            "bedrock": "anthropic.claude-opus-4-20250514-v1:0",
        },
    }

    agent_tiers: dict = {
        "intake_parser": "cheap",
        "policy_compliance": "smart",
        "demand_aggregation": "cheap",
        "market_intelligence": "smart",
        "sourcing": "smart",
        "negotiation": "genius",
        "vendor_onboarding": "smart",
        "contract_lifecycle": "smart",
        "approval_workflow": "cheap",
        "purchase_order": "cheap",
        "order_confirmation": "cheap",
        "invoice_matching": "smart",
        "payment_optimization": "smart",
        "goods_receipt": "cheap",
        "budget_guardian": "smart",
        "spend_analytics": "smart",
        "savings_verification": "genius",
        "risk_compliance": "smart",
        "category_strategy": "smart",
        "supplier_performance": "smart",
        "knowledge_base": "smart",
        "proactive_optimization": "genius",
        "price_tracking": "smart",
    }

    @classmethod
    def from_env(cls) -> "TalosConfig":
        return cls(
            client_type=os.getenv("TALOS_CLIENT", "university"),
            llm_provider=os.getenv("TALOS_LLM_PROVIDER", "openrouter"),
            openrouter_api_key=os.getenv("OPENROUTER_API_KEY", ""),
            aws_region=os.getenv("AWS_REGION", "us-east-1"),
            temporal_address=os.getenv("TEMPORAL_ADDRESS", "localhost:7233"),
        )

    def to_llm_config(self) -> LLMConfig:
        """Convert to modular LLMConfig."""
        return LLMConfig(
            provider=LLMProvider(self.llm_provider),
            tier_models=self.tier_models,
            openrouter_api_key=self.openrouter_api_key,
            aws_region=self.aws_region,
        )


# =============================================================================
# TEMPORAL ACTIVITIES — Wraps AgentRunner for Temporal
# =============================================================================

_agent_runner: Optional[AgentRunner] = None


def get_runner() -> AgentRunner:
    global _agent_runner
    if _agent_runner is None:
        config = TalosConfig.from_env()
        _agent_runner = AgentRunner(config.to_llm_config(), config.client_type, config.agent_tiers)
    return _agent_runner


if HAS_TEMPORAL:
    @activity.defn(name="parse_requisition_v2")
    async def act_parse_requisition(raw_input: dict) -> dict:
        runner = get_runner()
        inp = RequisitionInput.model_validate(raw_input)
        result = await runner.parse_requisition(inp)
        return result.model_dump()

    @activity.defn(name="check_compliance_v2")
    async def act_check_compliance(parsed: dict) -> dict:
        runner = get_runner()
        req = ParsedRequisition.model_validate(parsed)
        result = await runner.check_compliance(req)
        return result.model_dump()

    @activity.defn(name="check_aggregation_v2")
    async def act_check_aggregation(parsed: dict) -> dict:
        runner = get_runner()
        req = ParsedRequisition.model_validate(parsed)
        result = await runner.check_aggregation(req)
        return result.model_dump()

    @activity.defn(name="generate_purchase_order_v2")
    async def act_generate_po(data: dict) -> dict:
        runner = get_runner()
        result = await runner.generate_po(data)
        return result.model_dump()

    @activity.defn(name="match_invoice_v2")
    async def act_match_invoice(data: dict) -> dict:
        runner = get_runner()
        result = await runner.match_invoice(data)
        return result.model_dump()

    @activity.defn(name="verify_savings_v2")
    async def act_verify_savings(data: dict) -> dict:
        runner = get_runner()
        result = await runner.verify_savings(data)
        return result.model_dump()

    @activity.defn(name="track_prices_v2")
    async def act_track_prices(query: str) -> dict:
        runner = get_runner()
        result = await runner.track_prices(query)
        return result.model_dump()

    @activity.defn(name="discover_optimizations_v2")
    async def act_discover_optimizations(spend_data: dict) -> dict:
        runner = get_runner()
        result = await runner.discover_optimizations(spend_data)
        return result.model_dump()

    @activity.defn(name="send_notification_v2")
    async def act_send_notification(data: dict) -> dict:
        log.info(f"NOTIFICATION: {data.get('type', 'unknown')} to {data.get('recipient', 'unknown')}")
        return {"sent": True, "timestamp": datetime.utcnow().isoformat()}


# =============================================================================
# TEMPORAL WORKFLOWS
# =============================================================================

if HAS_TEMPORAL:
    LLM_RETRY = RetryPolicy(
        initial_interval=timedelta(seconds=2),
        maximum_interval=timedelta(seconds=30),
        maximum_attempts=3,
        non_retryable_error_types=["ValidationError"],
    )

    @workflow.defn(name="RequisitionToOrderV2")
    class RequisitionToOrderWorkflow:
        """Full req-to-PO pipeline. Durable, survives crashes."""

        def __init__(self):
            self.approval_decision: Optional[dict] = None

        @workflow.signal
        async def receive_approval(self, decision: dict):
            self.approval_decision = decision

        @workflow.run
        async def run(self, raw_input: dict) -> dict:
            # Step 1: Parse
            parsed = await workflow.execute_activity(
                "parse_requisition_v2", raw_input,
                start_to_close_timeout=timedelta(seconds=120),
                retry_policy=LLM_RETRY,
            )

            if parsed.get("requires_human_review"):
                await workflow.execute_activity(
                    "send_notification_v2",
                    {"type": "human_review_needed", "requisition": parsed},
                    start_to_close_timeout=timedelta(seconds=30),
                )
                try:
                    await workflow.wait_condition(
                        lambda: self.approval_decision is not None,
                        timeout=timedelta(hours=48),
                    )
                    if self.approval_decision and self.approval_decision.get("corrected"):
                        parsed = self.approval_decision["corrected"]
                    self.approval_decision = None
                except asyncio.TimeoutError:
                    return {"status": "timeout", "reason": "human_review_timeout"}

            # Step 2: Compliance
            compliance = await workflow.execute_activity(
                "check_compliance_v2", parsed,
                start_to_close_timeout=timedelta(seconds=120),
                retry_policy=LLM_RETRY,
            )

            if not compliance.get("is_compliant") and compliance.get("violations"):
                blocking = [v for v in compliance["violations"] if v.get("severity") == "block"]
                if blocking:
                    return {"status": "rejected", "reason": "compliance_violation", "violations": blocking}

            # Step 3: Aggregation
            aggregation = await workflow.execute_activity(
                "check_aggregation_v2", parsed,
                start_to_close_timeout=timedelta(seconds=60),
                retry_policy=LLM_RETRY,
            )

            # Step 4: Approval routing
            for step in compliance.get("required_approvals", []):
                await workflow.execute_activity(
                    "send_notification_v2",
                    {"type": "approval_request", "approver": step, "requisition": parsed},
                    start_to_close_timeout=timedelta(seconds=30),
                )
                try:
                    await workflow.wait_condition(
                        lambda: self.approval_decision is not None,
                        timeout=timedelta(hours=48),
                    )
                except asyncio.TimeoutError:
                    await workflow.execute_activity(
                        "send_notification_v2",
                        {"type": "approval_escalation", "overdue_approver": step},
                        start_to_close_timeout=timedelta(seconds=30),
                    )
                    await workflow.wait_condition(
                        lambda: self.approval_decision is not None,
                        timeout=timedelta(days=5),
                    )

                if not self.approval_decision or not self.approval_decision.get("approved"):
                    return {"status": "rejected", "reason": "approval_denied"}
                self.approval_decision = None

            # Step 5: Generate PO
            po = await workflow.execute_activity(
                "generate_purchase_order_v2",
                {"requisition": parsed, "compliance": compliance, "aggregation": aggregation},
                start_to_close_timeout=timedelta(seconds=120),
                retry_policy=LLM_RETRY,
            )

            return {
                "status": "completed",
                "po_number": po.get("po_number"),
                "total": po.get("total"),
                "requisition_id": parsed.get("req_id"),
            }

    @workflow.defn(name="SavingsVerificationV2")
    class SavingsVerificationWorkflow:
        """Monthly savings verification and billing."""

        @workflow.run
        async def run(self, period: dict) -> dict:
            claims = period.get("claims", [])
            verified = []
            for claim in claims:
                result = await workflow.execute_activity(
                    "verify_savings_v2", claim,
                    start_to_close_timeout=timedelta(minutes=5),
                    retry_policy=LLM_RETRY,
                )
                if result.get("confidence", 0) >= 0.6:
                    verified.append(result)

            total_savings = sum(r.get("total_savings", 0) for r in verified)
            talos_share = total_savings * 0.33

            await workflow.execute_activity(
                "send_notification_v2",
                {
                    "type": "savings_report",
                    "period": period.get("period_name", ""),
                    "total_savings": total_savings,
                    "talos_share": talos_share,
                    "claims_verified": len(verified),
                    "claims_rejected": len(claims) - len(verified),
                },
                start_to_close_timeout=timedelta(seconds=30),
            )

            return {
                "period": period.get("period_name"),
                "total_verified_savings": total_savings,
                "talos_share": talos_share,
                "verified_count": len(verified),
                "rejected_count": len(claims) - len(verified),
                "verified_records": verified,
            }


# =============================================================================
# CLI — Test, Demo, Worker, Cost Benchmarks
# =============================================================================

async def run_test():
    """Test the core agent pipeline with sample data."""
    config = TalosConfig.from_env()
    runner = AgentRunner(config.to_llm_config(), config.client_type, config.agent_tiers)
    cost_tracker = get_cost_tracker()

    print(f"\n{'='*60}")
    print(f"TALOS AI — Testing against {config.client_type.upper()}")
    print(f"Provider: {config.llm_provider}")
    print(f"{'='*60}\n")

    # Test 1: Intake Parser
    print("--- TEST 1: Intake Parser Agent ---")
    raw = RequisitionInput(
        raw_text="I need 50 boxes of nitrile gloves (medium, powder-free) for the chemistry lab. "
                 "Also 10 safety goggles. This is for Dr. Chen's NSF grant #2024-MCB-1234. "
                 "Need them by next Monday. Ship to Havemeyer Hall Room 302.",
        source_channel="email",
        requester_id="chen.lab",
        requester_name="Dr. Wei Chen",
        department="Chemistry",
    )
    parsed = await runner.parse_requisition(raw)
    print(f"  Parsed: {parsed.req_id}")
    print(f"  Items: {len(parsed.items)}")
    print(f"  Total: ${parsed.estimated_total:.2f}")
    print(f"  Category: {parsed.category}")
    print(f"  Urgency: {parsed.urgency}")
    print(f"  Funding: {parsed.funding_source.funding_type}")
    print(f"  Confidence: {parsed.confidence_score}")
    print(f"  Compliance flags: {parsed.compliance_flags}")
    print()

    # Test 2: Policy Compliance
    print("--- TEST 2: Policy Compliance Agent ---")
    compliance = await runner.check_compliance(parsed)
    print(f"  Compliant: {compliance.is_compliant}")
    print(f"  Violations: {len(compliance.violations)}")
    for v in compliance.violations:
        print(f"    [{v.severity}] {v.policy_name}: {v.description}")
    print(f"  Required approvals: {len(compliance.required_approvals)}")
    for a in compliance.required_approvals:
        print(f"    {a.approver_role}: {a.threshold_reason}")
    print(f"  Preferred vendors: {len(compliance.preferred_vendors)}")
    for v in compliance.preferred_vendors:
        print(f"    {v.vendor_name} ({v.match_type})")
    print(f"  Regulatory: {compliance.regulatory_requirements}")
    print()

    # Test 3: Demand Aggregation
    print("--- TEST 3: Demand Aggregation Agent ---")
    agg = await runner.check_aggregation(parsed)
    print(f"  Action: {agg.recommended_action}")
    print(f"  Consolidation savings: ${agg.consolidation_savings_estimate:.2f}")
    print(f"  Similar reqs: {agg.similar_recent_reqs}")
    print()

    # Test 4: Price Tracking
    print("--- TEST 4: Price Tracking Agent ---")
    prices = await runner.track_prices(
        "Nitrile examination gloves, medium, powder-free, 100/box. Need 50 boxes."
    )
    print(f"  Sources checked: {prices.sources_checked}")
    print(f"  Lowest: ${prices.lowest_price:.2f}")
    print(f"  Median: ${prices.median_price:.2f}")
    print(f"  Highest: ${prices.highest_price:.2f}")
    print(f"  Recommended: {prices.recommended_vendor} @ ${prices.recommended_price:.2f}")
    print()

    # Test 5: Knowledge Base
    print("--- TEST 5: Knowledge Base Agent ---")
    answer = await runner.ask_knowledge_base(
        "Can I buy lab equipment over $5,000 on my NSF grant without prior approval?"
    )
    print(f"  Answer: {answer[:300]}...")
    print()

    # Test 6: Proactive Optimization
    print("--- TEST 6: Proactive Optimization Agent ---")
    discovery = await runner.discover_optimizations({
        "scenario": "The Chemistry department bought nitrile gloves from Fisher Scientific at $12.50/box. "
                    "The Biology department bought the same gloves from VWR at $15.80/box. "
                    "The Medical School bought them from Medline at $11.20/box. "
                    "Total annual consumption across all departments: 5,000 boxes.",
    })
    print(f"  Type: {discovery.discovery_type}")
    print(f"  Description: {discovery.description[:200]}")
    print(f"  Est. annual savings: ${discovery.estimated_annual_savings:.2f}")
    print(f"  Confidence: {discovery.confidence}")
    print(f"  Priority: {discovery.priority}")
    print()

    # Cost summary
    summary = cost_tracker.get_summary()
    print(f"\n{'='*60}")
    print(f"LLM COST SUMMARY — {summary['total_calls']} calls, ${summary['total_cost_usd']:.4f} total")
    print(f"{'='*60}")
    for agent, cost in summary.get("by_agent", {}).items():
        print(f"  {agent:30s} | ${cost:.4f}")

    await runner.close()


async def run_cost_benchmark():
    """Benchmark the same prompt across model tiers to find optimal cost/quality."""
    config = TalosConfig.from_env()
    if config.llm_provider != "openrouter":
        print("Cost benchmarks only work with OpenRouter. Set TALOS_LLM_PROVIDER=openrouter")
        return

    test_prompt = (
        "I need 200 boxes of nitrile gloves for the chemistry department. "
        "Charge to operating budget CS-2025-OPS. Standard delivery."
    )

    system = build_agent_prompt("intake_parser", AGENT_PROMPTS["intake_parser"], "university")

    models_to_test = [
        ("deepseek/deepseek-chat-v3-0324:floor", "DeepSeek V3 (~$0.14/M)"),
        ("meta-llama/llama-3.3-70b-instruct:floor", "Llama 3.3 70B (~$0.30/M)"),
        ("mistralai/mistral-large-2411:floor", "Mistral Large (~$2/M)"),
        ("anthropic/claude-sonnet-4:floor", "Claude Sonnet 4 (~$3/M)"),
        ("google/gemini-2.0-flash-001:floor", "Gemini 2.0 Flash (~$0.10/M)"),
    ]

    print(f"\n{'='*70}")
    print(f"COST BENCHMARK: Intake Parser Agent")
    print(f"{'='*70}")
    print(f"{'Model':35s} | {'Cost':>8s} | {'In Tok':>7s} | {'Out Tok':>8s} | {'Latency':>8s}")
    print("-" * 70)

    llm_config = config.to_llm_config()
    router = LLMRouter(llm_config)

    for model_id, model_name in models_to_test:
        try:
            old_model = llm_config.tier_models["cheap"]["openrouter"]
            llm_config.tier_models["cheap"]["openrouter"] = model_id

            start = time.time()
            result, usage = await router.complete(
                tier="cheap",
                system_prompt=system,
                user_message=test_prompt,
                response_model=ParsedRequisition,
            )
            latency = (time.time() - start) * 1000

            print(
                f"{model_name:35s} | ${usage.get('total_cost', 0):>7.4f} | "
                f"{usage.get('prompt_tokens', 0):>7d} | "
                f"{usage.get('completion_tokens', 0):>8d} | {latency:>7.0f}ms"
            )

            llm_config.tier_models["cheap"]["openrouter"] = old_model
        except Exception as e:
            print(f"{model_name:35s} | ERROR: {str(e)[:40]}")

    await router.close()
    print()


async def run_demo():
    """Run a full demo pipeline: intake -> compliance -> aggregation -> PO."""
    config = TalosConfig.from_env()
    runner = AgentRunner(config.to_llm_config(), config.client_type, config.agent_tiers)
    cost_tracker = get_cost_tracker()

    print(f"\n{'='*60}")
    print(f"TALOS AI — Full Pipeline Demo ({config.client_type.upper()})")
    print(f"{'='*60}\n")

    scenarios = {
        "university": {
            "text": "We need to purchase a new Thermo Fisher Orbitrap mass spectrometer for the proteomics core facility. "
                    "Estimated cost is $750,000. This will be funded by NIH grant R01-GM-2024-5678. "
                    "We need it installed by September for the fall research cycle. "
                    "Please also include the 3-year service contract and training package.",
            "requester": "Dr. Sarah Martinez",
            "dept": "Biochemistry",
        },
        "nypa": {
            "text": "Need to procure 24 replacement transformer bushings (345kV) for the Clark Energy Center. "
                    "Also need 500 gallons of transformer oil (mineral, inhibited). "
                    "This is for the scheduled spring maintenance outage. Capital project CP-2025-0142. "
                    "Delivery required by April 1.",
            "requester": "Mike Thompson",
            "dept": "Generation Engineering",
        },
        "northwell": {
            "text": "Requesting 500 units of Medtronic StealthStation S8 cranial navigation disposable kits "
                    "for neurosurgery across Long Island Jewish, North Shore University, and Lenox Hill. "
                    "Current contract expires in 60 days. Also need 200 units of Stryker cranial fixation pins. "
                    "These are Class II medical devices. Check GPO pricing.",
            "requester": "Dr. Robert Kim",
            "dept": "Neurosurgery",
        },
    }

    scenario = scenarios.get(config.client_type, scenarios["university"])

    raw = RequisitionInput(
        raw_text=scenario["text"],
        source_channel="email",
        requester_name=scenario["requester"],
        department=scenario["dept"],
    )

    # Step 1
    print("STEP 1: Parsing request...")
    parsed = await runner.parse_requisition(raw)
    print(f"  -> {parsed.req_id} | {len(parsed.items)} items | ${parsed.estimated_total:,.2f} | "
          f"Confidence: {parsed.confidence_score}")
    print()

    # Step 2
    print("STEP 2: Checking compliance...")
    compliance = await runner.check_compliance(parsed)
    print(f"  -> Compliant: {compliance.is_compliant} | "
          f"{len(compliance.violations)} violations | "
          f"{len(compliance.required_approvals)} approvals needed")
    if compliance.violations:
        for v in compliance.violations[:3]:
            print(f"    ! [{v.severity}] {v.description[:80]}")
    for a in compliance.required_approvals[:3]:
        print(f"    + {a.approver_role}: {a.threshold_reason}")
    print()

    # Step 3
    print("STEP 3: Checking aggregation opportunities...")
    agg = await runner.check_aggregation(parsed)
    print(f"  -> Action: {agg.recommended_action} | Potential savings: ${agg.consolidation_savings_estimate:,.2f}")
    print()

    # Step 4
    print("STEP 4: Tracking prices...")
    prices = await runner.track_prices(parsed.items[0].description if parsed.items else scenario["text"][:100])
    print(f"  -> Checked {len(prices.sources_checked)} sources")
    print(f"  -> Range: ${prices.lowest_price:,.2f} - ${prices.highest_price:,.2f}")
    print(f"  -> Recommended: {prices.recommended_vendor} @ ${prices.recommended_price:,.2f}")
    print()

    # Summary
    print("=" * 60)
    print("PIPELINE COMPLETE")
    print("=" * 60)

    summary = cost_tracker.get_summary()
    print(f"\nLLM COST SUMMARY — {summary['total_calls']} calls, ${summary['total_cost_usd']:.4f} total")
    for agent, cost in summary.get("by_agent", {}).items():
        print(f"  {agent:30s} | ${cost:.4f}")

    await runner.close()


async def run_worker():
    """Start the Temporal worker."""
    if not HAS_TEMPORAL:
        print("ERROR: temporalio not installed. Run: pip install temporalio --break-system-packages")
        return

    config = TalosConfig.from_env()
    global _agent_runner
    _agent_runner = AgentRunner(config.to_llm_config(), config.client_type, config.agent_tiers)

    client = await TemporalClient.connect(config.temporal_address, namespace=config.temporal_namespace)

    activities = [
        act_parse_requisition,
        act_check_compliance,
        act_check_aggregation,
        act_generate_po,
        act_match_invoice,
        act_verify_savings,
        act_track_prices,
        act_discover_optimizations,
        act_send_notification,
    ]

    workflows = [RequisitionToOrderWorkflow, SavingsVerificationWorkflow]

    worker = Worker(
        client,
        task_queue=config.task_queue,
        workflows=workflows,
        activities=activities,
    )

    print(f"\n{'='*60}")
    print(f"TALOS WORKER STARTED")
    print(f"  Client: {config.client_type}")
    print(f"  LLM: {config.llm_provider}")
    print(f"  Task queue: {config.task_queue}")
    print(f"  Temporal: {config.temporal_address}")
    print(f"  Workflows: {[w.__name__ for w in workflows]}")
    print(f"  Activities: {[a.__name__ for a in activities]}")
    print(f"{'='*60}\n")

    await worker.run()


def show_info():
    """Show system configuration info."""
    config = TalosConfig.from_env()
    print(f"\nTalos Configuration:")
    print(f"  Client: {config.client_type}")
    print(f"  Provider: {config.llm_provider}")
    print(f"  API Key: {'SET' if config.openrouter_api_key else 'NOT SET'}")
    print(f"  Temporal: {config.temporal_address}")
    print(f"\nAgents ({len(AGENT_PROMPTS)}):")
    for name in AGENT_PROMPTS:
        tier = config.agent_tiers.get(name, "smart")
        model = config.tier_models[tier][config.llm_provider]
        print(f"  [{tier:6s}] {name:30s} -> {model}")
    print(f"\nConnectors:")
    try:
        from connectors.registry import CONNECTOR_REGISTRY
        for name in CONNECTOR_REGISTRY:
            print(f"  {name}")
    except ImportError:
        print("  (connector registry not available)")


def main():
    """CLI entry point."""
    if len(sys.argv) < 2:
        print("""
TALOS AI — Autonomous Procurement Intelligence Platform

Usage:
    python talos_system.py test          Run agent tests (requires OPENROUTER_API_KEY)
    python talos_system.py demo          Run full pipeline demo
    python talos_system.py cost-test     Benchmark costs across models
    python talos_system.py worker        Start Temporal worker
    python talos_system.py info          Show system info

Environment:
    OPENROUTER_API_KEY=sk-or-...         Required for OpenRouter
    TALOS_CLIENT=university              university | nypa | northwell
    TALOS_LLM_PROVIDER=openrouter        openrouter | bedrock
    TEMPORAL_ADDRESS=localhost:7233       Temporal server address
        """)
        return

    cmd = sys.argv[1].lower()

    if cmd == "test":
        asyncio.run(run_test())
    elif cmd == "demo":
        asyncio.run(run_demo())
    elif cmd == "cost-test":
        asyncio.run(run_cost_benchmark())
    elif cmd == "worker":
        asyncio.run(run_worker())
    elif cmd == "info":
        show_info()
    else:
        print(f"Unknown command: {cmd}")


if __name__ == "__main__":
    main()
