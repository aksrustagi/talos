"""
Talos AI — Main Temporal Worker

Primary worker that registers all workflows and activities.
Run with: python -m workers.main_worker
"""

import asyncio
import logging
import os

from temporalio.client import Client
from temporalio.worker import Worker

# Workflows
from workflows.req_to_order import RequisitionToOrderWorkflow
from workflows.sourcing import SourcingWorkflow
from workflows.savings_verification import SavingsVerificationWorkflow
from workflows.contract_lifecycle import ContractLifecycleWorkflow
from workflows.invoice_to_payment import InvoiceToPaymentWorkflow
from workflows.price_monitoring import PriceMonitoringWorkflow
from workflows.optimization_scan import OptimizationScanWorkflow

# LLM Activities
from activities.llm_activities import (
    parse_requisition,
    check_compliance,
    check_aggregation,
    gather_market_intelligence,
    generate_rfp,
    evaluate_vendor_responses,
    run_negotiation,
    onboard_vendor,
    send_approval_request,
    escalate_approval_activity,
    generate_purchase_order_activity,
    dispatch_po_to_vendor,
    chase_vendor_confirmation,
    three_way_match,
    optimize_payment,
    verify_goods_receipt,
    check_budget,
    analyze_spend,
    verify_savings_claim,
    collect_savings_events,
    generate_savings_report,
    send_savings_report_to_client,
    monitor_risk,
    scan_price_variances,
    scan_maverick_spend,
    scan_contract_expiries,
    scan_payment_optimization,
    scan_category_optimization,
    scan_substitute_products,
    scan_vendor_consolidation,
    fetch_catalog_pricing,
    compare_contract_vs_market,
    # Notification activities
    notify_human_review_needed,
    notify_compliance_issues,
    notify_invoice_exception,
    escalate_invoice_exception,
    schedule_payment,
    distribute_rfp_to_vendors,
    send_price_alert,
    update_price_database,
    send_optimization_alerts,
    # Contract lifecycle
    begin_renewal_analysis,
    send_renewal_recommendation,
    send_final_renewal_alert,
    handle_contract_expiry,
)

# Connector Activities
from activities.connector_activities import (
    create_requisition_in_erp,
    create_po_in_erp,
    get_invoices_from_erp,
    get_vendors_from_erp,
    get_contracts_from_erp,
    search_catalog,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TASK_QUEUE = "talos-procurement"


async def main():
    """Start the main Temporal worker."""
    temporal_address = os.getenv("TEMPORAL_ADDRESS", "localhost:7233")
    temporal_namespace = os.getenv("TEMPORAL_NAMESPACE", "default")

    logger.info(f"Connecting to Temporal at {temporal_address}")
    client = await Client.connect(
        temporal_address,
        namespace=temporal_namespace,
    )

    logger.info(f"Starting worker on task queue: {TASK_QUEUE}")
    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=[
            RequisitionToOrderWorkflow,
            SourcingWorkflow,
            SavingsVerificationWorkflow,
            ContractLifecycleWorkflow,
            InvoiceToPaymentWorkflow,
            PriceMonitoringWorkflow,
            OptimizationScanWorkflow,
        ],
        activities=[
            # Agent LLM activities
            parse_requisition,
            check_compliance,
            check_aggregation,
            gather_market_intelligence,
            generate_rfp,
            evaluate_vendor_responses,
            run_negotiation,
            onboard_vendor,
            send_approval_request,
            escalate_approval_activity,
            generate_purchase_order_activity,
            dispatch_po_to_vendor,
            chase_vendor_confirmation,
            three_way_match,
            optimize_payment,
            verify_goods_receipt,
            check_budget,
            analyze_spend,
            verify_savings_claim,
            collect_savings_events,
            generate_savings_report,
            send_savings_report_to_client,
            monitor_risk,
            scan_price_variances,
            scan_maverick_spend,
            scan_contract_expiries,
            scan_payment_optimization,
            scan_category_optimization,
            scan_substitute_products,
            scan_vendor_consolidation,
            fetch_catalog_pricing,
            compare_contract_vs_market,
            # Notification activities
            notify_human_review_needed,
            notify_compliance_issues,
            notify_invoice_exception,
            escalate_invoice_exception,
            schedule_payment,
            distribute_rfp_to_vendors,
            send_price_alert,
            update_price_database,
            send_optimization_alerts,
            # Contract lifecycle
            begin_renewal_analysis,
            send_renewal_recommendation,
            send_final_renewal_alert,
            handle_contract_expiry,
            # Connector activities
            create_requisition_in_erp,
            create_po_in_erp,
            get_invoices_from_erp,
            get_vendors_from_erp,
            get_contracts_from_erp,
            search_catalog,
        ],
    )

    logger.info("Worker started. Processing workflows and activities...")
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
