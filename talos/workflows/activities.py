"""
Talos Temporal Activities — Thin wrappers around existing agent calls.

Each activity wraps one pipeline step. No business logic duplication —
all logic lives in TalosAgents / pipeline.py. Activities just provide
the Temporal execution boundary (retry, timeout, heartbeat).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from temporalio import activity

from ..agents.core import TalosAgents
from ..schemas import (
    ParsedRequisition, ComplianceResult, AggregationOpportunity,
    PriceTrackingResult, SavingsRecord, PurchaseOrder,
)

log = logging.getLogger("talos.workflows.activities")


@dataclass
class ActivityContext:
    """Shared state injected into activities via the worker."""
    agents: TalosAgents


# ---- Activity Implementations ----

@activity.defn
async def parse_requisition(
    raw_text: str,
    requester_name: str,
    department: str,
    channel: str,
) -> dict:
    """Step 1: Parse unstructured request into structured requisition."""
    ctx = activity.info().activity_id  # for logging
    log.info(f"[{ctx}] Parsing requisition...")
    agents: TalosAgents = _get_agents()
    result = await agents.intake_parser(
        raw_text, requester=requester_name, department=department, channel=channel
    )
    return result.model_dump()


@activity.defn
async def check_compliance(parsed_json: dict) -> dict:
    """Step 2: Check policy compliance."""
    log.info("Checking compliance...")
    agents = _get_agents()
    parsed = ParsedRequisition.model_validate(parsed_json)
    result = await agents.policy_compliance(parsed)
    return result.model_dump()


@activity.defn
async def check_aggregation(parsed_json: dict, recent_orders: list[dict] | None) -> dict:
    """Step 3: Check demand aggregation opportunities."""
    log.info("Checking aggregation...")
    agents = _get_agents()
    parsed = ParsedRequisition.model_validate(parsed_json)
    result = await agents.demand_aggregation(parsed, recent_orders)
    return result.model_dump()


@activity.defn
async def track_prices(
    item_description: str,
    current_price: float | None,
    quantity: int,
) -> dict:
    """Step 4: Track prices across sources."""
    log.info(f"Tracking prices for '{item_description}'...")
    agents = _get_agents()
    result = await agents.price_tracker(
        item_description=item_description,
        current_price=current_price,
        quantity=quantity,
    )
    return result.model_dump()


@activity.defn
async def generate_purchase_order(parsed_json: dict, compliance_json: dict) -> dict:
    """Step 5: Generate a purchase order."""
    log.info("Generating purchase order...")
    agents = _get_agents()
    parsed = ParsedRequisition.model_validate(parsed_json)
    compliance = ComplianceResult.model_validate(compliance_json)
    result = await agents.generate_po(parsed, compliance)
    return result.model_dump()


@activity.defn
async def drain_llm_history() -> list[dict]:
    """Drain LLM call history from the shared agents router."""
    agents = _get_agents()
    calls = agents.router.drain_history()
    return [c.model_dump() for c in calls]


def _get_agents() -> TalosAgents:
    """Retrieve the TalosAgents instance from the activity context."""
    # The ActivityContext is set on the worker via interceptors/state.
    # We use a module-level reference that the worker sets before starting.
    if _shared_agents is None:
        raise RuntimeError(
            "Activity agents not initialized. "
            "Ensure the Temporal worker sets the shared agents before starting."
        )
    return _shared_agents


# Module-level reference set by the worker
_shared_agents: TalosAgents | None = None


def set_shared_agents(agents: TalosAgents):
    """Called by the worker to inject shared TalosAgents."""
    global _shared_agents
    _shared_agents = agents
