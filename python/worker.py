"""
Temporal Worker

Entry point that assembles all activities and workflows, then runs
the Temporal worker loop. All activity definitions now live in the
activities/ package — this file is purely a runner.
"""

import asyncio
import os

from temporalio.client import Client
from temporalio.worker import Worker

from activities.agent_activities import ALL_AGENT_ACTIVITIES
from activities.procurement_activities import ALL_PROCUREMENT_ACTIVITIES


TASK_QUEUE = os.environ.get("TEMPORAL_TASK_QUEUE", "talos-procurement")
TEMPORAL_HOST = os.environ.get("TEMPORAL_HOST", "localhost:7233")

ALL_ACTIVITIES = ALL_AGENT_ACTIVITIES + ALL_PROCUREMENT_ACTIVITIES


async def run_worker():
    """Connect to Temporal and run the worker."""
    from workflows.requisition import RequisitionToOrderWorkflow
    from workflows.procurement_workflows import (
        RequisitionApprovalWorkflow,
        InvoiceValidationWorkflow,
        CatalogSyncWorkflow,
        ContractRenewalWorkflow,
    )

    all_workflows = [
        RequisitionToOrderWorkflow,
        RequisitionApprovalWorkflow,
        InvoiceValidationWorkflow,
        CatalogSyncWorkflow,
        ContractRenewalWorkflow,
    ]

    client = await Client.connect(TEMPORAL_HOST)

    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=all_workflows,
        activities=ALL_ACTIVITIES,
    )

    print(f"Temporal worker started on task queue: {TASK_QUEUE}")
    print(f"  Workflows: {[w.__name__ for w in all_workflows]}")
    print(f"  Activities: {[a.__name__ for a in ALL_ACTIVITIES]}")

    await worker.run()


if __name__ == "__main__":
    asyncio.run(run_worker())
