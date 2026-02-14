"""
Talos AI — Temporal Workflows

Durable workflow orchestrations for procurement processes.
"""

from .procurement_workflows import (
    RequisitionApprovalWorkflow,
    InvoiceValidationWorkflow,
    CatalogSyncWorkflow,
    ContractRenewalWorkflow,
)
from .req_to_order import RequisitionToOrderWorkflow
from .sourcing import SourcingWorkflow
from .savings_verification import SavingsVerificationWorkflow
from .contract_lifecycle import ContractLifecycleWorkflow
from .invoice_to_payment import InvoiceToPaymentWorkflow
from .price_monitoring import PriceMonitoringWorkflow
from .optimization_scan import OptimizationScanWorkflow

__all__ = [
    # Legacy workflows
    "RequisitionApprovalWorkflow",
    "InvoiceValidationWorkflow",
    "CatalogSyncWorkflow",
    "ContractRenewalWorkflow",
    # New agent-based workflows
    "RequisitionToOrderWorkflow",
    "SourcingWorkflow",
    "SavingsVerificationWorkflow",
    "ContractLifecycleWorkflow",
    "InvoiceToPaymentWorkflow",
    "PriceMonitoringWorkflow",
    "OptimizationScanWorkflow",
]
