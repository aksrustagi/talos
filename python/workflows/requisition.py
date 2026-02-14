"""
Requisition-to-Order Temporal Workflow

Orchestrates the full requisition lifecycle by calling existing agents
as Temporal activities. The agents stay exactly as they are —
this workflow just calls them in sequence with retry policies
and human-approval signal support.

Flow:
  1. Requisition Agent — parse request, validate budget, create requisition
  2. Vendor Selection Agent — evaluate and recommend vendors
  3. Price Compare Agent — compare pricing across recommended vendors
  4. (Signal) Human Approval — wait for human to approve/reject
  5. Approval Workflow Agent — process the approval decision
  6. Generate Purchase Order — finalize and transmit PO
"""

import uuid
from dataclasses import dataclass
from datetime import timedelta
from typing import Optional, List

from temporalio import workflow
from temporalio.common import RetryPolicy

# Activities are imported at runtime by Temporal from the worker registration.
# We use string-based activity references via workflow.execute_activity()
# with the functions imported here for type checking only.
with workflow.unsafe.imports_passed_through():
    from worker import (
        run_requisition_agent,
        run_vendor_selection_agent,
        run_price_compare_agent,
        run_approval_workflow_agent,
    )
    from workflows.procurement_workflows import (
        validate_budget,
        generate_purchase_order,
        send_po_to_vendor,
    )


@dataclass
class RequisitionInput:
    """Input data for the RequisitionToOrder workflow."""
    items: List[dict]
    budget_code: str
    urgency: str  # standard, rush, emergency
    user_id: str
    university_id: str
    user_email: str
    department: str
    needed_by: Optional[str] = None
    notes: Optional[str] = None


# Default retry: 3 attempts with backoff
AGENT_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=2),
    backoff_coefficient=2.0,
    maximum_attempts=3,
    maximum_interval=timedelta(seconds=30),
)


@workflow.defn
class RequisitionToOrderWorkflow:
    """
    Durable workflow that takes a requisition from creation through
    vendor selection, pricing, human approval, and PO generation.

    Uses existing agents as activities — no agent logic changes.
    """

    def __init__(self):
        self.current_step = "initialized"
        self.approval_decision: Optional[str] = None  # "approve" or "reject"
        self.approval_comments: Optional[str] = None
        self.approver_id: Optional[str] = None
        self.requisition_id: Optional[str] = None
        self.workflow_run_id: str = ""

    # ---- Signals for human approval ----

    @workflow.signal
    async def human_approval(
        self,
        decision: str,
        approver_id: str,
        comments: Optional[str] = None,
    ):
        """Signal sent when a human approves or rejects the requisition."""
        self.approval_decision = decision
        self.approver_id = approver_id
        self.approval_comments = comments

    # ---- Queries ----

    @workflow.query
    def get_status(self) -> dict:
        return {
            "current_step": self.current_step,
            "requisition_id": self.requisition_id,
            "approval_decision": self.approval_decision,
            "approver_id": self.approver_id,
        }

    # ---- Main workflow ----

    @workflow.run
    async def run(self, input: RequisitionInput) -> dict:
        self.workflow_run_id = workflow.info().workflow_id

        # Shared context passed to every agent for audit trail linkage
        def _ctx(step: str, extra: Optional[dict] = None) -> dict:
            ctx = {
                "user_name": input.user_email.split("@")[0],
                "department": input.department,
                "budget_code": input.budget_code,
                "university_name": "University",
                "diversity_goal": "15",
                "workflow_run_id": self.workflow_run_id,
                "workflow_step": step,
                "triggered_by": "system",
                "user_email": input.user_email,
            }
            if self.requisition_id:
                ctx["requisition_id"] = self.requisition_id
            if extra:
                ctx.update(extra)
            return ctx

        # ======================================
        # Step 1: Budget Validation
        # ======================================
        self.current_step = "validating_budget"

        total = sum(
            item.get("unit_price", 0) * item.get("quantity", 1)
            for item in input.items
        )

        budget_check = await workflow.execute_activity(
            validate_budget,
            args=[input.budget_code, total],
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=AGENT_RETRY,
        )

        if not budget_check.get("available", False):
            return {
                "status": "rejected",
                "reason": "Insufficient budget",
                "budget_check": budget_check,
            }

        # ======================================
        # Step 2: Requisition Agent
        # ======================================
        self.current_step = "creating_requisition"

        items_desc = "\n".join(
            f"- {item.get('description', 'Item')}: qty {item.get('quantity', 1)} @ ${item.get('unit_price', 0)}"
            for item in input.items
        )
        req_message = (
            f"Create a requisition with the following details:\n"
            f"Items:\n{items_desc}\n"
            f"Budget Code: {input.budget_code}\n"
            f"Urgency: {input.urgency}\n"
            f"Needed By: {input.needed_by or 'Not specified'}\n"
            f"Notes: {input.notes or 'None'}"
        )

        requisition_result = await workflow.execute_activity(
            run_requisition_agent,
            args=[req_message, input.user_id, input.university_id, _ctx("create_requisition")],
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=AGENT_RETRY,
        )

        # Assign a requisition ID (would come from the agent in production)
        self.requisition_id = f"REQ-{str(uuid.uuid4())[:8].upper()}"

        # ======================================
        # Step 3: Vendor Selection Agent
        # ======================================
        self.current_step = "selecting_vendors"

        category = input.items[0].get("category", "general") if input.items else "general"
        vendor_message = (
            f"Recommend vendors for requisition {self.requisition_id}. "
            f"Category: {category}. Total value: ${total:,.2f}. "
            f"Evaluate by price (30%), quality (20%), delivery (20%), "
            f"service (15%), compliance (10%), strategic (5%). "
            f"Include diverse supplier options."
        )

        vendor_result = await workflow.execute_activity(
            run_vendor_selection_agent,
            args=[vendor_message, input.user_id, input.university_id, _ctx("vendor_selection")],
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=AGENT_RETRY,
        )

        # ======================================
        # Step 4: Price Compare Agent
        # ======================================
        self.current_step = "comparing_prices"

        price_message = (
            f"Compare prices for requisition {self.requisition_id}. "
            f"Items: {items_desc}\n"
            f"Include total cost of ownership: shipping, volume discounts, payment terms."
        )

        price_result = await workflow.execute_activity(
            run_price_compare_agent,
            args=[price_message, input.user_id, input.university_id, _ctx("price_comparison")],
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=AGENT_RETRY,
        )

        # ======================================
        # Step 5: Wait for Human Approval
        # ======================================
        self.current_step = "awaiting_human_approval"

        # Determine SLA based on urgency
        sla_map = {"emergency": 2, "rush": 8, "standard": 48}
        sla_hours = sla_map.get(input.urgency, 48)

        # Auto-approve small orders (under $500)
        if total <= 500:
            self.approval_decision = "approve"
            self.approver_id = "system_auto_approve"
            self.approval_comments = f"Auto-approved: amount ${total:,.2f} under $500 threshold"
        else:
            # Wait for the human_approval signal with a timeout
            try:
                await workflow.wait_condition(
                    lambda: self.approval_decision is not None,
                    timeout=timedelta(hours=sla_hours),
                )
            except asyncio.TimeoutError:
                return {
                    "status": "timed_out",
                    "requisition_id": self.requisition_id,
                    "reason": f"No approval received within {sla_hours}h SLA",
                    "steps_completed": {
                        "requisition": requisition_result.get("response", ""),
                        "vendor_selection": vendor_result.get("response", ""),
                        "price_comparison": price_result.get("response", ""),
                    },
                }

        # Check decision
        if self.approval_decision == "reject":
            return {
                "status": "rejected",
                "requisition_id": self.requisition_id,
                "reason": self.approval_comments or "Rejected by approver",
                "approver_id": self.approver_id,
            }

        # ======================================
        # Step 6: Process Approval
        # ======================================
        self.current_step = "processing_approval"

        approval_message = (
            f"Process approval for requisition {self.requisition_id}: "
            f"approved by {self.approver_id}. "
            f"Comments: {self.approval_comments or 'None'}"
        )

        approval_result = await workflow.execute_activity(
            run_approval_workflow_agent,
            args=[approval_message, input.user_id, input.university_id, _ctx("process_approval")],
            start_to_close_timeout=timedelta(minutes=2),
            retry_policy=AGENT_RETRY,
        )

        # ======================================
        # Step 7: Generate PO
        # ======================================
        self.current_step = "generating_po"

        po_number = await workflow.execute_activity(
            generate_purchase_order,
            args=[self.requisition_id],
            start_to_close_timeout=timedelta(minutes=2),
            retry_policy=AGENT_RETRY,
        )

        # ======================================
        # Step 8: Send PO to Vendor
        # ======================================
        self.current_step = "sending_po"

        vendor_id = "vendor_from_selection"  # Would be extracted from vendor_result
        sent = await workflow.execute_activity(
            send_po_to_vendor,
            args=[po_number, vendor_id],
            start_to_close_timeout=timedelta(minutes=1),
            retry_policy=RetryPolicy(maximum_attempts=5),
        )

        self.current_step = "complete"

        return {
            "status": "complete",
            "requisition_id": self.requisition_id,
            "po_number": po_number,
            "sent_to_vendor": sent,
            "approved_by": self.approver_id,
            "total": total,
            "steps": {
                "requisition": requisition_result.get("response", ""),
                "vendor_selection": vendor_result.get("response", ""),
                "price_comparison": price_result.get("response", ""),
                "approval": approval_result.get("response", ""),
            },
        }
