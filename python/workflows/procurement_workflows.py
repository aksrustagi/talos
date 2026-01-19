"""
Temporal Workflows for Procurement

Implements durable workflows for long-running procurement processes.
"""

from datetime import timedelta
from dataclasses import dataclass
from typing import Optional, List, Any

from temporalio import workflow, activity
from temporalio.common import RetryPolicy


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
# Activities
# ============================================

@activity.defn
async def validate_budget(budget_code: str, amount: float) -> dict:
    """Check if budget is available."""
    # Implementation would call Convex
    return {
        "available": True,
        "budget_code": budget_code,
        "requested": amount,
        "remaining": 50000.00,
    }


@activity.defn
async def determine_approvers(requisition: dict) -> List[dict]:
    """Determine required approvers based on rules."""
    total = requisition["total"]
    approvers = []

    if total > 500:
        approvers.append({
            "level": 1,
            "role": "manager",
            "approver_id": "manager_001",
            "approver_email": "manager@university.edu",
        })

    if total > 5000:
        approvers.append({
            "level": 2,
            "role": "director",
            "approver_id": "director_001",
            "approver_email": "director@university.edu",
        })

    if total > 25000:
        approvers.append({
            "level": 3,
            "role": "vp",
            "approver_id": "vp_001",
            "approver_email": "vp@university.edu",
        })

    if total > 100000:
        approvers.append({
            "level": 4,
            "role": "cfo",
            "approver_id": "cfo_001",
            "approver_email": "cfo@university.edu",
        })

    return approvers


@activity.defn
async def send_approval_notification(request: dict) -> bool:
    """Send approval request via email/Slack."""
    # Implementation would send actual notifications
    return True


@activity.defn
async def check_approval_status(requisition_id: str) -> dict:
    """Check if approvals are complete."""
    # Implementation would check Convex
    return {
        "approved": False,
        "rejected": False,
        "pending": True,
    }


@activity.defn
async def generate_purchase_order(requisition_id: str) -> str:
    """Generate PO from approved requisition."""
    # Implementation would create PO in system
    return f"PO-{requisition_id[-6:]}"


@activity.defn
async def send_po_to_vendor(po_number: str, vendor_id: str) -> bool:
    """Transmit PO to vendor via cXML/EDI."""
    # Implementation would use Jaggaer integration
    return True


@activity.defn
async def escalate_approval(request: dict) -> bool:
    """Escalate overdue approval."""
    # Implementation would send escalation notification
    return True


@activity.defn
async def parse_invoice(invoice_id: str) -> dict:
    """Parse invoice data."""
    return {
        "invoice_id": invoice_id,
        "invoice_number": "INV-12345",
        "vendor_id": "vendor_001",
        "po_number": "PO-123456",
        "total": 5000.00,
        "line_items": [],
    }


@activity.defn
async def find_matching_po(invoice: dict) -> dict:
    """Find matching PO for invoice."""
    return {
        "found": True,
        "po_number": invoice.get("po_number"),
        "match_confidence": 1.0,
    }


@activity.defn
async def match_invoice_lines(invoice: dict, po_number: str) -> dict:
    """Match invoice lines to PO lines."""
    return {
        "all_matched": True,
        "matched_lines": len(invoice.get("line_items", [])),
        "mismatches": [],
    }


@activity.defn
async def validate_contract_prices(invoice: dict, line_matches: dict) -> dict:
    """Validate prices against contract."""
    return {
        "all_valid": True,
        "violations": [],
    }


@activity.defn
async def verify_receipts(invoice: dict, po_number: str) -> dict:
    """Check if goods/services were received."""
    return {
        "all_received": True,
        "issues": [],
    }


@activity.defn
async def approve_invoice(invoice_id: str) -> bool:
    """Auto-approve matched invoice."""
    return True


@activity.defn
async def create_exception(
    invoice_id: str,
    line_matches: dict,
    price_validation: dict,
    receipt_check: dict,
) -> str:
    """Create exception for manual review."""
    return f"EXC-{invoice_id[-6:]}"


@activity.defn
async def analyze_contract_performance(contract_id: str) -> dict:
    """Analyze contract performance for renewal."""
    return {
        "spend_vs_commitment": 0.85,
        "price_compliance": 0.98,
        "on_time_delivery": 0.95,
        "quality_score": 4.5,
        "recommendation": "renew",
    }


@activity.defn
async def generate_renewal_recommendation(contract_id: str, analysis: dict) -> dict:
    """Generate contract renewal recommendation."""
    return {
        "recommendation": "renew",
        "suggested_changes": ["Request 3% price reduction", "Add SLA penalties"],
        "negotiation_priority": "medium",
    }


@activity.defn
async def fetch_vendor_catalog(vendor_id: str) -> dict:
    """Fetch catalog from vendor."""
    return {
        "vendor_id": vendor_id,
        "products": [],
        "fetched_at": "2024-01-15T10:00:00Z",
    }


@activity.defn
async def normalize_catalog(catalog_data: dict) -> dict:
    """Normalize catalog data."""
    return {
        "normalized_count": len(catalog_data.get("products", [])),
        "errors": [],
    }


@activity.defn
async def detect_price_changes(vendor_id: str, catalog: dict) -> dict:
    """Detect price changes in catalog."""
    return {
        "significant_changes": False,
        "changes": [],
        "new_count": 0,
        "discontinued_count": 0,
    }


@activity.defn
async def notify_price_changes(changes: dict) -> bool:
    """Notify team of price changes."""
    return True


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

        # Step 1: Validate budget
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

        # Step 2: Determine approval chain
        approvers = await workflow.execute_activity(
            determine_approvers,
            args=[requisition],
            start_to_close_timeout=timedelta(seconds=30),
        )

        if not approvers:
            # Auto-approve (under $500)
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

        # Step 3: Process each approver
        for approver in approvers:
            approval_request = {
                "requisition_id": requisition["requisition_id"],
                "approver_id": approver["approver_id"],
                "approver_email": approver["approver_email"],
                "amount": requisition["total"],
                "level": approver["level"],
            }

            # Send notification
            await workflow.execute_activity(
                send_approval_notification,
                args=[approval_request],
                start_to_close_timeout=timedelta(minutes=1),
            )

            # Wait for approval with SLA
            sla_hours = 48 if requisition["urgency"] == "standard" else 8
            deadline = workflow.now() + timedelta(hours=sla_hours)
            check_interval = timedelta(minutes=15)

            while workflow.now() < deadline:
                # Check status
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

                # Wait before checking again
                await workflow.sleep(check_interval)

            # Check if SLA exceeded
            if workflow.now() >= deadline:
                # Escalate
                await workflow.execute_activity(
                    escalate_approval,
                    args=[approval_request],
                    start_to_close_timeout=timedelta(minutes=1),
                )

                # Wait additional time after escalation
                await workflow.sleep(timedelta(hours=4))

                # Final check
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

        # Step 4: Generate PO
        po_number = await workflow.execute_activity(
            generate_purchase_order,
            args=[requisition["requisition_id"]],
            start_to_close_timeout=timedelta(minutes=2),
        )

        self.current_step = "sending_to_vendor"

        # Step 5: Send to vendor
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
        """Signal handler for approval decisions."""
        if approved:
            self.approved = True
        else:
            self.rejected = True
            self.rejection_reason = reason

    @workflow.query
    def get_status(self) -> dict:
        """Query current workflow status."""
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
        # Step 1: Parse invoice
        invoice = await workflow.execute_activity(
            parse_invoice,
            args=[invoice_id],
            start_to_close_timeout=timedelta(minutes=5),
        )

        # Step 2: Find matching PO
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

        # Step 3: Line-level matching
        line_matches = await workflow.execute_activity(
            match_invoice_lines,
            args=[invoice, po_match["po_number"]],
            start_to_close_timeout=timedelta(minutes=2),
        )

        # Step 4: Validate contract prices
        price_validation = await workflow.execute_activity(
            validate_contract_prices,
            args=[invoice, line_matches],
            start_to_close_timeout=timedelta(minutes=1),
        )

        # Step 5: Check receipts
        receipt_check = await workflow.execute_activity(
            verify_receipts,
            args=[invoice, po_match["po_number"]],
            start_to_close_timeout=timedelta(seconds=30),
        )

        # Determine final status
        if (
            line_matches["all_matched"]
            and price_validation["all_valid"]
            and receipt_check["all_received"]
        ):
            # Auto-approve
            await workflow.execute_activity(
                approve_invoice,
                args=[invoice_id],
                start_to_close_timeout=timedelta(seconds=30),
            )
            return {"status": "approved", "auto": True}
        else:
            # Route for exception handling
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
        # Step 1: Fetch catalog from vendor
        catalog_data = await workflow.execute_activity(
            fetch_vendor_catalog,
            args=[vendor_id],
            start_to_close_timeout=timedelta(minutes=30),
            retry_policy=RetryPolicy(maximum_attempts=3),
        )

        # Step 2: Normalize
        normalized = await workflow.execute_activity(
            normalize_catalog,
            args=[catalog_data],
            start_to_close_timeout=timedelta(minutes=15),
        )

        # Step 3: Detect price changes
        changes = await workflow.execute_activity(
            detect_price_changes,
            args=[vendor_id, normalized],
            start_to_close_timeout=timedelta(minutes=10),
        )

        # Step 4: Notify if significant changes
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
        # Step 1: Analyze contract performance
        analysis = await workflow.execute_activity(
            analyze_contract_performance,
            args=[contract_id],
            start_to_close_timeout=timedelta(minutes=5),
        )

        # Step 2: Generate renewal recommendation
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
