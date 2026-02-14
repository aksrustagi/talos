"""
Temporal Worker

Wraps each procurement agent method as a Temporal activity.
The agents in agents/core.py stay exactly as they are —
Temporal just calls them instead of the pipeline runner calling them directly.
"""

import asyncio
import os
from typing import Optional

from temporalio import activity
from temporalio.client import Client
from temporalio.worker import Worker

from agents import (
    PriceWatchAgent,
    PriceCompareAgent,
    HistoricalPriceAgent,
    RequisitionAgent,
    ApprovalWorkflowAgent,
    VendorSelectionAgent,
)

# Activities from procurement_workflows are imported at module level
# because requisition.py references them via workflow.execute_activity().
# Workflow classes are imported lazily in run_worker() to avoid a circular
# import: workflows/requisition.py -> worker.py -> workflows/requisition.py.
from workflows.procurement_workflows import (
    validate_budget,
    determine_approvers,
    send_approval_notification,
    check_approval_status,
    generate_purchase_order,
    send_po_to_vendor,
    escalate_approval,
    parse_invoice,
    find_matching_po,
    match_invoice_lines,
    validate_contract_prices,
    verify_receipts,
    approve_invoice,
    create_exception,
    analyze_contract_performance,
    generate_renewal_recommendation,
    fetch_vendor_catalog,
    normalize_catalog,
    detect_price_changes,
    notify_price_changes,
)


TASK_QUEUE = os.environ.get("TEMPORAL_TASK_QUEUE", "talos-procurement")
TEMPORAL_HOST = os.environ.get("TEMPORAL_HOST", "localhost:7233")


# ============================================
# Lazily-initialized agent singletons
# ============================================

_agents: dict = {}


def _get_agent(agent_id: str):
    """Get or create an agent singleton."""
    if agent_id not in _agents:
        agent_map = {
            "price-watch": PriceWatchAgent,
            "price-compare": PriceCompareAgent,
            "historical-price": HistoricalPriceAgent,
            "requisition": RequisitionAgent,
            "approval-workflow": ApprovalWorkflowAgent,
            "vendor-selection": VendorSelectionAgent,
        }
        cls = agent_map.get(agent_id)
        if cls is None:
            raise ValueError(f"Unknown agent: {agent_id}")
        _agents[agent_id] = cls()
    return _agents[agent_id]


# ============================================
# Activity wrappers — one per agent
# Each calls agent.run() with full context
# ============================================

@activity.defn
async def run_requisition_agent(
    message: str,
    user_id: str,
    university_id: str,
    context: dict,
) -> dict:
    """Run the Requisition Agent as a Temporal activity."""
    agent = _get_agent("requisition")
    return await agent.run(message, user_id, university_id, context)


@activity.defn
async def run_vendor_selection_agent(
    message: str,
    user_id: str,
    university_id: str,
    context: dict,
) -> dict:
    """Run the Vendor Selection Agent as a Temporal activity."""
    agent = _get_agent("vendor-selection")
    return await agent.run(message, user_id, university_id, context)


@activity.defn
async def run_price_compare_agent(
    message: str,
    user_id: str,
    university_id: str,
    context: dict,
) -> dict:
    """Run the Price Compare Agent as a Temporal activity."""
    agent = _get_agent("price-compare")
    return await agent.run(message, user_id, university_id, context)


@activity.defn
async def run_price_watch_agent(
    message: str,
    user_id: str,
    university_id: str,
    context: dict,
) -> dict:
    """Run the PriceWatch Agent as a Temporal activity."""
    agent = _get_agent("price-watch")
    return await agent.run(message, user_id, university_id, context)


@activity.defn
async def run_historical_price_agent(
    message: str,
    user_id: str,
    university_id: str,
    context: dict,
) -> dict:
    """Run the Historical Price Agent as a Temporal activity."""
    agent = _get_agent("historical-price")
    return await agent.run(message, user_id, university_id, context)


@activity.defn
async def run_approval_workflow_agent(
    message: str,
    user_id: str,
    university_id: str,
    context: dict,
) -> dict:
    """Run the Approval Workflow Agent as a Temporal activity."""
    agent = _get_agent("approval-workflow")
    return await agent.run(message, user_id, university_id, context)


# ============================================
# All activities list (for worker registration)
# ============================================

AGENT_ACTIVITIES = [
    run_requisition_agent,
    run_vendor_selection_agent,
    run_price_compare_agent,
    run_price_watch_agent,
    run_historical_price_agent,
    run_approval_workflow_agent,
]

# Activities from the existing procurement workflows
PROCUREMENT_ACTIVITIES = [
    validate_budget,
    determine_approvers,
    send_approval_notification,
    check_approval_status,
    generate_purchase_order,
    send_po_to_vendor,
    escalate_approval,
    parse_invoice,
    find_matching_po,
    match_invoice_lines,
    validate_contract_prices,
    verify_receipts,
    approve_invoice,
    create_exception,
    analyze_contract_performance,
    generate_renewal_recommendation,
    fetch_vendor_catalog,
    normalize_catalog,
    detect_price_changes,
    notify_price_changes,
]

ALL_ACTIVITIES = AGENT_ACTIVITIES + PROCUREMENT_ACTIVITIES


async def run_worker():
    """Connect to Temporal and run the worker."""
    # Import workflow classes here (not at module level) to avoid a circular
    # import: workflows/requisition.py → worker → workflows/requisition.py
    from workflows.requisition import RequisitionToOrderWorkflow
    from workflows.procurement_workflows import (
        RequisitionApprovalWorkflow,
        InvoiceValidationWorkflow,
        CatalogSyncWorkflow,
        ContractRenewalWorkflow,
    )

    all_workflows = [
        RequisitionToOrderWorkflow,
        RequisitionApprovalWorkflow,
        InvoiceValidationWorkflow,
        CatalogSyncWorkflow,
        ContractRenewalWorkflow,
    ]

    client = await Client.connect(TEMPORAL_HOST)

    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=all_workflows,
        activities=ALL_ACTIVITIES,
    )

    print(f"Temporal worker started on task queue: {TASK_QUEUE}")
    print(f"  Workflows: {[w.__name__ for w in all_workflows]}")
    print(f"  Activities: {[a.__name__ for a in ALL_ACTIVITIES]}")

    await worker.run()


if __name__ == "__main__":
    asyncio.run(run_worker())
