"""
Talos AI — Contract Lifecycle Workflow

Manages a single contract from creation through termination.
Can run for YEARS. Temporal handles this natively.
"""

from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

EXTERNAL_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=5),
    maximum_interval=timedelta(minutes=5),
    maximum_attempts=5,
)


@workflow.defn
class ContractLifecycleWorkflow:
    """
    Manages a single contract from creation through termination.
    Can run for years — Temporal handles this natively via continue-as-new.
    """

    @workflow.run
    async def run(self, contract: dict) -> dict:

        while True:
            expiry = contract["expiry_date"]
            days_to_expiry = (expiry - workflow.now()).days

            if days_to_expiry > 180:
                await workflow.sleep(timedelta(days=days_to_expiry - 180))
                # 180-day alert: begin market analysis
                await workflow.execute_activity(
                    "begin_renewal_analysis",
                    contract,
                    start_to_close_timeout=timedelta(hours=1),
                    retry_policy=EXTERNAL_RETRY,
                )

            elif days_to_expiry > 90:
                await workflow.sleep(timedelta(days=days_to_expiry - 90))
                # 90-day alert: renewal recommendation
                await workflow.execute_activity(
                    "send_renewal_recommendation",
                    contract,
                    start_to_close_timeout=timedelta(minutes=30),
                    retry_policy=EXTERNAL_RETRY,
                )

            elif days_to_expiry > 30:
                await workflow.sleep(timedelta(days=days_to_expiry - 30))
                # 30-day alert: final decision
                await workflow.execute_activity(
                    "send_final_renewal_alert",
                    contract,
                    start_to_close_timeout=timedelta(minutes=10),
                    retry_policy=EXTERNAL_RETRY,
                )

            else:
                # Contract expired or near expiry
                await workflow.execute_activity(
                    "handle_contract_expiry",
                    contract,
                    start_to_close_timeout=timedelta(minutes=30),
                    retry_policy=EXTERNAL_RETRY,
                )
                break

        return {"status": "expired", "contract_id": contract["contract_id"]}
