"""
Talos Temporal Worker — Runs activities that execute the pipeline.

Usage:
    python -m talos worker

The worker connects to the Temporal server and processes pipeline
activities (LLM calls, compliance checks, etc.). Run one or more
workers alongside the API server.
"""
from __future__ import annotations

import asyncio
import logging

from temporalio.client import Client
from temporalio.worker import Worker

from ..config import get_config
from ..agents.core import TalosAgents
from .activities import (
    set_shared_agents,
    parse_requisition,
    check_compliance,
    check_aggregation,
    track_prices,
    generate_purchase_order,
    drain_llm_history,
)
from .requisition_workflow import RequisitionWorkflow

log = logging.getLogger("talos.workflows.worker")

ALL_ACTIVITIES = [
    parse_requisition,
    check_compliance,
    check_aggregation,
    track_prices,
    generate_purchase_order,
    drain_llm_history,
]


async def run_worker():
    """Start the Temporal worker. Blocks until interrupted."""
    config = get_config()

    if not config.enable_temporal:
        log.error(
            "Temporal is not enabled. Set TALOS_ENABLE_TEMPORAL=true to enable. "
            "Also ensure a Temporal server is running."
        )
        return

    # Initialize shared agents for activities
    agents = TalosAgents(config.client_type.value)
    set_shared_agents(agents)

    log.info(
        f"Connecting to Temporal at {config.temporal_address} "
        f"(namespace={config.temporal_namespace}, queue={config.temporal_task_queue})"
    )

    client = await Client.connect(
        config.temporal_address,
        namespace=config.temporal_namespace,
    )

    worker = Worker(
        client,
        task_queue=config.temporal_task_queue,
        workflows=[RequisitionWorkflow],
        activities=ALL_ACTIVITIES,
    )

    log.info(f"Worker started on task queue: {config.temporal_task_queue}")
    print(f"\n  Talos Temporal Worker running")
    print(f"  Server:     {config.temporal_address}")
    print(f"  Namespace:  {config.temporal_namespace}")
    print(f"  Task Queue: {config.temporal_task_queue}")
    print(f"  Client:     {config.client_type.value}")
    print(f"  Press Ctrl+C to stop.\n")

    try:
        await worker.run()
    finally:
        await agents.close()


def main():
    """Entry point for `python -m talos worker`."""
    asyncio.run(run_worker())
