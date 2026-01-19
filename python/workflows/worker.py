"""
Temporal Worker for Procurement Workflows

Registers and runs all procurement workflows and activities.
"""

import asyncio
import os
import signal
import sys
from datetime import timedelta

from temporalio.client import Client
from temporalio.worker import Worker

from workflows.procurement_workflows import (
    # Workflows
    RequisitionApprovalWorkflow,
    InvoiceValidationWorkflow,
    CatalogSyncWorkflow,
    ContractRenewalWorkflow,
    # Activities
    validate_budget,
    determine_approvers,
    send_approval_notification,
    check_approval_status,
    generate_purchase_order,
    send_po_to_vendor,
    escalate_approval,
    parse_invoice,
    find_matching_po,
    match_invoice_lines,
    validate_contract_prices,
    verify_receipts,
    approve_invoice,
    create_exception,
    analyze_contract_performance,
    generate_renewal_recommendation,
    fetch_vendor_catalog,
    normalize_catalog,
    detect_price_changes,
    notify_price_changes,
)

import structlog

# Configure logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ]
)
logger = structlog.get_logger()

# Configuration
TEMPORAL_ADDRESS = os.getenv("TEMPORAL_ADDRESS", "localhost:7233")
TEMPORAL_NAMESPACE = os.getenv("TEMPORAL_NAMESPACE", "default")
TASK_QUEUE = os.getenv("TEMPORAL_TASK_QUEUE", "procurement-tasks")


async def create_worker() -> Worker:
    """Create and configure the Temporal worker."""
    logger.info(
        "Connecting to Temporal",
        address=TEMPORAL_ADDRESS,
        namespace=TEMPORAL_NAMESPACE,
    )

    # Connect to Temporal
    client = await Client.connect(
        TEMPORAL_ADDRESS,
        namespace=TEMPORAL_NAMESPACE,
    )

    # Create worker
    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=[
            RequisitionApprovalWorkflow,
            InvoiceValidationWorkflow,
            CatalogSyncWorkflow,
            ContractRenewalWorkflow,
        ],
        activities=[
            # Budget and approval activities
            validate_budget,
            determine_approvers,
            send_approval_notification,
            check_approval_status,
            escalate_approval,
            # PO activities
            generate_purchase_order,
            send_po_to_vendor,
            # Invoice activities
            parse_invoice,
            find_matching_po,
            match_invoice_lines,
            validate_contract_prices,
            verify_receipts,
            approve_invoice,
            create_exception,
            # Contract activities
            analyze_contract_performance,
            generate_renewal_recommendation,
            # Catalog activities
            fetch_vendor_catalog,
            normalize_catalog,
            detect_price_changes,
            notify_price_changes,
        ],
    )

    return worker


async def main():
    """Main entry point for the worker."""
    logger.info("Starting Talos Procurement Temporal Worker")

    # Create worker
    worker = await create_worker()

    # Handle shutdown signals
    shutdown_event = asyncio.Event()

    def signal_handler():
        logger.info("Shutdown signal received")
        shutdown_event.set()

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, signal_handler)

    # Run worker until shutdown
    logger.info("Worker started", task_queue=TASK_QUEUE)

    try:
        async with worker:
            await shutdown_event.wait()
    except Exception as e:
        logger.error("Worker error", error=str(e))
        sys.exit(1)

    logger.info("Worker stopped")


if __name__ == "__main__":
    asyncio.run(main())
