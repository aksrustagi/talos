"""
Talos AI — Optimization Scan Workflow

Proactive optimization discovery — the money machine.
Orchestrates Agent 22 on daily/weekly/monthly schedules.
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

EXTERNAL_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=5),
    maximum_interval=timedelta(minutes=5),
    maximum_attempts=5,
)


@workflow.defn
class OptimizationScanWorkflow:
    """
    Proactive optimization discovery.
    Scans all procurement data for unseen savings opportunities.
    Different scan types run at different frequencies:
    - Daily: price variance, maverick spend
    - Weekly: contract expiry, payment optimization
    - Monthly: full category analysis, substitute identification
    """

    @workflow.run
    async def run(self, scan_config: dict) -> dict:
        scan_type = scan_config.get("scan_type", "daily")
        discoveries = []

        if scan_type in ("daily", "weekly", "monthly"):
            # Price variance detection (Agent 22)
            price_variances = await workflow.execute_activity(
                "scan_price_variances",
                scan_config,
                start_to_close_timeout=timedelta(minutes=30),
                retry_policy=LLM_RETRY,
            )
            discoveries.extend(price_variances.get("discoveries", []))

            # Maverick spend detection
            maverick = await workflow.execute_activity(
                "scan_maverick_spend",
                scan_config,
                start_to_close_timeout=timedelta(minutes=30),
                retry_policy=LLM_RETRY,
            )
            discoveries.extend(maverick.get("discoveries", []))

        if scan_type in ("weekly", "monthly"):
            # Contract expiry optimization
            contract_opps = await workflow.execute_activity(
                "scan_contract_expiries",
                scan_config,
                start_to_close_timeout=timedelta(minutes=30),
                retry_policy=LLM_RETRY,
            )
            discoveries.extend(contract_opps.get("discoveries", []))

            # Payment term optimization
            payment_opps = await workflow.execute_activity(
                "scan_payment_optimization",
                scan_config,
                start_to_close_timeout=timedelta(minutes=15),
                retry_policy=LLM_RETRY,
            )
            discoveries.extend(payment_opps.get("discoveries", []))

        if scan_type == "monthly":
            # Full category optimization (Agent 22 — genius LLM)
            category_opps = await workflow.execute_activity(
                "scan_category_optimization",
                scan_config,
                start_to_close_timeout=timedelta(hours=1),
                retry_policy=LLM_RETRY,
            )
            discoveries.extend(category_opps.get("discoveries", []))

            # Substitute identification
            substitutes = await workflow.execute_activity(
                "scan_substitute_products",
                scan_config,
                start_to_close_timeout=timedelta(minutes=30),
                retry_policy=LLM_RETRY,
            )
            discoveries.extend(substitutes.get("discoveries", []))

            # Vendor consolidation opportunities
            consolidation = await workflow.execute_activity(
                "scan_vendor_consolidation",
                scan_config,
                start_to_close_timeout=timedelta(minutes=30),
                retry_policy=LLM_RETRY,
            )
            discoveries.extend(consolidation.get("discoveries", []))

        # Prioritize discoveries by estimated savings * confidence
        discoveries.sort(
            key=lambda d: d.get("estimated_annual_savings", 0) * d.get("confidence", 0),
            reverse=True,
        )

        # Send high-priority alerts
        high_priority = [d for d in discoveries if d.get("priority") == "high"]
        if high_priority:
            await workflow.execute_activity(
                "send_optimization_alerts",
                {"discoveries": high_priority},
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=EXTERNAL_RETRY,
            )

        total_estimated_savings = sum(
            d.get("estimated_annual_savings", 0) for d in discoveries
        )

        return {
            "status": "completed",
            "scan_type": scan_type,
            "discoveries_count": len(discoveries),
            "high_priority_count": len(high_priority),
            "total_estimated_annual_savings": total_estimated_savings,
            "discoveries": discoveries,
        }
