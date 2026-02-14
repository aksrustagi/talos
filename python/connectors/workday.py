"""
Talos AI — Workday Connector

Workday Procurement connector for HR-first organizations that use Workday
as their ERP backbone.  Covers purchase orders, suppliers, receipts,
invoices, and contracts via Workday's REST and SOAP APIs.
"""

from __future__ import annotations

from typing import Optional

import httpx

from connectors.base import ProcurementConnector, ConnectorConfig


class WorkdayConnector(ProcurementConnector):
    """
    Workday connector.

    Workday is the ERP of choice for HR-first organisations that extend
    its platform into procurement and financials.  It exposes REST APIs
    under ``/api/procurement/v1/`` and ``/api/financialManagement/v1/``
    as well as legacy SOAP services.

    Authentication is via OAuth 2.0 (client-credentials or authorization-
    code with refresh tokens).
    """

    ENDPOINTS: dict[str, str] = {
        "purchaseOrders": "/api/procurement/v1/purchaseOrders",
        "suppliers":      "/api/procurement/v1/suppliers",
        "receipts":       "/api/procurement/v1/receipts",
        "invoices":       "/api/financialManagement/v1/supplierInvoices",
        "contracts":      "/api/procurement/v1/contracts",
    }

    def __init__(self, config: ConnectorConfig):
        super().__init__(config)
        self._access_token: Optional[str] = None

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------
    async def authenticate(self) -> str:
        """Authenticate via OAuth 2.0 against Workday token endpoint.

        Returns the bearer access token.
        """
        raise NotImplementedError(
            "WorkdayConnector.authenticate: OAuth 2.0 flow against "
            "Workday token endpoint not yet implemented."
        )

    # ------------------------------------------------------------------
    # Requisitions
    # ------------------------------------------------------------------
    async def get_requisitions(self, filters: dict) -> list:
        """Retrieve requisitions from Workday.

        Filters may include: status, requester, date_from, date_to.
        """
        raise NotImplementedError(
            "WorkdayConnector.get_requisitions: "
            "Workday requisition retrieval not yet implemented."
        )

    async def create_requisition(self, req: dict) -> str:
        """Create a requisition in Workday.

        Returns the new requisition ID.
        """
        raise NotImplementedError(
            "WorkdayConnector.create_requisition: "
            "Workday requisition creation not yet implemented."
        )

    # ------------------------------------------------------------------
    # Purchase Orders
    # ------------------------------------------------------------------
    async def get_purchase_orders(self, filters: dict) -> list:
        """Retrieve purchase orders from Workday."""
        raise NotImplementedError(
            "WorkdayConnector.get_purchase_orders: "
            "GET /api/procurement/v1/purchaseOrders not yet implemented."
        )

    async def create_purchase_order(self, po: dict) -> str:
        """Create a purchase order in Workday.

        Returns the new PO ID.
        """
        raise NotImplementedError(
            "WorkdayConnector.create_purchase_order: "
            "POST /api/procurement/v1/purchaseOrders not yet implemented."
        )

    # ------------------------------------------------------------------
    # Invoices
    # ------------------------------------------------------------------
    async def get_invoices(self, filters: dict) -> list:
        """Retrieve supplier invoices from Workday."""
        raise NotImplementedError(
            "WorkdayConnector.get_invoices: "
            "GET /api/financialManagement/v1/supplierInvoices not yet implemented."
        )

    # ------------------------------------------------------------------
    # Vendors / Suppliers
    # ------------------------------------------------------------------
    async def get_vendors(self, filters: dict) -> list:
        """Retrieve suppliers from Workday."""
        raise NotImplementedError(
            "WorkdayConnector.get_vendors: "
            "GET /api/procurement/v1/suppliers not yet implemented."
        )

    # ------------------------------------------------------------------
    # Contracts
    # ------------------------------------------------------------------
    async def get_contracts(self, filters: dict) -> list:
        """Retrieve contracts from Workday."""
        raise NotImplementedError(
            "WorkdayConnector.get_contracts: "
            "GET /api/procurement/v1/contracts not yet implemented."
        )

    # ------------------------------------------------------------------
    # Catalogs
    # ------------------------------------------------------------------
    async def get_catalog_items(self, search: str) -> list:
        """Search catalog items in Workday."""
        raise NotImplementedError(
            "WorkdayConnector.get_catalog_items: "
            "Workday catalog search not yet implemented."
        )

    # ------------------------------------------------------------------
    # Workday-specific: Receipts
    # ------------------------------------------------------------------
    async def get_receipts(self, filters: dict) -> list:
        """Retrieve goods receipts from Workday.

        Args:
            filters: May include purchase_order_id, receipt_date, status.

        Returns:
            List of receipt dicts.
        """
        raise NotImplementedError(
            "WorkdayConnector.get_receipts: "
            "GET /api/procurement/v1/receipts not yet implemented."
        )
