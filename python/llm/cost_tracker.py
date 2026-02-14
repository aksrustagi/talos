"""
Talos AI — LLM Cost Tracker

Per-agent cost monitoring and reporting.
Tracks token usage and cost across all LLM calls for budgeting and optimization.
"""

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class LLMCallRecord:
    """Record of a single LLM call."""
    agent_name: str
    model: str
    tier: str
    prompt_tokens: int
    completion_tokens: int
    cost_usd: float
    timestamp: datetime = field(default_factory=datetime.utcnow)
    workflow_id: Optional[str] = None
    requisition_id: Optional[str] = None
    latency_ms: float = 0.0


class CostTracker:
    """
    Track LLM costs per agent, per tier, per workflow.
    Use during development to find cheapest model per agent.
    Use in production to monitor spend and detect anomalies.
    """

    def __init__(self):
        self._records: list[LLMCallRecord] = []
        self._totals_by_agent: dict[str, float] = defaultdict(float)
        self._totals_by_tier: dict[str, float] = defaultdict(float)
        self._totals_by_model: dict[str, float] = defaultdict(float)

    def record(self, call: LLMCallRecord):
        """Record an LLM call."""
        self._records.append(call)
        self._totals_by_agent[call.agent_name] += call.cost_usd
        self._totals_by_tier[call.tier] += call.cost_usd
        self._totals_by_model[call.model] += call.cost_usd

        logger.info(
            "LLM cost recorded",
            extra={
                "agent": call.agent_name,
                "model": call.model,
                "cost": f"${call.cost_usd:.6f}",
                "tokens": call.prompt_tokens + call.completion_tokens,
            },
        )

    def get_summary(self) -> dict:
        """Get cost summary across all dimensions."""
        total = sum(r.cost_usd for r in self._records)
        return {
            "total_cost_usd": total,
            "total_calls": len(self._records),
            "total_tokens": sum(
                r.prompt_tokens + r.completion_tokens for r in self._records
            ),
            "by_agent": dict(self._totals_by_agent),
            "by_tier": dict(self._totals_by_tier),
            "by_model": dict(self._totals_by_model),
        }

    def get_agent_summary(self, agent_name: str) -> dict:
        """Get cost summary for a specific agent."""
        agent_records = [r for r in self._records if r.agent_name == agent_name]
        return {
            "agent": agent_name,
            "total_cost_usd": sum(r.cost_usd for r in agent_records),
            "total_calls": len(agent_records),
            "avg_cost_per_call": (
                sum(r.cost_usd for r in agent_records) / len(agent_records)
                if agent_records
                else 0
            ),
            "avg_tokens_per_call": (
                sum(r.prompt_tokens + r.completion_tokens for r in agent_records)
                / len(agent_records)
                if agent_records
                else 0
            ),
        }

    def print_summary(self):
        """Print a formatted cost summary to stdout."""
        s = self.get_summary()
        print(f"\n{'='*60}")
        print(f"LLM COST SUMMARY — {s['total_calls']} calls, ${s['total_cost_usd']:.4f} total")
        print(f"{'='*60}")
        for agent, cost in s.get("by_agent", {}).items():
            agent_records = [r for r in self._records if r.agent_name == agent]
            calls = len(agent_records)
            avg_latency = (
                sum(r.latency_ms for r in agent_records) / calls if calls else 0
            )
            print(f"  {agent:30s} | {calls:3d} calls | ${cost:.4f} | {avg_latency:.0f}ms avg")


# Global singleton for the application
_tracker: Optional[CostTracker] = None


def get_cost_tracker() -> CostTracker:
    """Get the global cost tracker instance."""
    global _tracker
    if _tracker is None:
        _tracker = CostTracker()
    return _tracker
