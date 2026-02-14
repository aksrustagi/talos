"""
Talos AI — Requisition-to-Order Workflow

Master workflow: Takes a raw request and produces a purchase order.
Orchestrates Agents 1 → 2 → 3 → 9 → 10 → 11.
All agent reasoning happens inside activities (plain Python + LLM calls).
"""

from datetime import timedelta
from typing import Optional

from temporalio import workflow
from temporalio.common import RetryPolicy

# Standard retry for LLM calls
LLM_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=2),
    maximum_interval=timedelta(seconds=30),
    maximum_attempts=3,
    non_retryable_error_types=["ValidationError"],
)

# Retry for external system calls (ERP, email)
EXTERNAL_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=5),
    maximum_interval=timedelta(minutes=5),
    maximum_attempts=5,
)


@workflow.defn
class RequisitionToOrderWorkflow:
    """
    Complete req-to-PO workflow. Durable — survives crashes, restarts, deployments.
    Human approval waits are native Temporal signals.
    """

    def __init__(self):
        self.approval_decision: Optional[dict] = None
        self.vendor_confirmation: Optional[dict] = None

    @workflow.signal
    async def receive_approval(self, decision: dict):
        """Human approver sends approval/rejection via signal."""
        self.approval_decision = decision

    @workflow.signal
    async def receive_vendor_confirmation(self, confirmation: dict):
        """Vendor acknowledges PO via signal."""
        self.vendor_confirmation = confirmation

    @workflow.run
    async def run(self, raw_input: dict) -> dict:

        # --- STEP 1: Parse request (Agent 1 — cheap LLM) ---
        parsed = await workflow.execute_activity(
            "parse_requisition",
            raw_input,
            start_to_close_timeout=timedelta(seconds=60),
            retry_policy=LLM_RETRY,
        )

        # If low confidence, wait for human review
        if parsed.get("requires_human_review"):
            await workflow.execute_activity(
                "notify_human_review_needed",
                parsed,
                start_to_close_timeout=timedelta(seconds=30),
            )
            # Wait up to 48h for human to review/correct
            await workflow.wait_condition(
                lambda: self.approval_decision is not None,
                timeout=timedelta(hours=48),
            )
            if self.approval_decision:
                parsed = self.approval_decision.get("corrected_requisition", parsed)
            self.approval_decision = None

        # --- STEP 2: Compliance check (Agent 2 — smart LLM) ---
        compliance = await workflow.execute_activity(
            "check_compliance",
            parsed,
            start_to_close_timeout=timedelta(seconds=120),
            retry_policy=LLM_RETRY,
        )

        if not compliance["is_compliant"]:
            await workflow.execute_activity(
                "notify_compliance_issues",
                {"requisition": parsed, "compliance": compliance},
                start_to_close_timeout=timedelta(seconds=30),
            )
            await workflow.wait_condition(
                lambda: self.approval_decision is not None,
                timeout=timedelta(days=7),
            )
            if not self.approval_decision or not self.approval_decision.get("resolved"):
                return {"status": "rejected", "reason": "compliance_unresolved"}
            self.approval_decision = None

        # --- STEP 3: Demand aggregation check (Agent 3 — cheap LLM) ---
        aggregation = await workflow.execute_activity(
            "check_aggregation",
            parsed,
            start_to_close_timeout=timedelta(seconds=60),
            retry_policy=LLM_RETRY,
        )

        if aggregation["recommended_action"] == "batch":
            await workflow.sleep(timedelta(days=int(aggregation.get("batch_days", 7))))
            aggregation = await workflow.execute_activity(
                "check_aggregation",
                parsed,
                start_to_close_timeout=timedelta(seconds=60),
            )

        # --- STEP 4: Route for approval (Agent 9) ---
        for approval_step in compliance["required_approvals"]:
            await workflow.execute_activity(
                "send_approval_request",
                {"requisition": parsed, "approver": approval_step},
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=EXTERNAL_RETRY,
            )

            # Wait for approval with escalation
            try:
                await workflow.wait_condition(
                    lambda: self.approval_decision is not None,
                    timeout=timedelta(hours=48),
                )
            except TimeoutError:
                await workflow.execute_activity(
                    "escalate_approval",
                    {"requisition": parsed, "overdue_approver": approval_step},
                    start_to_close_timeout=timedelta(seconds=30),
                )
                await workflow.wait_condition(
                    lambda: self.approval_decision is not None,
                    timeout=timedelta(days=5),
                )

            if not self.approval_decision or not self.approval_decision.get("approved"):
                return {
                    "status": "rejected",
                    "reason": "approval_denied",
                    "rejected_by": approval_step,
                }
            self.approval_decision = None

        # --- STEP 5: Generate PO (Agent 10) ---
        po = await workflow.execute_activity(
            "generate_purchase_order",
            {"requisition": parsed, "compliance": compliance, "aggregation": aggregation},
            start_to_close_timeout=timedelta(seconds=120),
            retry_policy=EXTERNAL_RETRY,
        )

        # --- STEP 6: Dispatch to vendor and wait for confirmation (Agent 11) ---
        await workflow.execute_activity(
            "dispatch_po_to_vendor",
            po,
            start_to_close_timeout=timedelta(seconds=60),
            retry_policy=EXTERNAL_RETRY,
        )

        # Wait for vendor acknowledgment with chase sequence
        for chase_day in [2, 3, 4]:
            try:
                await workflow.wait_condition(
                    lambda: self.vendor_confirmation is not None,
                    timeout=timedelta(days=chase_day),
                )
                break
            except TimeoutError:
                await workflow.execute_activity(
                    "chase_vendor_confirmation",
                    {"po": po, "attempt": chase_day},
                    start_to_close_timeout=timedelta(seconds=30),
                )

        return {
            "status": "completed",
            "po_number": po["po_number"],
            "requisition_id": parsed["req_id"],
            "vendor_confirmed": self.vendor_confirmation is not None,
            "total": po["total"],
        }
