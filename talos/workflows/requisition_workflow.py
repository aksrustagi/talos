"""
Talos Requisition Workflow — Durable pipeline execution via Temporal.

This workflow mirrors the steps in pipeline.py but runs durably:
- Each step is an activity with automatic retry
- Approval step uses Temporal signals to pause and wait for human input
- Workflow state is queryable at any time
- If the worker crashes mid-pipeline, Temporal resumes from last checkpoint
"""
from __future__ import annotations

import logging
from datetime import timedelta
from dataclasses import dataclass, field

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from ..schemas import (
        ParsedRequisition, ComplianceResult, AggregationOpportunity,
        PriceTrackingResult, SavingsRecord, PurchaseOrder,
    )
    from . import activities

log = logging.getLogger("talos.workflows.requisition")

# Retry policy for LLM-calling activities: retry on transient failures
_LLM_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=2),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(seconds=30),
    maximum_attempts=3,
)

# Timeout for each activity (LLM calls can be slow)
_ACTIVITY_TIMEOUT = timedelta(minutes=3)


@dataclass
class RequisitionWorkflowInput:
    """Input for the requisition workflow."""
    raw_text: str
    requester_name: str = ""
    department: str = ""
    channel: str = "portal"
    recent_orders: list[dict] | None = None
    auto_generate_po: bool = False
    pipeline_id: str = ""


@dataclass
class WorkflowState:
    """Queryable workflow state."""
    pipeline_id: str = ""
    status: str = "received"
    current_step: str = ""
    parsed_json: dict | None = None
    compliance_json: dict | None = None
    aggregation_json: dict | None = None
    pricing_json: dict | None = None
    savings_json: dict | None = None
    po_json: dict | None = None
    total_llm_cost: float = 0.0
    errors: list[str] = field(default_factory=list)
    approval_decision: str | None = None  # "approved" or "rejected"


@workflow.defn
class RequisitionWorkflow:
    """
    Durable requisition pipeline workflow.

    Steps: parse -> comply -> aggregate -> price -> [approve] -> [PO]
    """

    def __init__(self):
        self.state = WorkflowState()

    @workflow.run
    async def run(self, input: RequisitionWorkflowInput) -> dict:
        self.state.pipeline_id = input.pipeline_id
        self.state.status = "running"

        try:
            # ---- STEP 1: Parse ----
            self.state.current_step = "parsing"
            self.state.parsed_json = await workflow.execute_activity(
                activities.parse_requisition,
                args=[input.raw_text, input.requester_name, input.department, input.channel],
                start_to_close_timeout=_ACTIVITY_TIMEOUT,
                retry_policy=_LLM_RETRY,
            )
            self.state.status = "parsed"

            # ---- STEP 2: Compliance ----
            self.state.current_step = "compliance"
            self.state.compliance_json = await workflow.execute_activity(
                activities.check_compliance,
                args=[self.state.parsed_json],
                start_to_close_timeout=_ACTIVITY_TIMEOUT,
                retry_policy=_LLM_RETRY,
            )
            self.state.status = "compliance_checked"

            # Check for blocking violations
            compliance = ComplianceResult.model_validate(self.state.compliance_json)
            blocking = [v for v in compliance.violations if v.severity == "block"]
            if blocking:
                self.state.status = "compliance_blocked"

            # ---- STEP 3: Aggregation ----
            self.state.current_step = "aggregation"
            self.state.aggregation_json = await workflow.execute_activity(
                activities.check_aggregation,
                args=[self.state.parsed_json, input.recent_orders],
                start_to_close_timeout=_ACTIVITY_TIMEOUT,
                retry_policy=_LLM_RETRY,
            )
            if self.state.status != "compliance_blocked":
                self.state.status = "aggregation_checked"

            # ---- STEP 4: Price Tracking ----
            parsed = ParsedRequisition.model_validate(self.state.parsed_json)
            if parsed.items:
                self.state.current_step = "pricing"
                item_desc = parsed.items[0].description
                current_price = parsed.items[0].estimated_unit_price
                qty = sum(item.quantity for item in parsed.items)

                self.state.pricing_json = await workflow.execute_activity(
                    activities.track_prices,
                    args=[item_desc, current_price, qty],
                    start_to_close_timeout=_ACTIVITY_TIMEOUT,
                    retry_policy=_LLM_RETRY,
                )
                if self.state.status != "compliance_blocked":
                    self.state.status = "priced"

                # Check for savings
                pricing = PriceTrackingResult.model_validate(self.state.pricing_json)
                if current_price and pricing.recommended_price < current_price:
                    from datetime import datetime, timezone
                    savings = SavingsRecord(
                        category=parsed.category,
                        description=f"Price improvement for {item_desc}",
                        baseline_price=current_price,
                        new_price=pricing.recommended_price,
                        volume=qty,
                        period=datetime.now(timezone.utc).strftime("%Y-%m"),
                        evidence=[f"Price tracking: {pricing.recommended_vendor}"],
                    ).calculate()
                    self.state.savings_json = savings.model_dump()

            # ---- STEP 5: Approval Wait (if needed) ----
            if (
                input.auto_generate_po
                and self.state.status == "priced"
                and compliance.is_compliant
                and compliance.required_approvals
            ):
                self.state.current_step = "awaiting_approval"
                self.state.status = "awaiting_approval"

                # Wait for approval signal (up to 7 days)
                approved = await workflow.wait_condition(
                    lambda: self.state.approval_decision is not None,
                    timeout=timedelta(days=7),
                )

                if not approved:
                    self.state.status = "approval_timeout"
                elif self.state.approval_decision == "approved":
                    self.state.status = "approved"
                else:
                    self.state.status = "rejected"

            # ---- STEP 6: PO Generation (if auto and approved) ----
            can_generate = (
                input.auto_generate_po
                and self.state.status in ("priced", "approved")
                and compliance.is_compliant
            )
            if can_generate and not compliance.required_approvals:
                # No approval needed, generate directly
                self.state.current_step = "po_generation"
                self.state.po_json = await workflow.execute_activity(
                    activities.generate_purchase_order,
                    args=[self.state.parsed_json, self.state.compliance_json],
                    start_to_close_timeout=_ACTIVITY_TIMEOUT,
                    retry_policy=_LLM_RETRY,
                )
                self.state.status = "po_generated"
            elif can_generate and self.state.status == "approved":
                self.state.current_step = "po_generation"
                self.state.po_json = await workflow.execute_activity(
                    activities.generate_purchase_order,
                    args=[self.state.parsed_json, self.state.compliance_json],
                    start_to_close_timeout=_ACTIVITY_TIMEOUT,
                    retry_policy=_LLM_RETRY,
                )
                self.state.status = "po_generated"

            # Drain LLM costs
            cost_data = await workflow.execute_activity(
                activities.drain_llm_history,
                start_to_close_timeout=timedelta(seconds=10),
            )
            self.state.total_llm_cost = sum(c.get("cost", 0) for c in cost_data)

        except Exception as e:
            self.state.errors.append(str(e))
            self.state.status = "error"

        self.state.current_step = "complete"
        return self._build_result()

    @workflow.signal
    async def approve(self):
        """Signal to approve the pipeline."""
        self.state.approval_decision = "approved"

    @workflow.signal
    async def reject(self):
        """Signal to reject the pipeline."""
        self.state.approval_decision = "rejected"

    @workflow.query
    def get_status(self) -> dict:
        """Query current workflow state."""
        return {
            "pipeline_id": self.state.pipeline_id,
            "status": self.state.status,
            "current_step": self.state.current_step,
            "has_parsed": self.state.parsed_json is not None,
            "has_compliance": self.state.compliance_json is not None,
            "has_pricing": self.state.pricing_json is not None,
            "has_savings": self.state.savings_json is not None,
            "has_po": self.state.po_json is not None,
            "total_llm_cost": self.state.total_llm_cost,
            "errors": self.state.errors,
        }

    def _build_result(self) -> dict:
        """Build the final pipeline result dict."""
        return {
            "pipeline_id": self.state.pipeline_id,
            "status": self.state.status,
            "parsed": self.state.parsed_json,
            "compliance": self.state.compliance_json,
            "aggregation": self.state.aggregation_json,
            "pricing": self.state.pricing_json,
            "savings": self.state.savings_json,
            "purchase_order": self.state.po_json,
            "total_llm_cost": self.state.total_llm_cost,
            "errors": self.state.errors,
        }
