"""
UniMarket Integration Client

Provides Python interface to UniMarket marketplace platform for all AI agents.
Supports product search, ordering, invoice processing, punchout sessions,
and real-time inventory management.
"""

from typing import Optional, List, Any, Dict, Union
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import os
import httpx
import structlog
import hashlib
import hmac
import json

logger = structlog.get_logger()


class UniMarketEnvironment(Enum):
    SANDBOX = "sandbox"
    PRODUCTION = "production"


class OrderStatus(Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class InvoiceStatus(Enum):
    PENDING = "pending"
    MATCHED = "matched"
    EXCEPTION = "exception"
    APPROVED = "approved"
    PAID = "paid"
    DISPUTED = "disputed"


class Availability(Enum):
    IN_STOCK = "in_stock"
    LIMITED = "limited"
    BACKORDER = "backorder"
    OUT_OF_STOCK = "out_of_stock"
    DISCONTINUED = "discontinued"


@dataclass
class UniMarketConfig:
    """UniMarket connection configuration."""
    base_url: str
    api_key: str
    api_secret: str
    organization_id: str
    environment: UniMarketEnvironment = UniMarketEnvironment.PRODUCTION
    webhook_secret: Optional[str] = None
    timeout: float = 30.0

    @classmethod
    def from_env(cls) -> "UniMarketConfig":
        """Create config from environment variables."""
        return cls(
            base_url=os.getenv("UNIMARKET_BASE_URL", "https://api.unimarket.com/v2"),
            api_key=os.getenv("UNIMARKET_API_KEY", ""),
            api_secret=os.getenv("UNIMARKET_API_SECRET", ""),
            organization_id=os.getenv("UNIMARKET_ORG_ID", ""),
            environment=UniMarketEnvironment(os.getenv("UNIMARKET_ENV", "production")),
            webhook_secret=os.getenv("UNIMARKET_WEBHOOK_SECRET"),
            timeout=float(os.getenv("UNIMARKET_TIMEOUT", "30")),
        )


@dataclass
class UniMarketCredentials:
    """OAuth credentials for UniMarket API."""
    access_token: str
    refresh_token: str
    expires_at: datetime


@dataclass
class UniMarketProduct:
    """Product data from UniMarket catalog."""
    product_id: str
    sku: str
    name: str
    description: str
    manufacturer: str
    manufacturer_part_number: str
    category: List[str]
    unspsc_code: Optional[str]
    price: float
    currency: str
    unit_of_measure: str
    pack_size: int
    min_order_qty: int
    availability: Availability
    lead_time_days: int
    image_url: Optional[str] = None
    specifications: Dict[str, str] = field(default_factory=dict)
    certifications: List[str] = field(default_factory=list)
    sustainability_rating: Optional[str] = None
    diversity_status: List[str] = field(default_factory=list)


@dataclass
class UniMarketCartItem:
    """Item in a shopping cart."""
    product_id: str
    sku: str
    name: str
    quantity: int
    unit_price: float
    currency: str
    extended_price: float
    unit_of_measure: str
    notes: Optional[str] = None


@dataclass
class UniMarketCart:
    """Shopping cart."""
    cart_id: str
    user_id: str
    organization_id: str
    items: List[UniMarketCartItem]
    subtotal: float
    currency: str
    created_at: datetime
    updated_at: datetime
    expires_at: Optional[datetime] = None


@dataclass
class UniMarketAddress:
    """Address for shipping/billing."""
    name: str
    street1: str
    city: str
    state: str
    postal_code: str
    country: str
    country_code: str
    attention: Optional[str] = None
    street2: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None


@dataclass
class UniMarketPOLineItem:
    """Purchase order line item."""
    line_number: int
    product_id: str
    sku: str
    description: str
    quantity: int
    unit_price: float
    extended_price: float
    unit_of_measure: str
    gl_code: Optional[str] = None
    budget_code: Optional[str] = None
    grant_number: Optional[str] = None
    quantity_received: int = 0
    quantity_invoiced: int = 0


@dataclass
class UniMarketPurchaseOrder:
    """Purchase order."""
    po_number: str
    order_date: str
    status: OrderStatus
    vendor_id: str
    vendor_name: str
    ship_to: UniMarketAddress
    bill_to: UniMarketAddress
    line_items: List[UniMarketPOLineItem]
    subtotal: float
    shipping_cost: float
    tax_amount: float
    total_amount: float
    currency: str
    payment_terms: str
    special_instructions: Optional[str] = None
    tracking_numbers: List[str] = field(default_factory=list)
    estimated_delivery_date: Optional[str] = None


@dataclass
class UniMarketInvoiceLineItem:
    """Invoice line item."""
    line_number: int
    sku: str
    description: str
    quantity: int
    unit_price: float
    extended_price: float
    unit_of_measure: str
    po_line_number: Optional[int] = None
    product_id: Optional[str] = None


@dataclass
class UniMarketInvoice:
    """Invoice data."""
    invoice_number: str
    invoice_date: str
    due_date: str
    po_number: str
    vendor_id: str
    vendor_name: str
    status: InvoiceStatus
    line_items: List[UniMarketInvoiceLineItem]
    subtotal: float
    tax_amount: float
    shipping_amount: float
    total_amount: float
    currency: str
    payment_terms: str
    early_pay_discount: Optional[Dict[str, Any]] = None


@dataclass
class UniMarketAPIResponse:
    """Standard API response wrapper."""
    success: bool
    data: Optional[Any] = None
    error: Optional[Dict[str, str]] = None
    meta: Optional[Dict[str, Any]] = None


class UniMarketClient:
    """
    Async client for UniMarket marketplace operations.

    Provides methods for:
    - Product catalog search and management
    - Shopping cart operations
    - Purchase order creation and tracking
    - Invoice processing and matching
    - Vendor management
    - PunchOut sessions
    - Inventory checking
    - Contract pricing
    """

    def __init__(self, config: Optional[UniMarketConfig] = None):
        self.config = config or UniMarketConfig.from_env()
        self._credentials: Optional[UniMarketCredentials] = None
        self._client = httpx.AsyncClient(
            base_url=self.config.base_url,
            timeout=self.config.timeout,
        )

    def _build_headers(self) -> Dict[str, str]:
        """Build request headers."""
        headers = {
            "Content-Type": "application/json",
            "X-Organization-Id": self.config.organization_id,
            "X-Request-Id": self._generate_request_id(),
        }
        if self._credentials:
            headers["Authorization"] = f"Bearer {self._credentials.access_token}"
        return headers

    def _generate_request_id(self) -> str:
        """Generate unique request ID."""
        import random
        import string
        random_str = ''.join(random.choices(string.ascii_lowercase + string.digits, k=12))
        return f"req_{int(datetime.now().timestamp())}_{random_str}"

    async def authenticate(self) -> UniMarketCredentials:
        """Authenticate with UniMarket API."""
        try:
            response = await self._client.post(
                "/auth/token",
                json={
                    "apiKey": self.config.api_key,
                    "apiSecret": self.config.api_secret,
                    "organizationId": self.config.organization_id,
                },
            )
            response.raise_for_status()
            data = response.json()

            self._credentials = UniMarketCredentials(
                access_token=data["accessToken"],
                refresh_token=data["refreshToken"],
                expires_at=datetime.now() + timedelta(seconds=data["expiresIn"]),
            )
            return self._credentials
        except httpx.HTTPError as e:
            logger.error("UniMarket authentication failed", error=str(e))
            raise

    async def _ensure_authenticated(self):
        """Ensure we have valid credentials."""
        if not self._credentials or datetime.now() >= self._credentials.expires_at - timedelta(minutes=1):
            await self.authenticate()

    async def _request(
        self,
        method: str,
        endpoint: str,
        params: Optional[Dict] = None,
        json_data: Optional[Dict] = None,
    ) -> UniMarketAPIResponse:
        """Make authenticated API request."""
        await self._ensure_authenticated()

        try:
            response = await self._client.request(
                method,
                endpoint,
                headers=self._build_headers(),
                params=params,
                json=json_data,
            )

            data = response.json()

            if not response.is_success:
                return UniMarketAPIResponse(
                    success=False,
                    error={
                        "code": data.get("error", {}).get("code", str(response.status_code)),
                        "message": data.get("error", {}).get("message", response.reason_phrase),
                    },
                    meta=data.get("meta"),
                )

            return UniMarketAPIResponse(
                success=True,
                data=data.get("data", data),
                meta=data.get("meta"),
            )
        except httpx.HTTPError as e:
            logger.error("UniMarket API request failed", endpoint=endpoint, error=str(e))
            return UniMarketAPIResponse(
                success=False,
                error={"code": "REQUEST_FAILED", "message": str(e)},
            )

    # ============================================
    # Product Catalog Operations
    # ============================================

    async def search_products(
        self,
        query: str,
        category: Optional[str] = None,
        vendor: Optional[str] = None,
        price_min: Optional[float] = None,
        price_max: Optional[float] = None,
        in_stock_only: bool = False,
        certifications: Optional[List[str]] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> UniMarketAPIResponse:
        """Search products in UniMarket catalog."""
        params = {
            "q": query,
            "page": page,
            "pageSize": page_size,
        }
        if category:
            params["category"] = category
        if vendor:
            params["vendor"] = vendor
        if price_min:
            params["priceMin"] = price_min
        if price_max:
            params["priceMax"] = price_max
        if in_stock_only:
            params["inStockOnly"] = "true"
        if certifications:
            params["certifications"] = ",".join(certifications)

        return await self._request("GET", "/catalog/products", params=params)

    async def get_product(self, product_id: str) -> UniMarketAPIResponse:
        """Get product by ID."""
        return await self._request("GET", f"/catalog/products/{product_id}")

    async def get_product_by_sku(
        self,
        sku: str,
        vendor_id: Optional[str] = None,
    ) -> UniMarketAPIResponse:
        """Get product by SKU."""
        params = {"sku": sku}
        if vendor_id:
            params["vendorId"] = vendor_id
        return await self._request("GET", "/catalog/products/by-sku", params=params)

    async def get_product_pricing(
        self,
        product_id: str,
        quantity: Optional[int] = None,
    ) -> UniMarketAPIResponse:
        """Get pricing information for a product."""
        params = {}
        if quantity:
            params["quantity"] = quantity
        return await self._request("GET", f"/catalog/products/{product_id}/pricing", params=params)

    async def compare_product_prices(self, product_id: str) -> UniMarketAPIResponse:
        """Compare prices across vendors for a product."""
        return await self._request("GET", f"/catalog/products/{product_id}/compare")

    async def sync_catalog(
        self,
        vendor_id: Optional[str] = None,
        full_sync: bool = False,
        since: Optional[str] = None,
    ) -> UniMarketAPIResponse:
        """Trigger catalog sync."""
        return await self._request(
            "POST",
            "/catalog/sync",
            json_data={
                "vendorId": vendor_id,
                "fullSync": full_sync,
                "since": since,
            },
        )

    async def get_catalog_sync_status(self, sync_id: str) -> UniMarketAPIResponse:
        """Get status of catalog sync operation."""
        return await self._request("GET", f"/catalog/sync/{sync_id}")

    # ============================================
    # Shopping Cart Operations
    # ============================================

    async def create_cart(self, user_id: str) -> UniMarketAPIResponse:
        """Create a new shopping cart."""
        return await self._request("POST", "/cart", json_data={"userId": user_id})

    async def get_cart(self, cart_id: str) -> UniMarketAPIResponse:
        """Get cart by ID."""
        return await self._request("GET", f"/cart/{cart_id}")

    async def add_to_cart(
        self,
        cart_id: str,
        product_id: str,
        sku: str,
        quantity: int,
        notes: Optional[str] = None,
    ) -> UniMarketAPIResponse:
        """Add item to cart."""
        return await self._request(
            "POST",
            f"/cart/{cart_id}/items",
            json_data={
                "productId": product_id,
                "sku": sku,
                "quantity": quantity,
                "notes": notes,
            },
        )

    async def update_cart_item(
        self,
        cart_id: str,
        product_id: str,
        quantity: int,
    ) -> UniMarketAPIResponse:
        """Update cart item quantity."""
        return await self._request(
            "PUT",
            f"/cart/{cart_id}/items/{product_id}",
            json_data={"quantity": quantity},
        )

    async def remove_from_cart(self, cart_id: str, product_id: str) -> UniMarketAPIResponse:
        """Remove item from cart."""
        return await self._request("DELETE", f"/cart/{cart_id}/items/{product_id}")

    async def clear_cart(self, cart_id: str) -> UniMarketAPIResponse:
        """Clear all items from cart."""
        return await self._request("DELETE", f"/cart/{cart_id}/items")

    async def submit_cart(
        self,
        cart_id: str,
        ship_to: Dict[str, str],
        bill_to: Dict[str, str],
        budget_code: str,
        gl_code: Optional[str] = None,
        grant_number: Optional[str] = None,
        urgency: str = "standard",
        needed_by_date: Optional[str] = None,
        special_instructions: Optional[str] = None,
    ) -> UniMarketAPIResponse:
        """Submit cart for ordering."""
        return await self._request(
            "POST",
            f"/cart/{cart_id}/submit",
            json_data={
                "shipTo": ship_to,
                "billTo": bill_to,
                "budgetCode": budget_code,
                "glCode": gl_code,
                "grantNumber": grant_number,
                "urgency": urgency,
                "neededByDate": needed_by_date,
                "specialInstructions": special_instructions,
            },
        )

    # ============================================
    # Purchase Order Operations
    # ============================================

    async def create_purchase_order(self, order_data: Dict[str, Any]) -> UniMarketAPIResponse:
        """Create a new purchase order."""
        return await self._request("POST", "/orders", json_data=order_data)

    async def get_purchase_order(self, po_number: str) -> UniMarketAPIResponse:
        """Get purchase order by PO number."""
        return await self._request("GET", f"/orders/{po_number}")

    async def get_purchase_orders(
        self,
        status: Optional[str] = None,
        vendor_id: Optional[str] = None,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> UniMarketAPIResponse:
        """List purchase orders with filters."""
        params = {"page": page, "pageSize": page_size}
        if status:
            params["status"] = status
        if vendor_id:
            params["vendorId"] = vendor_id
        if from_date:
            params["fromDate"] = from_date
        if to_date:
            params["toDate"] = to_date
        return await self._request("GET", "/orders", params=params)

    async def update_order_status(
        self,
        po_number: str,
        status: str,
        notes: Optional[str] = None,
    ) -> UniMarketAPIResponse:
        """Update purchase order status."""
        return await self._request(
            "PATCH",
            f"/orders/{po_number}/status",
            json_data={"status": status, "notes": notes},
        )

    async def cancel_order(self, po_number: str, reason: str) -> UniMarketAPIResponse:
        """Cancel a purchase order."""
        return await self._request(
            "POST",
            f"/orders/{po_number}/cancel",
            json_data={"reason": reason},
        )

    async def transmit_order(
        self,
        po_number: str,
        method: str = "api",
    ) -> UniMarketAPIResponse:
        """Transmit purchase order to vendor."""
        return await self._request(
            "POST",
            f"/orders/{po_number}/transmit",
            json_data={"method": method},
        )

    async def get_order_tracking(self, po_number: str) -> UniMarketAPIResponse:
        """Get tracking information for an order."""
        return await self._request("GET", f"/orders/{po_number}/tracking")

    # ============================================
    # Invoice Operations
    # ============================================

    async def get_invoice(self, invoice_number: str) -> UniMarketAPIResponse:
        """Get invoice by number."""
        return await self._request("GET", f"/invoices/{invoice_number}")

    async def get_invoices(
        self,
        status: Optional[str] = None,
        vendor_id: Optional[str] = None,
        po_number: Optional[str] = None,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> UniMarketAPIResponse:
        """List invoices with filters."""
        params = {"page": page, "pageSize": page_size}
        if status:
            params["status"] = status
        if vendor_id:
            params["vendorId"] = vendor_id
        if po_number:
            params["poNumber"] = po_number
        if from_date:
            params["fromDate"] = from_date
        if to_date:
            params["toDate"] = to_date
        return await self._request("GET", "/invoices", params=params)

    async def match_invoice(self, invoice_number: str) -> UniMarketAPIResponse:
        """Match invoice against PO and receipts."""
        return await self._request("POST", f"/invoices/{invoice_number}/match")

    async def approve_invoice(
        self,
        invoice_number: str,
        approver_id: str,
        notes: Optional[str] = None,
    ) -> UniMarketAPIResponse:
        """Approve an invoice."""
        return await self._request(
            "POST",
            f"/invoices/{invoice_number}/approve",
            json_data={"approverId": approver_id, "notes": notes},
        )

    async def dispute_invoice(
        self,
        invoice_number: str,
        reason: str,
        line_numbers: Optional[List[int]] = None,
    ) -> UniMarketAPIResponse:
        """Dispute an invoice."""
        return await self._request(
            "POST",
            f"/invoices/{invoice_number}/dispute",
            json_data={"reason": reason, "lineNumbers": line_numbers},
        )

    # ============================================
    # PunchOut Operations
    # ============================================

    async def initiate_punchout(
        self,
        vendor_id: str,
        user_id: str,
        return_url: str,
        operation: str = "create",
        existing_cart_id: Optional[str] = None,
    ) -> UniMarketAPIResponse:
        """Initiate a PunchOut session."""
        return await self._request(
            "POST",
            "/punchout/sessions",
            json_data={
                "vendorId": vendor_id,
                "userId": user_id,
                "returnUrl": return_url,
                "operation": operation,
                "existingCartId": existing_cart_id,
            },
        )

    async def get_punchout_session(self, session_id: str) -> UniMarketAPIResponse:
        """Get PunchOut session details."""
        return await self._request("GET", f"/punchout/sessions/{session_id}")

    async def complete_punchout(
        self,
        session_id: str,
        cart_items: List[Dict[str, Any]],
        subtotal: float,
    ) -> UniMarketAPIResponse:
        """Complete a PunchOut session."""
        return await self._request(
            "POST",
            f"/punchout/sessions/{session_id}/complete",
            json_data={"items": cart_items, "subtotal": subtotal},
        )

    # ============================================
    # Vendor Operations
    # ============================================

    async def get_vendors(
        self,
        category: Optional[str] = None,
        diversity_status: Optional[List[str]] = None,
        certifications: Optional[List[str]] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> UniMarketAPIResponse:
        """List vendors with filters."""
        params = {"page": page, "pageSize": page_size}
        if category:
            params["category"] = category
        if diversity_status:
            params["diversityStatus"] = ",".join(diversity_status)
        if certifications:
            params["certifications"] = ",".join(certifications)
        return await self._request("GET", "/vendors", params=params)

    async def get_vendor(self, vendor_id: str) -> UniMarketAPIResponse:
        """Get vendor details."""
        return await self._request("GET", f"/vendors/{vendor_id}")

    async def get_vendor_performance(self, vendor_id: str) -> UniMarketAPIResponse:
        """Get vendor performance metrics."""
        return await self._request("GET", f"/vendors/{vendor_id}/performance")

    # ============================================
    # Inventory Operations
    # ============================================

    async def check_inventory(
        self,
        items: List[Dict[str, Any]],
    ) -> UniMarketAPIResponse:
        """Check inventory availability for items."""
        return await self._request("POST", "/inventory/check", json_data={"items": items})

    async def subscribe_inventory_updates(
        self,
        product_ids: List[str],
        webhook_url: str,
    ) -> UniMarketAPIResponse:
        """Subscribe to inventory updates for products."""
        return await self._request(
            "POST",
            "/inventory/subscribe",
            json_data={"productIds": product_ids, "webhookUrl": webhook_url},
        )

    # ============================================
    # Contract Operations
    # ============================================

    async def get_contracts(
        self,
        vendor_id: Optional[str] = None,
        status: Optional[str] = None,
        expiring_within_days: Optional[int] = None,
    ) -> UniMarketAPIResponse:
        """Get contracts with filters."""
        params = {}
        if vendor_id:
            params["vendorId"] = vendor_id
        if status:
            params["status"] = status
        if expiring_within_days:
            params["expiringWithinDays"] = expiring_within_days
        return await self._request("GET", "/contracts", params=params)

    async def get_contract_price(
        self,
        product_id: str,
        vendor_id: str,
        quantity: Optional[int] = None,
    ) -> UniMarketAPIResponse:
        """Get contract price for a product."""
        params = {}
        if quantity:
            params["quantity"] = quantity
        return await self._request(
            "GET",
            f"/contracts/price/{vendor_id}/{product_id}",
            params=params,
        )

    # ============================================
    # Reports & Analytics
    # ============================================

    async def get_spend_report(
        self,
        from_date: str,
        to_date: str,
        group_by: Optional[str] = None,
    ) -> UniMarketAPIResponse:
        """Get spend analytics report."""
        params = {"fromDate": from_date, "toDate": to_date}
        if group_by:
            params["groupBy"] = group_by
        return await self._request("GET", "/reports/spend", params=params)

    async def get_savings_report(
        self,
        from_date: str,
        to_date: str,
    ) -> UniMarketAPIResponse:
        """Get savings report."""
        params = {"fromDate": from_date, "toDate": to_date}
        return await self._request("GET", "/reports/savings", params=params)

    # ============================================
    # Webhook Verification
    # ============================================

    def verify_webhook_signature(self, payload: str, signature: str) -> bool:
        """Verify webhook signature."""
        if not self.config.webhook_secret:
            return False

        expected_signature = hmac.new(
            self.config.webhook_secret.encode(),
            payload.encode(),
            hashlib.sha256,
        ).hexdigest()

        return hmac.compare_digest(signature, f"sha256={expected_signature}")

    def parse_webhook_event(self, payload: str) -> Optional[Dict[str, Any]]:
        """Parse webhook event payload."""
        try:
            return json.loads(payload)
        except json.JSONDecodeError:
            return None

    # ============================================
    # Cleanup
    # ============================================

    async def close(self):
        """Close the HTTP client."""
        await self._client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()


# Singleton instance
_client: Optional[UniMarketClient] = None


def get_unimarket_client() -> UniMarketClient:
    """Get or create the global UniMarket client."""
    global _client
    if _client is None:
        _client = UniMarketClient()
    return _client
