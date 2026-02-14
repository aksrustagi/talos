"""
Coupa Procurement Connector

Platform:   Coupa BSM (Business Spend Management)
Segment:    Mid-market leader — best-in-class REST API
API type:   REST (JSON)
Auth:       OAuth 2.0 (OIDC client-credentials) + legacy API key
Docs:       https://compass.coupa.com/en-us/products/core-platform/integration-playbooks-and-resources/api-reference

Key capabilities:
  - Procure-to-pay: requisitions, POs, invoices
  - Supplier management and risk scoring
  - Contract lifecycle management
  - Budget tracking and expense reports
  - Inventory transactions
  - Community.ai supplier benchmarking
"""

from __future__ import annotations

from typing import Optional

from .base import ConnectorConfig, ProcurementConnector


class CoupaConnector(ProcurementConnector):
    """Coupa BSM connector — mid-market procurement leader.

    Coupa provides a comprehensive Business Spend Management platform
    with one of the most developer-friendly REST APIs in the procurement
    space.  All resources are accessible as RESTful JSON endpoints with
    consistent pagination, filtering, and field-selection semantics.

    Authentication supports both OAuth 2.0 (OIDC client-credentials)
    and legacy API-key header auth.
    """

    ENDPOINTS: dict[str, str] = {
        "requisitions":           "/api/requisitions",
        "purchase_orders":        "/api/purchase_orders",
        "invoices":               "/api/invoices",
        "suppliers":              "/api/suppliers",
        "contracts":              "/api/contracts",
        "catalog_items":          "/api/catalog_items",
        "budgets":                "/api/budgets",
        "approvals":              "/api/approvals",
        "expense_reports":        "/api/expense_reports",
        "inventory_transactions": "/api/inventory_transactions",
    }

    def __init__(self, config: ConnectorConfig):
        super().__init__(config)
        self._access_token: Optional[str] = None

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------
    async def authenticate(self) -> str:
        """Authenticate via OAuth 2.0 OIDC client-credentials or API key.

        When ``config.api_key`` is set, uses header-based API-key auth.
        Otherwise performs an OAuth 2.0 client-credentials grant.

        Returns the access token or API key string.
        """
        raise NotImplementedError(
            "CoupaConnector.authenticate: OAuth 2.0 / API-key "
            "authentication not yet implemented."
        )

    # ------------------------------------------------------------------
    # Requisitions
    # ------------------------------------------------------------------
    async def get_requisitions(self, filters: dict) -> list:
        """Retrieve requisitions from Coupa.

        Filters may include: status, created_at[gt], requester_id, department.
        """
        raise NotImplementedError(
            "CoupaConnector.get_requisitions: "
            "GET /api/requisitions not yet implemented."
        )

    async def create_requisition(self, req: dict) -> str:
        """Create a requisition in Coupa.

        Returns the new requisition ID.
        """
        raise NotImplementedError(
            "CoupaConnector.create_requisition: "
            "POST /api/requisitions not yet implemented."
        )

    # ------------------------------------------------------------------
    # Purchase Orders
    # ------------------------------------------------------------------
    async def get_purchase_orders(self, filters: dict) -> list:
        """Retrieve purchase orders from Coupa."""
        raise NotImplementedError(
            "CoupaConnector.get_purchase_orders: "
            "GET /api/purchase_orders not yet implemented."
        )

    async def create_purchase_order(self, po: dict) -> str:
        """Create a purchase order in Coupa.

        Returns the new PO ID.
        """
        raise NotImplementedError(
            "CoupaConnector.create_purchase_order: "
            "POST /api/purchase_orders not yet implemented."
        )

    # ------------------------------------------------------------------
    # Invoices
    # ------------------------------------------------------------------
    async def get_invoices(self, filters: dict) -> list:
        """Retrieve invoices from Coupa."""
        raise NotImplementedError(
            "CoupaConnector.get_invoices: "
            "GET /api/invoices not yet implemented."
        )

    # ------------------------------------------------------------------
    # Vendors / Suppliers
    # ------------------------------------------------------------------
    async def get_vendors(self, filters: dict) -> list:
        """Retrieve suppliers from Coupa."""
        raise NotImplementedError(
            "CoupaConnector.get_vendors: "
            "GET /api/suppliers not yet implemented."
        )

    # ------------------------------------------------------------------
    # Contracts
    # ------------------------------------------------------------------
    async def get_contracts(self, filters: dict) -> list:
        """Retrieve contracts from Coupa."""
        raise NotImplementedError(
            "CoupaConnector.get_contracts: "
            "GET /api/contracts not yet implemented."
        )

    # ------------------------------------------------------------------
    # Catalogs
    # ------------------------------------------------------------------
    async def get_catalog_items(self, search: str) -> list:
        """Search catalog items in Coupa."""
        raise NotImplementedError(
            "CoupaConnector.get_catalog_items: "
            "GET /api/catalog_items not yet implemented."
        )

    # ------------------------------------------------------------------
    # Coupa-specific: Budgets
    # ------------------------------------------------------------------
    async def get_budgets(self, filters: dict) -> list:
        """Retrieve budget lines from Coupa.

        Args:
            filters: May include fiscal_year, account_code, department.

        Returns:
            List of budget line dicts.
        """
        raise NotImplementedError(
            "CoupaConnector.get_budgets: "
            "GET /api/budgets not yet implemented."
        )

    # ------------------------------------------------------------------
    # Coupa-specific: Expense Reports
    # ------------------------------------------------------------------
    async def get_expense_reports(self, filters: dict) -> list:
        """Retrieve expense reports from Coupa.

        Args:
            filters: May include status, submitted_at, employee_id.

        Returns:
            List of expense report dicts.
        """
        raise NotImplementedError(
            "CoupaConnector.get_expense_reports: "
            "GET /api/expense_reports not yet implemented."
        )

    # ------------------------------------------------------------------
    # Coupa-specific: Inventory Transactions
    # ------------------------------------------------------------------
    async def get_inventory_transactions(self, filters: dict) -> list:
        """Retrieve inventory transactions from Coupa.

        Args:
            filters: May include warehouse_id, item_id, transaction_type.

        Returns:
            List of inventory transaction dicts.
        """
        raise NotImplementedError(
            "CoupaConnector.get_inventory_transactions: "
            "GET /api/inventory_transactions not yet implemented."
        )
