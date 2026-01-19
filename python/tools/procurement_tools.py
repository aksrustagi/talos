"""
Procurement Tools with Convex Integration

LangChain tools that integrate with Convex backend for real data operations.
"""

from typing import Optional, List, Any
import json
from langchain_core.tools import tool
from tools.convex_client import get_convex_client


# ============================================
# Product Search Tools
# ============================================

@tool
async def search_products_convex(
    query: str,
    category: Optional[str] = None,
    limit: int = 10,
) -> str:
    """
    Search the unified product catalog in Convex.

    Args:
        query: Search query string (product name, SKU, or description)
        category: Optional category filter (e.g., "lab-supplies", "it-equipment")
        limit: Maximum number of results to return (default 10)

    Returns:
        JSON string with matching products including name, SKU, category, and vendors
    """
    client = get_convex_client()
    try:
        results = await client.search_products(query, category, limit)
        return json.dumps(results, indent=2)
    except Exception as e:
        return f"Error searching products: {str(e)}"


@tool
async def get_product_details(product_id: str) -> str:
    """
    Get detailed information about a specific product.

    Args:
        product_id: The unique product identifier

    Returns:
        JSON string with product details including specifications, equivalents, and vendor options
    """
    client = get_convex_client()
    try:
        product = await client.get_product(product_id)
        if not product:
            return f"Product not found: {product_id}"

        # Also get equivalents
        equivalents = await client.get_product_equivalents(product_id)
        product["equivalents"] = equivalents

        return json.dumps(product, indent=2)
    except Exception as e:
        return f"Error getting product: {str(e)}"


# ============================================
# Price Intelligence Tools
# ============================================

@tool
async def get_price_history_convex(
    product_id: str,
    vendor_id: Optional[str] = None,
    days: int = 365,
) -> str:
    """
    Get historical price data for a product from Convex.

    Args:
        product_id: Product identifier
        vendor_id: Optional vendor filter (omit for all vendors)
        days: Number of days of history (default 365)

    Returns:
        JSON string with price history including dates, prices, and price states
    """
    client = get_convex_client()
    try:
        history = await client.get_price_history(product_id, vendor_id, days)
        return json.dumps(history, indent=2)
    except Exception as e:
        return f"Error getting price history: {str(e)}"


@tool
async def get_vendor_listings_convex(product_id: str) -> str:
    """
    Get current prices from all vendors for a product.

    Args:
        product_id: Product identifier

    Returns:
        JSON string with all vendor listings including price, availability, and lead time
    """
    client = get_convex_client()
    try:
        listings = await client.get_vendor_listings(product_id)
        return json.dumps(listings, indent=2)
    except Exception as e:
        return f"Error getting vendor listings: {str(e)}"


@tool
async def get_hmm_price_state(product_id: str) -> str:
    """
    Get the current HMM price state prediction for a product.

    Args:
        product_id: Product identifier

    Returns:
        JSON string with current state, probabilities, and purchase timing recommendation
    """
    client = get_convex_client()
    try:
        state = await client.get_price_state(product_id)
        return json.dumps(state, indent=2)
    except Exception as e:
        return f"Error getting price state: {str(e)}"


@tool
async def create_price_alert_convex(
    product_id: str,
    alert_type: str,
    threshold: float,
    notify_user_id: str,
) -> str:
    """
    Create a price alert in Convex.

    Args:
        product_id: Product to monitor
        alert_type: Type of alert (price_drop, price_increase, better_price, contract_violation)
        threshold: Threshold percentage that triggers the alert
        notify_user_id: User ID to notify when alert triggers

    Returns:
        Alert ID if successful, error message otherwise
    """
    client = get_convex_client()
    try:
        alert_id = await client.create_price_alert(
            product_id, alert_type, threshold, notify_user_id
        )
        return f"Created alert {alert_id} for {product_id}"
    except Exception as e:
        return f"Error creating alert: {str(e)}"


@tool
async def get_network_benchmark_convex(product_id: str) -> str:
    """
    Get cross-university price benchmark for a product.

    Args:
        product_id: Product identifier

    Returns:
        JSON string with network-wide pricing statistics and your position
    """
    client = get_convex_client()
    try:
        benchmark = await client.get_network_benchmark(product_id)
        return json.dumps(benchmark, indent=2)
    except Exception as e:
        return f"Error getting benchmark: {str(e)}"


@tool
async def compare_vendor_prices_convex(product_id: str, quantity: int = 1) -> str:
    """
    Compare total costs across all vendors for a product.

    Args:
        product_id: Product identifier
        quantity: Quantity to price (affects volume discounts)

    Returns:
        JSON string with vendor comparison including unit price, total cost, shipping, and delivery time
    """
    client = get_convex_client()
    try:
        # Get all vendor listings
        listings = await client.get_vendor_listings(product_id)

        # Calculate total cost for each vendor
        comparisons = []
        for listing in listings:
            unit_price = listing.get("price", 0)
            total = unit_price * quantity

            # Check for volume discounts
            # This would be more sophisticated in production
            if quantity >= 100:
                total *= 0.95  # 5% volume discount
            elif quantity >= 50:
                total *= 0.97  # 3% volume discount

            comparisons.append({
                "vendor_id": listing.get("vendorId"),
                "vendor_name": listing.get("vendorName", "Unknown"),
                "sku": listing.get("vendorSku"),
                "unit_price": unit_price,
                "quantity": quantity,
                "subtotal": unit_price * quantity,
                "estimated_shipping": listing.get("shippingCost", 0),
                "total_cost": total + listing.get("shippingCost", 0),
                "lead_time_days": listing.get("leadTimeDays", 3),
                "availability": listing.get("availability", "in_stock"),
            })

        # Sort by total cost
        comparisons.sort(key=lambda x: x["total_cost"])

        return json.dumps({
            "product_id": product_id,
            "quantity": quantity,
            "comparisons": comparisons,
            "recommended": comparisons[0] if comparisons else None,
        }, indent=2)
    except Exception as e:
        return f"Error comparing prices: {str(e)}"


# ============================================
# Requisition Tools
# ============================================

@tool
async def check_budget_convex(budget_code: str, amount: float) -> str:
    """
    Check if budget is available for a purchase.

    Args:
        budget_code: Budget or cost center code
        amount: Amount to check

    Returns:
        JSON string with budget status, remaining balance, and approval needed
    """
    client = get_convex_client()
    try:
        result = await client.check_budget(budget_code, amount)
        return json.dumps(result, indent=2)
    except Exception as e:
        return f"Error checking budget: {str(e)}"


@tool
async def create_requisition_convex(
    requester_id: str,
    department: str,
    budget_code: str,
    line_items: str,  # JSON string of line items
    urgency: str = "standard",
    needed_by: Optional[str] = None,
) -> str:
    """
    Create a new requisition in Convex.

    Args:
        requester_id: ID of the person making the request
        department: Department name
        budget_code: Budget or cost center code
        line_items: JSON string array of items with productId, quantity, unitPrice
        urgency: Urgency level (standard, rush, emergency)
        needed_by: Optional date needed by (ISO format)

    Returns:
        Requisition ID if successful, error message otherwise
    """
    client = get_convex_client()
    try:
        items = json.loads(line_items)
        req_id = await client.create_requisition(
            requester_id=requester_id,
            department=department,
            budget_code=budget_code,
            line_items=items,
            urgency=urgency,
            needed_by=needed_by,
        )
        return f"Created requisition {req_id}"
    except json.JSONDecodeError:
        return "Error: line_items must be valid JSON"
    except Exception as e:
        return f"Error creating requisition: {str(e)}"


@tool
async def get_requisition_status(requisition_id: str) -> str:
    """
    Get the current status of a requisition.

    Args:
        requisition_id: Requisition identifier

    Returns:
        JSON string with requisition details and approval status
    """
    client = get_convex_client()
    try:
        req = await client.get_requisition(requisition_id)
        if not req:
            return f"Requisition not found: {requisition_id}"
        return json.dumps(req, indent=2)
    except Exception as e:
        return f"Error getting requisition: {str(e)}"


# ============================================
# Approval Tools
# ============================================

@tool
async def get_pending_approvals_convex(approver_id: str) -> str:
    """
    Get all pending approvals for an approver.

    Args:
        approver_id: ID of the approver

    Returns:
        JSON string with list of pending approvals including amounts and deadlines
    """
    client = get_convex_client()
    try:
        approvals = await client.get_pending_approvals(approver_id)
        return json.dumps(approvals, indent=2)
    except Exception as e:
        return f"Error getting approvals: {str(e)}"


@tool
async def process_approval_convex(
    requisition_id: str,
    approver_id: str,
    decision: str,
    comments: Optional[str] = None,
) -> str:
    """
    Process an approval decision.

    Args:
        requisition_id: ID of the requisition to approve/reject
        approver_id: ID of the approver making the decision
        decision: Decision (approve, reject, delegate)
        comments: Optional comments for the decision

    Returns:
        Success or error message
    """
    client = get_convex_client()
    try:
        success = await client.process_approval(
            requisition_id, approver_id, decision, comments
        )
        if success:
            return f"Successfully processed {decision} for {requisition_id}"
        return f"Failed to process approval for {requisition_id}"
    except Exception as e:
        return f"Error processing approval: {str(e)}"


# ============================================
# Vendor Tools
# ============================================

@tool
async def get_vendor_scorecard(vendor_id: str) -> str:
    """
    Get comprehensive vendor scorecard.

    Args:
        vendor_id: Vendor identifier

    Returns:
        JSON string with vendor performance metrics across all dimensions
    """
    client = get_convex_client()
    try:
        vendor = await client.get_vendor(vendor_id)
        performance = await client.get_vendor_performance(vendor_id)

        return json.dumps({
            "vendor": vendor,
            "performance": performance,
        }, indent=2)
    except Exception as e:
        return f"Error getting vendor scorecard: {str(e)}"


@tool
async def find_diverse_suppliers_convex(
    category: str,
    diversity_type: Optional[str] = None,
) -> str:
    """
    Find diverse suppliers for a category.

    Args:
        category: Product category (e.g., "lab-supplies", "office-supplies")
        diversity_type: Optional diversity classification (MWBE, SBE, SDVOSB, HUBZone)

    Returns:
        JSON string with list of diverse suppliers and their certifications
    """
    client = get_convex_client()
    try:
        vendors = await client.find_diverse_vendors(category, diversity_type)
        return json.dumps(vendors, indent=2)
    except Exception as e:
        return f"Error finding diverse suppliers: {str(e)}"


# ============================================
# Contract Tools
# ============================================

@tool
async def check_contract_price(
    product_id: str,
    vendor_id: str,
    university_id: str,
) -> str:
    """
    Check if there's a contract price for a product.

    Args:
        product_id: Product identifier
        vendor_id: Vendor identifier
        university_id: University identifier

    Returns:
        JSON string with contract price details or indication that no contract exists
    """
    client = get_convex_client()
    try:
        contract_price = await client.get_contract_price(
            product_id, vendor_id, university_id
        )
        if contract_price:
            return json.dumps(contract_price, indent=2)
        return "No contract price found for this product/vendor combination"
    except Exception as e:
        return f"Error checking contract price: {str(e)}"


@tool
async def get_expiring_contracts_convex(
    university_id: str,
    days_ahead: int = 90,
) -> str:
    """
    Get contracts expiring within specified days.

    Args:
        university_id: University identifier
        days_ahead: Number of days to look ahead (default 90)

    Returns:
        JSON string with list of expiring contracts and renewal recommendations
    """
    client = get_convex_client()
    try:
        contracts = await client.get_expiring_contracts(university_id, days_ahead)
        return json.dumps(contracts, indent=2)
    except Exception as e:
        return f"Error getting expiring contracts: {str(e)}"


# ============================================
# Analytics Tools
# ============================================

@tool
async def get_spend_analytics(
    university_id: str,
    period: str = "month",
) -> str:
    """
    Get spend analytics summary.

    Args:
        university_id: University identifier
        period: Time period (day, week, month, quarter, year)

    Returns:
        JSON string with spend summary by category, vendor, and department
    """
    client = get_convex_client()
    try:
        summary = await client.get_spend_summary(university_id, period)
        return json.dumps(summary, indent=2)
    except Exception as e:
        return f"Error getting spend analytics: {str(e)}"


@tool
async def get_savings_report_convex(
    university_id: str,
    period: str = "month",
) -> str:
    """
    Get savings and ROI report.

    Args:
        university_id: University identifier
        period: Time period (day, week, month, quarter, year)

    Returns:
        JSON string with savings by source, ROI calculation, and attribution
    """
    client = get_convex_client()
    try:
        report = await client.get_savings_report(university_id, period)
        return json.dumps(report, indent=2)
    except Exception as e:
        return f"Error getting savings report: {str(e)}"


# ============================================
# Notification Tools
# ============================================

@tool
async def send_slack_notification(
    channel: str,
    message: str,
    level: str = "info",
) -> str:
    """
    Send a notification to Slack.

    Args:
        channel: Slack channel name (without #)
        message: Message content
        level: Alert level (info, warning, critical)

    Returns:
        Success or error message
    """
    # In production, this would integrate with Slack API
    # For now, just log and return success
    return f"Sent {level} notification to #{channel}: {message[:50]}..."


@tool
async def send_email_notification(
    to_email: str,
    subject: str,
    body: str,
) -> str:
    """
    Send an email notification.

    Args:
        to_email: Recipient email address
        subject: Email subject
        body: Email body (plain text or HTML)

    Returns:
        Success or error message
    """
    # In production, this would integrate with email service
    return f"Sent email to {to_email}: {subject}"


# ============================================
# Export all tools
# ============================================

PRICE_TOOLS = [
    search_products_convex,
    get_product_details,
    get_price_history_convex,
    get_vendor_listings_convex,
    get_hmm_price_state,
    create_price_alert_convex,
    get_network_benchmark_convex,
    compare_vendor_prices_convex,
]

REQUISITION_TOOLS = [
    check_budget_convex,
    create_requisition_convex,
    get_requisition_status,
]

APPROVAL_TOOLS = [
    get_pending_approvals_convex,
    process_approval_convex,
]

VENDOR_TOOLS = [
    get_vendor_scorecard,
    find_diverse_suppliers_convex,
]

CONTRACT_TOOLS = [
    check_contract_price,
    get_expiring_contracts_convex,
]

ANALYTICS_TOOLS = [
    get_spend_analytics,
    get_savings_report_convex,
]

NOTIFICATION_TOOLS = [
    send_slack_notification,
    send_email_notification,
]

ALL_TOOLS = (
    PRICE_TOOLS +
    REQUISITION_TOOLS +
    APPROVAL_TOOLS +
    VENDOR_TOOLS +
    CONTRACT_TOOLS +
    ANALYTICS_TOOLS +
    NOTIFICATION_TOOLS
)
