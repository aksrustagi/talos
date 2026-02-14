"""
Temporal Workflows for Procurement

Durable workflows for long-running procurement processes.
All activity definitions now live in activities/procurement_activities.py —
this module only contains workflow orchestration logic.
"""

from datetime import timedelta
from dataclasses import dataclass
from typing import Optional, List

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.procurement_activities import (
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


# ============================================
# Data Classes
# ============================================

@dataclass
class RequisitionData:
    """Data for a requisition workflow."""
    requisition_id: str
    requester_id: str
    requester_email: str
    department: str
    budget_code: str
    line_items: List[dict]
    total: float
    urgency: str  # standard, rush, emergency
    needed_by: Optional[str] = None


@dataclass
class ApprovalRequest:
    """Data for an approval request."""
    requisition_id: str
    approver_id: str
    approver_email: str
    amount: float
    deadline: str
    level: int  # Approval level (1 = manager, 2 = director, etc.)


@dataclass
class InvoiceData:
    """Data for an invoice."""
    invoice_id: str
    invoice_number: str
    vendor_id: str
    po_number: Optional[str]
    total: float
    line_items: List[dict]


@dataclass
class ContractData:
    """Data for a contract."""
    contract_id: str
    vendor_id: str
    vendor_name: str
    start_date: str
    end_date: str
    total_value: float
    categories: List[str]


# ============================================
# Workflows
# ============================================

@workflow.defn
class RequisitionApprovalWorkflow:
    """Durable workflow for requisition approval process."""

    def __init__(self):
        self.approved = False
        self.rejected = False
        self.rejection_reason = None
        self.current_step = "initialized"

    @workflow.run
    async def run(self, requisition: dict) -> dict:
        self.current_step = "validating_budget"

        budget_check = await workflow.execute_activity(
            validate_budget,
            args=[requisition["budget_code"], requisition["total"]],
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=RetryPolicy(maximum_attempts=3),
        )

        if not budget_check["available"]:
            return {
                "status": "rejected",
                "reason": "Insufficient budget",
                "details": budget_check,
            }

        self.current_step = "determining_approvers"

        approvers = await workflow.execute_activity(
            determine_approvers,
            args=[requisition],
            start_to_close_timeout=timedelta(seconds=30),
        )

        if not approvers:
            self.current_step = "generating_po"
            po_number = await workflow.execute_activity(
                generate_purchase_order,
                args=[requisition["requisition_id"]],
                start_to_close_timeout=timedelta(minutes=2),
            )
            return {
                "status": "complete",
                "po_number": po_number,
                "auto_approved": True,
            }

        self.current_step = "awaiting_approvals"

        for approver in approvers:
            approval_request = {
                "requisition_id": requisition["requisition_id"],
                "approver_id": approver["approver_id"],
                "approver_email": approver["approver_email"],
                "amount": requisition["total"],
                "level": approver["level"],
                "deadline": str(workflow.now() + timedelta(hours=48)),
            }

            await workflow.execute_activity(
                send_approval_notification,
                args=[approval_request],
                start_to_close_timeout=timedelta(minutes=1),
            )

            sla_hours = 48 if requisition["urgency"] == "standard" else 8
            deadline = workflow.now() + timedelta(hours=sla_hours)
            check_interval = timedelta(minutes=15)

            while workflow.now() < deadline:
                status = await workflow.execute_activity(
                    check_approval_status,
                    args=[requisition["requisition_id"]],
                    start_to_close_timeout=timedelta(seconds=30),
                )

                if status.get("approved"):
                    break
                elif status.get("rejected"):
                    self.rejected = True
                    self.rejection_reason = status.get("reason", "Rejected by approver")
                    return {
                        "status": "rejected",
                        "reason": self.rejection_reason,
                        "approver": approver["approver_id"],
                    }

                await workflow.sleep(check_interval)

            if workflow.now() >= deadline:
                await workflow.execute_activity(
                    escalate_approval,
                    args=[approval_request],
                    start_to_close_timeout=timedelta(minutes=1),
                )
                await workflow.sleep(timedelta(hours=4))

                status = await workflow.execute_activity(
                    check_approval_status,
                    args=[requisition["requisition_id"]],
                    start_to_close_timeout=timedelta(seconds=30),
                )
                if not status.get("approved"):
                    return {
                        "status": "escalated_timeout",
                        "details": "Approval not received after escalation",
                    }

        self.approved = True
        self.current_step = "generating_po"

        po_number = await workflow.execute_activity(
            generate_purchase_order,
            args=[requisition["requisition_id"]],
            start_to_close_timeout=timedelta(minutes=2),
        )

        self.current_step = "sending_to_vendor"

        sent = await workflow.execute_activity(
            send_po_to_vendor,
            args=[po_number, requisition.get("vendor_id", "")],
            start_to_close_timeout=timedelta(minutes=1),
            retry_policy=RetryPolicy(maximum_attempts=5),
        )

        return {
            "status": "complete",
            "po_number": po_number,
            "sent_to_vendor": sent,
        }

    @workflow.signal
    async def approval_received(
        self,
        approver_id: str,
        approved: bool,
        reason: Optional[str] = None,
    ):
        if approved:
            self.approved = True
        else:
            self.rejected = True
            self.rejection_reason = reason

    @workflow.query
    def get_status(self) -> dict:
        return {
            "current_step": self.current_step,
            "approved": self.approved,
            "rejected": self.rejected,
            "rejection_reason": self.rejection_reason,
        }


@workflow.defn
class InvoiceValidationWorkflow:
    """Workflow for invoice three-way matching."""

    @workflow.run
    async def run(self, invoice_id: str) -> dict:
        invoice = await workflow.execute_activity(
            parse_invoice,
            args=[invoice_id],
            start_to_close_timeout=timedelta(minutes=5),
        )

        po_match = await workflow.execute_activity(
            find_matching_po,
            args=[invoice],
            start_to_close_timeout=timedelta(seconds=30),
        )

        if not po_match["found"]:
            return {
                "status": "no_po_match",
                "invoice_id": invoice_id,
                "requires_manual_review": True,
            }

        line_matches = await workflow.execute_activity(
            match_invoice_lines,
            args=[invoice, po_match["po_number"]],
            start_to_close_timeout=timedelta(minutes=2),
        )

        price_validation = await workflow.execute_activity(
            validate_contract_prices,
            args=[invoice, line_matches],
            start_to_close_timeout=timedelta(minutes=1),
        )

        receipt_check = await workflow.execute_activity(
            verify_receipts,
            args=[invoice, po_match["po_number"]],
            start_to_close_timeout=timedelta(seconds=30),
        )

        if (
            line_matches["all_matched"]
            and price_validation["all_valid"]
            and receipt_check["all_received"]
        ):
            await workflow.execute_activity(
                approve_invoice,
                args=[invoice_id],
                start_to_close_timeout=timedelta(seconds=30),
            )
            return {"status": "approved", "auto": True}
        else:
            exception_id = await workflow.execute_activity(
                create_exception,
                args=[invoice_id, line_matches, price_validation, receipt_check],
                start_to_close_timeout=timedelta(seconds=30),
            )
            return {
                "status": "exception",
                "exception_id": exception_id,
                "issues": {
                    "line_mismatches": line_matches.get("mismatches", []),
                    "price_violations": price_validation.get("violations", []),
                    "receipt_issues": receipt_check.get("issues", []),
                },
            }


@workflow.defn
class CatalogSyncWorkflow:
    """Scheduled workflow for catalog synchronization."""

    @workflow.run
    async def run(self, vendor_id: str) -> dict:
        catalog_data = await workflow.execute_activity(
            fetch_vendor_catalog,
            args=[vendor_id],
            start_to_close_timeout=timedelta(minutes=30),
            retry_policy=RetryPolicy(maximum_attempts=3),
        )

        normalized = await workflow.execute_activity(
            normalize_catalog,
            args=[catalog_data],
            start_to_close_timeout=timedelta(minutes=15),
        )

        changes = await workflow.execute_activity(
            detect_price_changes,
            args=[vendor_id, normalized],
            start_to_close_timeout=timedelta(minutes=10),
        )

        if changes.get("significant_changes"):
            await workflow.execute_activity(
                notify_price_changes,
                args=[changes],
                start_to_close_timeout=timedelta(minutes=2),
            )

        return {
            "vendor_id": vendor_id,
            "products_processed": normalized.get("normalized_count", 0),
            "price_changes": len(changes.get("changes", [])),
            "new_products": changes.get("new_count", 0),
            "discontinued": changes.get("discontinued_count", 0),
        }


@workflow.defn
class ContractRenewalWorkflow:
    """Workflow for contract renewal process."""

    @workflow.run
    async def run(self, contract_id: str) -> dict:
        analysis = await workflow.execute_activity(
            analyze_contract_performance,
            args=[contract_id],
            start_to_close_timeout=timedelta(minutes=5),
        )

        recommendation = await workflow.execute_activity(
            generate_renewal_recommendation,
            args=[contract_id, analysis],
            start_to_close_timeout=timedelta(minutes=2),
        )

        return {
            "contract_id": contract_id,
            "analysis": analysis,
            "recommendation": recommendation,
        }
