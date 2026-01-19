"""
Procurement Tools Package

Provides LangChain tools integrated with Convex backend.
"""

from .convex_client import ConvexClient, ConvexConfig, get_convex_client
from .procurement_tools import (
    # Price tools
    search_products_convex,
    get_product_details,
    get_price_history_convex,
    get_vendor_listings_convex,
    get_hmm_price_state,
    create_price_alert_convex,
    get_network_benchmark_convex,
    compare_vendor_prices_convex,
    # Requisition tools
    check_budget_convex,
    create_requisition_convex,
    get_requisition_status,
    # Approval tools
    get_pending_approvals_convex,
    process_approval_convex,
    # Vendor tools
    get_vendor_scorecard,
    find_diverse_suppliers_convex,
    # Contract tools
    check_contract_price,
    get_expiring_contracts_convex,
    # Analytics tools
    get_spend_analytics,
    get_savings_report_convex,
    # Notification tools
    send_slack_notification,
    send_email_notification,
    # Tool collections
    PRICE_TOOLS,
    REQUISITION_TOOLS,
    APPROVAL_TOOLS,
    VENDOR_TOOLS,
    CONTRACT_TOOLS,
    ANALYTICS_TOOLS,
    NOTIFICATION_TOOLS,
    ALL_TOOLS,
)

__all__ = [
    # Client
    "ConvexClient",
    "ConvexConfig",
    "get_convex_client",
    # Price tools
    "search_products_convex",
    "get_product_details",
    "get_price_history_convex",
    "get_vendor_listings_convex",
    "get_hmm_price_state",
    "create_price_alert_convex",
    "get_network_benchmark_convex",
    "compare_vendor_prices_convex",
    # Requisition tools
    "check_budget_convex",
    "create_requisition_convex",
    "get_requisition_status",
    # Approval tools
    "get_pending_approvals_convex",
    "process_approval_convex",
    # Vendor tools
    "get_vendor_scorecard",
    "find_diverse_suppliers_convex",
    # Contract tools
    "check_contract_price",
    "get_expiring_contracts_convex",
    # Analytics tools
    "get_spend_analytics",
    "get_savings_report_convex",
    # Notification tools
    "send_slack_notification",
    "send_email_notification",
    # Tool collections
    "PRICE_TOOLS",
    "REQUISITION_TOOLS",
    "APPROVAL_TOOLS",
    "VENDOR_TOOLS",
    "CONTRACT_TOOLS",
    "ANALYTICS_TOOLS",
    "NOTIFICATION_TOOLS",
    "ALL_TOOLS",
]
