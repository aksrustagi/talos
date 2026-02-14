"""
Talos AI — Sourcing Workflow

End-to-end sourcing: Market intel → RFP → Vendor responses → Negotiation → Award.
Orchestrates Agents 4 → 5 → 23 → 6 → 7.
Can span weeks.
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
class SourcingWorkflow:
    """
    End-to-end sourcing workflow.
    Can span weeks waiting for vendor responses.
    """

    def __init__(self):
        self.vendor_responses: list = []
        self.negotiation_result: Optional[dict] = None

    @workflow.signal
    async def receive_vendor_response(self, response: dict):
        """Vendor submits RFP response via signal."""
        self.vendor_responses.append(response)

    @workflow.run
    async def run(self, sourcing_request: dict) -> dict:

        # Step 1: Market intelligence (Agent 4)
        market_intel = await workflow.execute_activity(
            "gather_market_intelligence",
            sourcing_request,
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=LLM_RETRY,
        )

        # Step 2: Price check across catalogs (Agent 23)
        pricing = await workflow.execute_activity(
            "fetch_catalog_pricing",
            sourcing_request,
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=EXTERNAL_RETRY,
        )

        # Step 3: Generate and distribute RFP (Agent 5)
        rfp = await workflow.execute_activity(
            "generate_rfp",
            {"request": sourcing_request, "market_intel": market_intel, "pricing": pricing},
            start_to_close_timeout=timedelta(minutes=10),
            retry_policy=LLM_RETRY,
        )

        await workflow.execute_activity(
            "distribute_rfp_to_vendors",
            rfp,
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=EXTERNAL_RETRY,
        )

        # Step 4: Wait for vendor responses (typically 7-14 days)
        response_deadline_days = rfp.get("response_deadline_days", 14)
        await workflow.sleep(timedelta(days=response_deadline_days))

        # Step 5: Score and rank responses (Agent 5)
        evaluation = await workflow.execute_activity(
            "evaluate_vendor_responses",
            {"rfp": rfp, "responses": self.vendor_responses, "market_intel": market_intel},
            start_to_close_timeout=timedelta(minutes=10),
            retry_policy=LLM_RETRY,
        )

        # Step 6: Negotiate with top vendor(s) (Agent 6 — genius LLM)
        negotiation = await workflow.execute_activity(
            "run_negotiation",
            {
                "top_vendor": evaluation["recommended_vendor"],
                "target_price": evaluation["target_price"],
                "market_intel": market_intel,
            },
            start_to_close_timeout=timedelta(hours=1),
            retry_policy=LLM_RETRY,
        )

        # Step 7: Onboard vendor if new (Agent 7)
        if negotiation.get("vendor_is_new"):
            await workflow.execute_activity(
                "onboard_vendor",
                negotiation,
                start_to_close_timeout=timedelta(days=14),
                retry_policy=EXTERNAL_RETRY,
            )

        return {
            "status": "awarded",
            "vendor": negotiation["vendor_name"],
            "final_price": negotiation["final_price"],
            "savings": negotiation["savings_vs_initial"],
            "contract_terms": negotiation["accepted_terms"],
        }
