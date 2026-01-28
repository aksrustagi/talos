"""
UniMarket Tools for AI Agents

Provides LangChain-compatible tools for AI agents to interact with UniMarket.
These tools wrap the UniMarket client for use in agent workflows.
"""

from typing import Optional, List, Dict, Any
from langchain_core.tools import tool
import structlog

from .unimarket_client import get_unimarket_client, UniMarketClient

logger = structlog.get_logger()


# ============================================
# Product Catalog Tools
# ============================================

@tool
async def unimarket_search_products(
    query: str,
    category: Optional[str] = None,
    vendor: Optional[str] = None,
    price_min: Optional[float] = None,
    price_max: Optional[float] = None,
    in_stock_only: bool = False,
    limit: int = 20,
) -> Dict[str, Any]:
    """
    Search for products in the UniMarket catalog.

    Args:
        query: Search query (product name, SKU, manufacturer, etc.)
        category: Filter by product category
        vendor: Filter by specific vendor
        price_min: Minimum price filter
        price_max: Maximum price filter
        in_stock_only: Only return in-stock items
        limit: Maximum number of results

    Returns:
        Dict containing products list and search metadata
    """
    client = get_unimarket_client()
    result = await client.search_products(
        query=query,
        category=category,
        vendor=vendor,
        price_min=price_min,
        price_max=price_max,
        in_stock_only=in_stock_only,
        page_size=limit,
    )

    if not result.success:
        return {"error": result.error, "products": []}

    return {
        "products": result.data,
        "total": result.meta.get("pagination", {}).get("totalItems", len(result.data)) if result.meta else len(result.data),
        "query": query,
    }


@tool
async def unimarket_get_product(product_id: str) -> Dict[str, Any]:
    """
    Get detailed information about a specific product.

    Args:
        product_id: UniMarket product ID

    Returns:
        Dict containing product details
    """
    client = get_unimarket_client()
    result = await client.get_product(product_id)

    if not result.success:
        return {"error": result.error}

    return {"product": result.data}


@tool
async def unimarket_get_product_pricing(
    product_id: str,
    quantity: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Get pricing information for a product including volume discounts.

    Args:
        product_id: UniMarket product ID
        quantity: Optional quantity to calculate volume discount

    Returns:
        Dict containing pricing details and any applicable discounts
    """
    client = get_unimarket_client()
    result = await client.get_product_pricing(product_id, quantity)

    if not result.success:
        return {"error": result.error}

    return {"pricing": result.data}


@tool
async def unimarket_compare_prices(product_id: str) -> Dict[str, Any]:
    """
    Compare prices for a product across all available vendors.

    Args:
        product_id: UniMarket product ID

    Returns:
        Dict containing price comparison across vendors
    """
    client = get_unimarket_client()
    result = await client.compare_product_prices(product_id)

    if not result.success:
        return {"error": result.error}

    return {"price_comparison": result.data}


# ============================================
# Shopping Cart Tools
# ============================================

@tool
async def unimarket_create_cart(user_id: str) -> Dict[str, Any]:
    """
    Create a new shopping cart for a user.

    Args:
        user_id: ID of the user creating the cart

    Returns:
        Dict containing cart details
    """
    client = get_unimarket_client()
    result = await client.create_cart(user_id)

    if not result.success:
        return {"error": result.error}

    return {"cart": result.data}


@tool
async def unimarket_add_to_cart(
    cart_id: str,
    product_id: str,
    sku: str,
    quantity: int,
    notes: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Add an item to a shopping cart.

    Args:
        cart_id: ID of the cart
        product_id: UniMarket product ID
        sku: Product SKU
        quantity: Quantity to add
        notes: Optional notes for the line item

    Returns:
        Dict containing updated cart
    """
    client = get_unimarket_client()
    result = await client.add_to_cart(cart_id, product_id, sku, quantity, notes)

    if not result.success:
        return {"error": result.error}

    return {"cart": result.data}


@tool
async def unimarket_get_cart(cart_id: str) -> Dict[str, Any]:
    """
    Get shopping cart details.

    Args:
        cart_id: ID of the cart

    Returns:
        Dict containing cart details and items
    """
    client = get_unimarket_client()
    result = await client.get_cart(cart_id)

    if not result.success:
        return {"error": result.error}

    return {"cart": result.data}


@tool
async def unimarket_submit_cart(
    cart_id: str,
    ship_to_name: str,
    ship_to_street: str,
    ship_to_city: str,
    ship_to_state: str,
    ship_to_postal_code: str,
    ship_to_country: str,
    budget_code: str,
    gl_code: Optional[str] = None,
    grant_number: Optional[str] = None,
    urgency: str = "standard",
    needed_by_date: Optional[str] = None,
    special_instructions: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Submit a shopping cart to create a requisition/order.

    Args:
        cart_id: ID of the cart to submit
        ship_to_name: Shipping address name
        ship_to_street: Shipping street address
        ship_to_city: Shipping city
        ship_to_state: Shipping state
        ship_to_postal_code: Shipping postal code
        ship_to_country: Shipping country
        budget_code: Budget code for the order
        gl_code: Optional GL account code
        grant_number: Optional grant number if applicable
        urgency: Order urgency (standard, rush, emergency)
        needed_by_date: Date when items are needed
        special_instructions: Optional delivery instructions

    Returns:
        Dict containing requisition ID and PO numbers
    """
    client = get_unimarket_client()

    ship_to = {
        "name": ship_to_name,
        "street1": ship_to_street,
        "city": ship_to_city,
        "state": ship_to_state,
        "postalCode": ship_to_postal_code,
        "country": ship_to_country,
        "countryCode": "US",
    }

    # Use same address for billing (can be made separate if needed)
    bill_to = ship_to.copy()

    result = await client.submit_cart(
        cart_id=cart_id,
        ship_to=ship_to,
        bill_to=bill_to,
        budget_code=budget_code,
        gl_code=gl_code,
        grant_number=grant_number,
        urgency=urgency,
        needed_by_date=needed_by_date,
        special_instructions=special_instructions,
    )

    if not result.success:
        return {"error": result.error}

    return {"order": result.data}


# ============================================
# Purchase Order Tools
# ============================================

@tool
async def unimarket_get_purchase_order(po_number: str) -> Dict[str, Any]:
    """
    Get details of a purchase order.

    Args:
        po_number: Purchase order number

    Returns:
        Dict containing PO details
    """
    client = get_unimarket_client()
    result = await client.get_purchase_order(po_number)

    if not result.success:
        return {"error": result.error}

    return {"purchase_order": result.data}


@tool
async def unimarket_list_purchase_orders(
    status: Optional[str] = None,
    vendor_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    limit: int = 50,
) -> Dict[str, Any]:
    """
    List purchase orders with optional filters.

    Args:
        status: Filter by status (pending, confirmed, shipped, delivered, cancelled)
        vendor_id: Filter by vendor
        from_date: Filter orders from this date (YYYY-MM-DD)
        to_date: Filter orders until this date (YYYY-MM-DD)
        limit: Maximum number of results

    Returns:
        Dict containing list of purchase orders
    """
    client = get_unimarket_client()
    result = await client.get_purchase_orders(
        status=status,
        vendor_id=vendor_id,
        from_date=from_date,
        to_date=to_date,
        page_size=limit,
    )

    if not result.success:
        return {"error": result.error}

    return {"purchase_orders": result.data}


@tool
async def unimarket_track_order(po_number: str) -> Dict[str, Any]:
    """
    Get tracking information for a purchase order.

    Args:
        po_number: Purchase order number

    Returns:
        Dict containing tracking details and shipment status
    """
    client = get_unimarket_client()
    result = await client.get_order_tracking(po_number)

    if not result.success:
        return {"error": result.error}

    return {"tracking": result.data}


@tool
async def unimarket_cancel_order(
    po_number: str,
    reason: str,
) -> Dict[str, Any]:
    """
    Cancel a purchase order.

    Args:
        po_number: Purchase order number
        reason: Reason for cancellation

    Returns:
        Dict containing cancelled order details
    """
    client = get_unimarket_client()
    result = await client.cancel_order(po_number, reason)

    if not result.success:
        return {"error": result.error}

    return {"cancelled_order": result.data}


# ============================================
# Invoice Tools
# ============================================

@tool
async def unimarket_get_invoice(invoice_number: str) -> Dict[str, Any]:
    """
    Get details of an invoice.

    Args:
        invoice_number: Invoice number

    Returns:
        Dict containing invoice details
    """
    client = get_unimarket_client()
    result = await client.get_invoice(invoice_number)

    if not result.success:
        return {"error": result.error}

    return {"invoice": result.data}


@tool
async def unimarket_list_invoices(
    status: Optional[str] = None,
    vendor_id: Optional[str] = None,
    po_number: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    limit: int = 50,
) -> Dict[str, Any]:
    """
    List invoices with optional filters.

    Args:
        status: Filter by status (pending, matched, exception, approved, paid, disputed)
        vendor_id: Filter by vendor
        po_number: Filter by PO number
        from_date: Filter invoices from this date
        to_date: Filter invoices until this date
        limit: Maximum number of results

    Returns:
        Dict containing list of invoices
    """
    client = get_unimarket_client()
    result = await client.get_invoices(
        status=status,
        vendor_id=vendor_id,
        po_number=po_number,
        from_date=from_date,
        to_date=to_date,
        page_size=limit,
    )

    if not result.success:
        return {"error": result.error}

    return {"invoices": result.data}


@tool
async def unimarket_match_invoice(invoice_number: str) -> Dict[str, Any]:
    """
    Match an invoice against purchase orders and receipts (three-way match).

    Args:
        invoice_number: Invoice number to match

    Returns:
        Dict containing match results and any exceptions
    """
    client = get_unimarket_client()
    result = await client.match_invoice(invoice_number)

    if not result.success:
        return {"error": result.error}

    return {"match_result": result.data}


@tool
async def unimarket_approve_invoice(
    invoice_number: str,
    approver_id: str,
    notes: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Approve an invoice for payment.

    Args:
        invoice_number: Invoice number
        approver_id: ID of the approver
        notes: Optional approval notes

    Returns:
        Dict containing approved invoice
    """
    client = get_unimarket_client()
    result = await client.approve_invoice(invoice_number, approver_id, notes)

    if not result.success:
        return {"error": result.error}

    return {"approved_invoice": result.data}


@tool
async def unimarket_dispute_invoice(
    invoice_number: str,
    reason: str,
    line_numbers: Optional[List[int]] = None,
) -> Dict[str, Any]:
    """
    Dispute an invoice.

    Args:
        invoice_number: Invoice number
        reason: Reason for dispute
        line_numbers: Optional specific line numbers being disputed

    Returns:
        Dict containing dispute details
    """
    client = get_unimarket_client()
    result = await client.dispute_invoice(invoice_number, reason, line_numbers)

    if not result.success:
        return {"error": result.error}

    return {"dispute": result.data}


# ============================================
# Vendor Tools
# ============================================

@tool
async def unimarket_list_vendors(
    category: Optional[str] = None,
    diversity_status: Optional[List[str]] = None,
    certifications: Optional[List[str]] = None,
    limit: int = 50,
) -> Dict[str, Any]:
    """
    List vendors with optional filters.

    Args:
        category: Filter by product category
        diversity_status: Filter by diversity certifications (MWBE, WBE, MBE, SBE, etc.)
        certifications: Filter by vendor certifications
        limit: Maximum number of results

    Returns:
        Dict containing list of vendors
    """
    client = get_unimarket_client()
    result = await client.get_vendors(
        category=category,
        diversity_status=diversity_status,
        certifications=certifications,
        page_size=limit,
    )

    if not result.success:
        return {"error": result.error}

    return {"vendors": result.data}


@tool
async def unimarket_get_vendor(vendor_id: str) -> Dict[str, Any]:
    """
    Get detailed information about a vendor.

    Args:
        vendor_id: Vendor ID

    Returns:
        Dict containing vendor details
    """
    client = get_unimarket_client()
    result = await client.get_vendor(vendor_id)

    if not result.success:
        return {"error": result.error}

    return {"vendor": result.data}


@tool
async def unimarket_get_vendor_performance(vendor_id: str) -> Dict[str, Any]:
    """
    Get performance metrics for a vendor.

    Args:
        vendor_id: Vendor ID

    Returns:
        Dict containing vendor performance metrics
    """
    client = get_unimarket_client()
    result = await client.get_vendor_performance(vendor_id)

    if not result.success:
        return {"error": result.error}

    return {"performance": result.data}


# ============================================
# Inventory Tools
# ============================================

@tool
async def unimarket_check_inventory(
    items: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Check inventory availability for multiple items.

    Args:
        items: List of items to check, each with productId, sku, and quantity

    Returns:
        Dict containing availability for each item
    """
    client = get_unimarket_client()
    result = await client.check_inventory(items)

    if not result.success:
        return {"error": result.error}

    return {"availability": result.data}


# ============================================
# Contract Tools
# ============================================

@tool
async def unimarket_list_contracts(
    vendor_id: Optional[str] = None,
    status: Optional[str] = None,
    expiring_within_days: Optional[int] = None,
) -> Dict[str, Any]:
    """
    List contracts with optional filters.

    Args:
        vendor_id: Filter by vendor
        status: Filter by status (active, expired, pending)
        expiring_within_days: Filter contracts expiring within N days

    Returns:
        Dict containing list of contracts
    """
    client = get_unimarket_client()
    result = await client.get_contracts(
        vendor_id=vendor_id,
        status=status,
        expiring_within_days=expiring_within_days,
    )

    if not result.success:
        return {"error": result.error}

    return {"contracts": result.data}


@tool
async def unimarket_get_contract_price(
    product_id: str,
    vendor_id: str,
    quantity: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Get contract price for a product from a specific vendor.

    Args:
        product_id: Product ID
        vendor_id: Vendor ID
        quantity: Optional quantity for volume pricing

    Returns:
        Dict containing contract pricing details
    """
    client = get_unimarket_client()
    result = await client.get_contract_price(product_id, vendor_id, quantity)

    if not result.success:
        return {"error": result.error}

    return {"contract_price": result.data}


# ============================================
# Report Tools
# ============================================

@tool
async def unimarket_get_spend_report(
    from_date: str,
    to_date: str,
    group_by: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Get spend analytics report from UniMarket.

    Args:
        from_date: Start date (YYYY-MM-DD)
        to_date: End date (YYYY-MM-DD)
        group_by: Group results by (vendor, category, department, month)

    Returns:
        Dict containing spend report data
    """
    client = get_unimarket_client()
    result = await client.get_spend_report(from_date, to_date, group_by)

    if not result.success:
        return {"error": result.error}

    return {"spend_report": result.data}


@tool
async def unimarket_get_savings_report(
    from_date: str,
    to_date: str,
) -> Dict[str, Any]:
    """
    Get savings report from UniMarket purchases.

    Args:
        from_date: Start date (YYYY-MM-DD)
        to_date: End date (YYYY-MM-DD)

    Returns:
        Dict containing savings report data
    """
    client = get_unimarket_client()
    result = await client.get_savings_report(from_date, to_date)

    if not result.success:
        return {"error": result.error}

    return {"savings_report": result.data}


# ============================================
# PunchOut Tools
# ============================================

@tool
async def unimarket_initiate_punchout(
    vendor_id: str,
    user_id: str,
    return_url: str,
) -> Dict[str, Any]:
    """
    Initiate a PunchOut session with a vendor.

    Args:
        vendor_id: Vendor ID to PunchOut to
        user_id: User initiating the session
        return_url: URL to return to after PunchOut

    Returns:
        Dict containing PunchOut session details and URL
    """
    client = get_unimarket_client()
    result = await client.initiate_punchout(vendor_id, user_id, return_url)

    if not result.success:
        return {"error": result.error}

    return {"punchout_session": result.data}


# ============================================
# Catalog Sync Tools
# ============================================

@tool
async def unimarket_sync_catalog(
    vendor_id: Optional[str] = None,
    full_sync: bool = False,
) -> Dict[str, Any]:
    """
    Trigger a catalog sync with UniMarket.

    Args:
        vendor_id: Optional specific vendor to sync
        full_sync: Whether to perform a full sync or incremental

    Returns:
        Dict containing sync job details
    """
    client = get_unimarket_client()
    result = await client.sync_catalog(vendor_id, full_sync)

    if not result.success:
        return {"error": result.error}

    return {"sync_job": result.data}


@tool
async def unimarket_get_sync_status(sync_id: str) -> Dict[str, Any]:
    """
    Get status of a catalog sync job.

    Args:
        sync_id: Sync job ID

    Returns:
        Dict containing sync job status and progress
    """
    client = get_unimarket_client()
    result = await client.get_catalog_sync_status(sync_id)

    if not result.success:
        return {"error": result.error}

    return {"sync_status": result.data}


# ============================================
# Tool Registry
# ============================================

UNIMARKET_TOOLS = [
    # Product Catalog
    unimarket_search_products,
    unimarket_get_product,
    unimarket_get_product_pricing,
    unimarket_compare_prices,
    # Shopping Cart
    unimarket_create_cart,
    unimarket_add_to_cart,
    unimarket_get_cart,
    unimarket_submit_cart,
    # Purchase Orders
    unimarket_get_purchase_order,
    unimarket_list_purchase_orders,
    unimarket_track_order,
    unimarket_cancel_order,
    # Invoices
    unimarket_get_invoice,
    unimarket_list_invoices,
    unimarket_match_invoice,
    unimarket_approve_invoice,
    unimarket_dispute_invoice,
    # Vendors
    unimarket_list_vendors,
    unimarket_get_vendor,
    unimarket_get_vendor_performance,
    # Inventory
    unimarket_check_inventory,
    # Contracts
    unimarket_list_contracts,
    unimarket_get_contract_price,
    # Reports
    unimarket_get_spend_report,
    unimarket_get_savings_report,
    # PunchOut
    unimarket_initiate_punchout,
    # Catalog Sync
    unimarket_sync_catalog,
    unimarket_get_sync_status,
]


def get_unimarket_tools() -> List:
    """Get all UniMarket tools for agent registration."""
    return UNIMARKET_TOOLS
