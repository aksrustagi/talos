"""
Talos AI — Invoice-to-Payment Workflow

Handles invoice receipt through 3-way matching to payment optimization.
Orchestrates Agents 12 → 14 → 13.
"""

from datetime import timedelta
from typing import Optional

from temporalio import workflow
from temporalio.common import RetryPolicy

LLM_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=2),
    maximum_interval=timedelta(seconds=30),
    maximum_attempts=3,
    non_retryable_error_types=["ValidationError"],
)

EXTERNAL_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=5),
    maximum_interval=timedelta(minutes=5),
    maximum_attempts=5,
)


@workflow.defn
class InvoiceToPaymentWorkflow:
    """
    Invoice processing workflow: receipt → 3-way match → payment optimization.
    Runs 24/7 processing incoming invoices autonomously.
    """

    def __init__(self):
        self.exception_resolution: Optional[dict] = None

    @workflow.signal
    async def resolve_exception(self, resolution: dict):
        """Human resolves a matching exception."""
        self.exception_resolution = resolution

    @workflow.run
    async def run(self, invoice_data: dict) -> dict:

        # Step 1: Goods receipt verification (Agent 14)
        receipt = await workflow.execute_activity(
            "verify_goods_receipt",
            invoice_data,
            start_to_close_timeout=timedelta(minutes=2),
            retry_policy=EXTERNAL_RETRY,
        )

        # Step 2: 3-way match (Agent 12 — smart LLM)
        match_result = await workflow.execute_activity(
            "three_way_match",
            {"invoice": invoice_data, "receipt": receipt},
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=LLM_RETRY,
        )

        # Step 3: Handle exceptions if any
        if not match_result.get("auto_approved"):
            # Notify AP team of exception
            await workflow.execute_activity(
                "notify_invoice_exception",
                {"invoice": invoice_data, "match_result": match_result},
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=EXTERNAL_RETRY,
            )

            # Wait for human resolution (up to 5 business days)
            try:
                await workflow.wait_condition(
                    lambda: self.exception_resolution is not None,
                    timeout=timedelta(days=5),
                )
            except TimeoutError:
                await workflow.execute_activity(
                    "escalate_invoice_exception",
                    {"invoice": invoice_data, "match_result": match_result},
                    start_to_close_timeout=timedelta(seconds=30),
                )
                await workflow.wait_condition(
                    lambda: self.exception_resolution is not None,
                    timeout=timedelta(days=10),
                )

            if self.exception_resolution and self.exception_resolution.get("action") == "reject":
                return {
                    "status": "rejected",
                    "invoice_id": invoice_data.get("invoice_id"),
                    "reason": self.exception_resolution.get("reason"),
                }

        # Step 4: Payment optimization (Agent 13)
        payment_recommendation = await workflow.execute_activity(
            "optimize_payment",
            {"invoice": invoice_data, "match_result": match_result},
            start_to_close_timeout=timedelta(minutes=2),
            retry_policy=LLM_RETRY,
        )

        # Step 5: Schedule payment
        await workflow.execute_activity(
            "schedule_payment",
            {
                "invoice": invoice_data,
                "payment_date": payment_recommendation.get("recommended_payment_date"),
                "capture_discount": payment_recommendation.get("capture_discount", False),
            },
            start_to_close_timeout=timedelta(minutes=2),
            retry_policy=EXTERNAL_RETRY,
        )

        return {
            "status": "approved_for_payment",
            "invoice_id": invoice_data.get("invoice_id"),
            "po_number": match_result.get("po_number"),
            "match_status": match_result.get("match_status"),
            "payment_date": payment_recommendation.get("recommended_payment_date"),
            "discount_captured": payment_recommendation.get("capture_discount", False),
        }
