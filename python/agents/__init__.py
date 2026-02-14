"""
Procurement AI Agents Package

Provides LangGraph-based AI agents for university procurement,
plus the unified AgentRunner for Temporal/CLI operation.
"""

from agents.runner import AgentRunner, AGENT_PROMPTS

try:
    from agents.core.base_agent import (
        ProcurementAgent,
        AgentConfig,
        AgentState,
        AgentFactory,
        AgentOrchestrator,
    )
except ImportError:
    # LangGraph dependencies may not be installed
    ProcurementAgent = None
    AgentConfig = None
    AgentState = None
    AgentFactory = None
    AgentOrchestrator = None

try:
    from agents.implementations.price_agents import (
        PriceWatchAgent,
        PriceCompareAgent,
        HistoricalPriceAgent,
    )
except ImportError:
    PriceWatchAgent = None
    PriceCompareAgent = None
    HistoricalPriceAgent = None

try:
    from agents.implementations.procurement_agents import (
        RequisitionAgent,
        ApprovalWorkflowAgent,
        VendorSelectionAgent,
    )
except ImportError:
    RequisitionAgent = None
    ApprovalWorkflowAgent = None
    VendorSelectionAgent = None

__all__ = [
    # Unified runner
    "AgentRunner",
    "AGENT_PROMPTS",
    # Base classes (LangGraph)
    "ProcurementAgent",
    "AgentConfig",
    "AgentState",
    "AgentFactory",
    "AgentOrchestrator",
    # Price agents (LangGraph)
    "PriceWatchAgent",
    "PriceCompareAgent",
    "HistoricalPriceAgent",
    # Procurement agents (LangGraph)
    "RequisitionAgent",
    "ApprovalWorkflowAgent",
    "VendorSelectionAgent",
]
