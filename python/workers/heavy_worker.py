"""
Talos AI — Heavy Worker

Dedicated worker for genius-tier LLM activities (Agents 6, 17, 22).
These use the most expensive models and may have longer timeouts.

Run with: python -m workers.heavy_worker
"""

import asyncio
import logging
import os

from temporalio.client import Client
from temporalio.worker import Worker

# Only genius-tier activities
from activities.llm_activities import (
    run_negotiation,
    verify_savings_claim,
    generate_savings_report,
    scan_category_optimization,
    scan_substitute_products,
    scan_vendor_consolidation,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TASK_QUEUE = "talos-heavy"


async def main():
    """Start the heavy worker for genius-tier agents."""
    temporal_address = os.getenv("TEMPORAL_ADDRESS", "localhost:7233")
    temporal_namespace = os.getenv("TEMPORAL_NAMESPACE", "default")

    logger.info(f"Connecting to Temporal at {temporal_address}")
    client = await Client.connect(
        temporal_address,
        namespace=temporal_namespace,
    )

    logger.info(f"Starting heavy worker on task queue: {TASK_QUEUE}")
    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=[],  # Workflows run on main worker
        activities=[
            run_negotiation,
            verify_savings_claim,
            generate_savings_report,
            scan_category_optimization,
            scan_substitute_products,
            scan_vendor_consolidation,
        ],
    )

    logger.info("Heavy worker started. Processing genius-tier activities...")
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
