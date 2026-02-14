"""
Talos AI — Savings Verification Workflow

Monthly recurring workflow that verifies all savings and generates billing.
Agent 17 — the revenue engine.
"""

from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

LLM_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=2),
    maximum_interval=timedelta(seconds=30),
    maximum_attempts=3,
    non_retryable_error_types=["ValidationError"],
)


@workflow.defn
class SavingsVerificationWorkflow:
    """
    Monthly recurring workflow that verifies all savings and generates billing.
    This is the revenue engine for Talos — 33% of verified savings.
    """

    @workflow.run
    async def run(self, period: dict) -> dict:

        # Gather all savings events for the period
        raw_savings = await workflow.execute_activity(
            "collect_savings_events",
            period,
            start_to_close_timeout=timedelta(minutes=30),
        )

        # Verify each savings claim (Agent 17 — genius LLM)
        verified_savings = []
        for claim in raw_savings:
            verified = await workflow.execute_activity(
                "verify_savings_claim",
                claim,
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=LLM_RETRY,
            )
            if verified["confidence"] >= 0.6:
                verified_savings.append(verified)

        # Generate monthly report
        report = await workflow.execute_activity(
            "generate_savings_report",
            {"period": period, "verified_savings": verified_savings},
            start_to_close_timeout=timedelta(minutes=10),
        )

        # Calculate Talos billing
        total_savings = sum(s["total_savings"] for s in verified_savings)
        talos_share = total_savings * 0.33

        # Send to client for review
        await workflow.execute_activity(
            "send_savings_report_to_client",
            {"report": report, "talos_invoice_amount": talos_share},
            start_to_close_timeout=timedelta(minutes=5),
        )

        return {
            "period": period,
            "total_verified_savings": total_savings,
            "talos_share": talos_share,
            "claims_verified": len(verified_savings),
            "claims_rejected": len(raw_savings) - len(verified_savings),
        }
