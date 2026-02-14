"""
AuditLogger - Records every agent call with full context.

Designed to answer auditor questions like:
- "Why did the system choose this vendor?"
- "Why was this price accepted?"
- "Who approved this and when?"
"""

import json
import time
import uuid
from typing import Optional, Any

import structlog

from audit.database import AuditDatabase
from audit.models import AuditEntry

logger = structlog.get_logger()

# Approximate token costs per model (USD per 1K tokens)
MODEL_COSTS = {
    "claude-sonnet-4-20250514": {"input": 0.003, "output": 0.015},
    "claude-opus-4-20250514": {"input": 0.015, "output": 0.075},
    "claude-haiku-3-20250307": {"input": 0.00025, "output": 0.00125},
}

DEFAULT_COST = {"input": 0.003, "output": 0.015}


class AuditLogger:
    """
    Central audit logger that captures every agent interaction.

    Usage:
        audit = AuditLogger()

        # Start an execution (groups related calls)
        exec_id = audit.start_execution()

        # Log an agent call
        audit.log_agent_call(
            execution_id=exec_id,
            agent_name="vendor-selection",
            agent_tier=2,
            input_text="Compare vendors for lab supplies",
            output_text="Based on analysis, VendorA is recommended...",
            model_used="claude-sonnet-4-20250514",
            input_tokens=1500,
            output_tokens=800,
            decision="vendor_selected",
            reasoning="VendorA scored highest on price (30%) and quality (20%)",
            tool_calls=[{"name": "score_vendor", "args": {"vendor_id": "v001"}}],
            tool_results=[{"vendor_id": "v001", "score": 92}],
            requisition_id="REQ-2025-00847",
            triggered_by="user_001",
            trigger_type="user",
            user_email="buyer@university.edu",
            user_department="Chemistry",
            university_id="university_001",
        )
    """

    def __init__(self, db: Optional[AuditDatabase] = None):
        self.db = db or AuditDatabase()

    def start_execution(self) -> str:
        """Generate a unique execution ID to group related agent calls."""
        return f"exec_{uuid.uuid4().hex[:16]}"

    def log_agent_call(
        self,
        agent_name: str,
        input_text: str,
        output_text: str,
        model_used: str,
        triggered_by: str,
        trigger_type: str = "user",
        # Optional fields
        agent_tier: Optional[int] = None,
        input_tokens: Optional[int] = None,
        output_tokens: Optional[int] = None,
        cost_usd: Optional[float] = None,
        decision: Optional[str] = None,
        reasoning: Optional[str] = None,
        tool_calls: Optional[list] = None,
        tool_results: Optional[list] = None,
        requisition_id: Optional[str] = None,
        purchase_order_id: Optional[str] = None,
        contract_id: Optional[str] = None,
        user_email: Optional[str] = None,
        user_department: Optional[str] = None,
        university_id: Optional[str] = None,
        execution_id: Optional[str] = None,
        execution_duration_ms: Optional[int] = None,
    ) -> int:
        """
        Log a single agent call to the audit trail.

        Returns the row ID of the inserted entry.
        """
        # Auto-calculate cost if tokens are provided but cost is not
        if cost_usd is None and input_tokens and output_tokens:
            cost_usd = self._estimate_cost(model_used, input_tokens, output_tokens)

        # Serialize tool calls/results to JSON
        tool_calls_json = None
        if tool_calls:
            tool_calls_json = json.dumps(tool_calls, default=str)

        tool_results_json = None
        if tool_results:
            tool_results_json = json.dumps(tool_results, default=str)

        entry = AuditEntry(
            agent_name=agent_name,
            agent_tier=agent_tier,
            input_text=input_text,
            output_text=output_text,
            model_used=model_used,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost_usd,
            decision=decision,
            reasoning=reasoning,
            tool_calls=tool_calls_json,
            tool_results=tool_results_json,
            requisition_id=requisition_id,
            purchase_order_id=purchase_order_id,
            contract_id=contract_id,
            triggered_by=triggered_by,
            trigger_type=trigger_type,
            user_email=user_email,
            user_department=user_department,
            university_id=university_id,
            execution_id=execution_id,
            execution_duration_ms=execution_duration_ms,
        )

        row_id = self.db.insert(entry)

        logger.info(
            "Audit entry logged",
            row_id=row_id,
            agent=agent_name,
            decision=decision,
            requisition_id=requisition_id,
            cost_usd=cost_usd,
        )

        return row_id

    def get_decision_chain(self, requisition_id: str) -> dict:
        """
        Get the complete decision chain for a requisition.

        Returns a structured view answering:
        - What agents were involved?
        - What decisions were made and why?
        - What was the total cost?
        - Who triggered each action?
        """
        entries = self.db.query_by_requisition(requisition_id)

        if not entries:
            return {
                "requisition_id": requisition_id,
                "total_entries": 0,
                "decision_chain": [],
                "summary": {
                    "requisition_id": requisition_id,
                    "agents_involved": [],
                    "total_decisions": 0,
                    "total_cost_usd": 0.0,
                },
            }

        # Build summary
        agents_involved = list(dict.fromkeys(e.agent_name for e in entries))
        decisions = [e for e in entries if e.decision]
        total_cost = sum(e.cost_usd or 0 for e in entries)
        total_duration = sum(e.execution_duration_ms or 0 for e in entries)

        # Extract vendor-related info from tool calls
        vendors_evaluated = set()
        approval_chain = []

        for entry in entries:
            if entry.tool_calls:
                try:
                    calls = json.loads(entry.tool_calls)
                    for call in calls:
                        if call.get("name") in ("score_vendor", "assess_vendor_risk"):
                            vid = call.get("args", {}).get("vendor_id")
                            if vid:
                                vendors_evaluated.add(vid)
                except (json.JSONDecodeError, TypeError):
                    pass

            if entry.decision in ("approved", "rejected", "delegated"):
                approval_chain.append({
                    "timestamp": entry.timestamp,
                    "decision": entry.decision,
                    "by": entry.triggered_by,
                    "email": entry.user_email,
                    "reasoning": entry.reasoning,
                })

        # Final decision is the last one with a decision field
        final = decisions[-1] if decisions else None

        summary = {
            "requisition_id": requisition_id,
            "first_action": entries[0].timestamp,
            "last_action": entries[-1].timestamp,
            "agents_involved": agents_involved,
            "total_decisions": len(decisions),
            "total_cost_usd": round(total_cost, 6),
            "total_duration_ms": total_duration,
            "vendors_evaluated": sorted(vendors_evaluated),
            "final_decision": final.decision if final else None,
            "final_reasoning": final.reasoning if final else None,
            "approval_chain": approval_chain,
        }

        return {
            "requisition_id": requisition_id,
            "total_entries": len(entries),
            "decision_chain": [e.model_dump() for e in entries],
            "summary": summary,
        }

    def _estimate_cost(
        self, model: str, input_tokens: int, output_tokens: int
    ) -> float:
        """Estimate USD cost based on model and token counts."""
        rates = MODEL_COSTS.get(model, DEFAULT_COST)
        cost = (input_tokens / 1000 * rates["input"]) + (
            output_tokens / 1000 * rates["output"]
        )
        return round(cost, 6)


class AuditContext:
    """
    Context manager for timing agent executions and automatically logging.

    Usage:
        async with AuditContext(audit_logger, agent_name="requisition", ...) as ctx:
            result = await agent.run(message)
            ctx.set_output(result["response"])
            ctx.set_decision("created", "Budget available, policy compliant")
    """

    def __init__(
        self,
        audit_logger: AuditLogger,
        agent_name: str,
        model_used: str,
        triggered_by: str,
        trigger_type: str = "user",
        execution_id: Optional[str] = None,
        **kwargs,
    ):
        self.audit_logger = audit_logger
        self.agent_name = agent_name
        self.model_used = model_used
        self.triggered_by = triggered_by
        self.trigger_type = trigger_type
        self.execution_id = execution_id
        self.extra_kwargs = kwargs
        self._start_time: Optional[float] = None
        self._input_text: str = ""
        self._output_text: str = ""
        self._decision: Optional[str] = None
        self._reasoning: Optional[str] = None
        self._tool_calls: Optional[list] = None
        self._tool_results: Optional[list] = None
        self._input_tokens: Optional[int] = None
        self._output_tokens: Optional[int] = None

    async def __aenter__(self):
        self._start_time = time.monotonic()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        duration_ms = int((time.monotonic() - self._start_time) * 1000)

        self.audit_logger.log_agent_call(
            agent_name=self.agent_name,
            input_text=self._input_text,
            output_text=self._output_text,
            model_used=self.model_used,
            triggered_by=self.triggered_by,
            trigger_type=self.trigger_type,
            decision=self._decision,
            reasoning=self._reasoning,
            tool_calls=self._tool_calls,
            tool_results=self._tool_results,
            input_tokens=self._input_tokens,
            output_tokens=self._output_tokens,
            execution_id=self.execution_id,
            execution_duration_ms=duration_ms,
            **self.extra_kwargs,
        )

        return False  # Don't suppress exceptions

    def set_input(self, text: str):
        self._input_text = text

    def set_output(self, text: str):
        self._output_text = text

    def set_decision(self, decision: str, reasoning: str):
        self._decision = decision
        self._reasoning = reasoning

    def set_tool_calls(self, calls: list):
        self._tool_calls = calls

    def set_tool_results(self, results: list):
        self._tool_results = results

    def set_tokens(self, input_tokens: int, output_tokens: int):
        self._input_tokens = input_tokens
        self._output_tokens = output_tokens
