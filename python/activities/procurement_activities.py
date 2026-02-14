"""
Temporal Activity Definitions — Procurement

Real implementations backed by ProcurementStore (SQLite).
This module is the single source of truth for all non-agent activities.
It does NOT import from worker.py or workflows/ — breaking the old
circular dependency.
"""

import json
import uuid
from datetime import datetime, timezone

from temporalio import activity
import structlog

from procurement.store import get_store

logger = structlog.get_logger(__name__)


# ============================================
# Budget & Validation
# ============================================

@activity.defn
async def validate_budget(budget_code: str, amount: float) -> dict:
    """Check if budget is available for the requested amount."""
    store = get_store()
    result = await store.validate_budget(budget_code, amount)
    logger.info(
        "budget_validated",
        budget_code=budget_code,
        amount=amount,
        available=result["available"],
    )
    return result


@activity.defn
async def determine_approvers(requisition: dict) -> list[dict]:
    """Determine required approvers based on amount thresholds."""
    store = get_store()
    total = requisition.get("total", 0)
    approvers = await store.determine_approvers(total)
    logger.info(
        "approvers_determined",
        total=total,
        approver_count=len(approvers),
    )
    return approvers


# ============================================
# Approval Lifecycle
# ============================================

@activity.defn
async def send_approval_notification(request: dict) -> bool:
    """Send approval request notification.

    In production this would integrate with Slack/email/Teams.
    Currently logs the notification and records it in the store.
    """
    store = get_store()
    record_id = await store.create_approval_record(request)
    logger.info(
        "approval_notification_sent",
        requisition_id=request.get("requisition_id"),
        approver_id=request.get("approver_id"),
        record_id=record_id,
    )
    return True


@activity.defn
async def check_approval_status(requisition_id: str) -> dict:
    """Check whether all approvals are complete."""
    store = get_store()
    status = await store.check_approval_status(requisition_id)
    logger.info(
        "approval_status_checked",
        requisition_id=requisition_id,
        approved=status["approved"],
        rejected=status["rejected"],
        pending=status["pending"],
    )
    return status


@activity.defn
async def escalate_approval(request: dict) -> bool:
    """Escalate an overdue approval.

    In production would page the approver's manager.
    """
    logger.warning(
        "approval_escalated",
        requisition_id=request.get("requisition_id"),
        approver_id=request.get("approver_id"),
        level=request.get("level"),
    )
    return True


# ============================================
# Purchase Orders
# ============================================

@activity.defn
async def generate_purchase_order(requisition_id: str) -> str:
    """Generate a purchase order from an approved requisition.

    Creates a PO record in the data store and commits the budget.
    """
    store = get_store()
    po_number = await store.generate_purchase_order(requisition_id)
    logger.info(
        "purchase_order_generated",
        requisition_id=requisition_id,
        po_number=po_number,
    )
    return po_number


@activity.defn
async def send_po_to_vendor(po_number: str, vendor_id: str) -> bool:
    """Transmit PO to vendor (cXML/EDI in production).

    Marks the PO as sent in the data store.
    """
    store = get_store()
    vendor = await store.get_vendor(vendor_id)
    vendor_name = vendor["name"] if vendor else vendor_id

    success = await store.mark_po_sent(po_number)
    logger.info(
        "po_sent_to_vendor",
        po_number=po_number,
        vendor_id=vendor_id,
        vendor_name=vendor_name,
        success=success,
    )
    return success


# ============================================
# Invoice Processing (Three-Way Match)
# ============================================

@activity.defn
async def parse_invoice(invoice_id: str) -> dict:
    """Parse an incoming invoice."""
    store = get_store()
    result = await store.parse_invoice(invoice_id)
    logger.info("invoice_parsed", invoice_id=invoice_id)
    return result


@activity.defn
async def find_matching_po(invoice: dict) -> dict:
    """Find the PO that matches this invoice."""
    store = get_store()
    result = await store.find_matching_po(invoice)
    logger.info(
        "po_match_result",
        invoice_id=invoice.get("invoice_id"),
        found=result["found"],
    )
    return result


@activity.defn
async def match_invoice_lines(invoice: dict, po_number: str) -> dict:
    """Line-level matching between invoice and PO."""
    store = get_store()
    result = await store.match_invoice_lines(invoice, po_number)
    logger.info(
        "invoice_lines_matched",
        po_number=po_number,
        all_matched=result["all_matched"],
    )
    return result


@activity.defn
async def validate_contract_prices(invoice: dict, line_matches: dict) -> dict:
    """Validate invoiced prices against contract prices."""
    store = get_store()
    return await store.validate_contract_prices(invoice, line_matches)


@activity.defn
async def verify_receipts(invoice: dict, po_number: str) -> dict:
    """Check goods/services receipt status."""
    store = get_store()
    return await store.verify_receipts(invoice, po_number)


@activity.defn
async def approve_invoice(invoice_id: str) -> bool:
    """Auto-approve a matched invoice."""
    store = get_store()
    return await store.approve_invoice(invoice_id)


@activity.defn
async def create_exception(
    invoice_id: str,
    line_matches: dict,
    price_validation: dict,
    receipt_check: dict,
) -> str:
    """Route an unmatched invoice to exception handling."""
    store = get_store()
    exc_id = await store.create_exception(
        invoice_id, line_matches, price_validation, receipt_check,
    )
    logger.warning(
        "invoice_exception_created",
        invoice_id=invoice_id,
        exception_id=exc_id,
    )
    return exc_id


# ============================================
# Catalog Sync
# ============================================

@activity.defn
async def fetch_vendor_catalog(vendor_id: str) -> dict:
    """Fetch a vendor's product catalog."""
    store = get_store()
    return await store.fetch_vendor_catalog(vendor_id)


@activity.defn
async def normalize_catalog(catalog_data: dict) -> dict:
    """Normalize catalog data for consistent formatting."""
    store = get_store()
    return await store.normalize_catalog(catalog_data)


@activity.defn
async def detect_price_changes(vendor_id: str, catalog: dict) -> dict:
    """Detect significant price changes since last sync."""
    store = get_store()
    return await store.detect_price_changes(vendor_id, catalog)


@activity.defn
async def notify_price_changes(changes: dict) -> bool:
    """Notify stakeholders about price changes."""
    if changes.get("significant_changes"):
        logger.info(
            "price_changes_notified",
            change_count=len(changes.get("changes", [])),
        )
    return True


# ============================================
# Contract Lifecycle
# ============================================

@activity.defn
async def analyze_contract_performance(contract_id: str) -> dict:
    """Analyze a contract's performance metrics."""
    store = get_store()
    return await store.analyze_contract_performance(contract_id)


@activity.defn
async def generate_renewal_recommendation(contract_id: str, analysis: dict) -> dict:
    """Generate a renewal recommendation for a contract."""
    store = get_store()
    return await store.generate_renewal_recommendation(contract_id, analysis)


# ============================================
# Exports
# ============================================

ALL_PROCUREMENT_ACTIVITIES = [
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
]
