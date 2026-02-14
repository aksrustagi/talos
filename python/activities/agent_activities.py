"""
Temporal Activity Definitions — Agent Wrappers

Thin wrappers that call agent.run() as Temporal activities.
Separated from worker.py so that workflows/requisition.py can
import these without circular dependency.
"""

from temporalio import activity


# Lazy-initialised agent singletons.  We defer the import to avoid pulling
# the full langgraph/langchain dependency graph at module-import time,
# which keeps the module lightweight and avoids import-order issues in tests.
_agents: dict = {}


def _get_agent(agent_id: str):
    if agent_id not in _agents:
        from agents import (
            PriceWatchAgent,
            PriceCompareAgent,
            HistoricalPriceAgent,
            RequisitionAgent,
            ApprovalWorkflowAgent,
            VendorSelectionAgent,
        )

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


# ------------------------------------------------------------------ #
# One activity per agent — each just calls agent.run()
# ------------------------------------------------------------------ #

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


# ------------------------------------------------------------------ #
# Exports
# ------------------------------------------------------------------ #

ALL_AGENT_ACTIVITIES = [
    run_requisition_agent,
    run_vendor_selection_agent,
    run_price_compare_agent,
    run_price_watch_agent,
    run_historical_price_agent,
    run_approval_workflow_agent,
]
