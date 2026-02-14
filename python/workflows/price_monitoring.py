"""
Talos AI — Price Monitoring Workflow

Continuous price monitoring across catalogs, APIs, and vendor portals.
Orchestrates Agent 23 on a scheduled basis.
"""

from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

LLM_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=2),
    maximum_interval=timedelta(seconds=30),
    maximum_attempts=3,
)

EXTERNAL_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=5),
    maximum_interval=timedelta(minutes=5),
    maximum_attempts=5,
)


@workflow.defn
class PriceMonitoringWorkflow:
    """
    Continuous price monitoring workflow.
    Runs on a schedule (daily/weekly) to track price changes across all sources.
    """

    @workflow.run
    async def run(self, config: dict) -> dict:

        categories = config.get("categories", [])
        results = []

        for category in categories:
            # Step 1: Fetch current catalog prices (Agent 23)
            pricing = await workflow.execute_activity(
                "fetch_catalog_pricing",
                {"category": category, "sources": config.get("sources", [])},
                start_to_close_timeout=timedelta(minutes=10),
                retry_policy=EXTERNAL_RETRY,
            )

            # Step 2: Compare against current contracts
            comparison = await workflow.execute_activity(
                "compare_contract_vs_market",
                {"category": category, "market_pricing": pricing},
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=LLM_RETRY,
            )

            results.append({
                "category": category,
                "pricing": pricing,
                "comparison": comparison,
            })

            # Step 3: Alert on significant changes
            if comparison.get("significant_change"):
                await workflow.execute_activity(
                    "send_price_alert",
                    {
                        "category": category,
                        "change_type": comparison.get("change_type"),
                        "details": comparison,
                    },
                    start_to_close_timeout=timedelta(seconds=30),
                    retry_policy=EXTERNAL_RETRY,
                )

        # Step 4: Update internal price database
        await workflow.execute_activity(
            "update_price_database",
            {"results": results},
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=EXTERNAL_RETRY,
        )

        return {
            "status": "completed",
            "categories_scanned": len(categories),
            "alerts_triggered": sum(
                1 for r in results if r["comparison"].get("significant_change")
            ),
            "results": results,
        }
