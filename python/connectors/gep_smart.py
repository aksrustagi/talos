"""
Talos AI — GEP SMART Connector

GEP SMART connector for AI-powered unified procurement platforms.
Covers requisitions, purchase orders, invoices, suppliers, contracts,
sourcing events, spend analysis, and savings tracking.
"""

from __future__ import annotations

from typing import Optional

import httpx

from connectors.base import ProcurementConnector, ConnectorConfig


class GEPSmartConnector(ProcurementConnector):
    """
    GEP SMART connector.

    GEP SMART is an AI-powered, unified source-to-pay procurement platform
    used by mid-market and enterprise organisations.  All endpoints live
    under ``/api/v1/`` and follow a consistent RESTful design.

    Authentication is via OAuth 2.0 (client-credentials grant).
    """

    ENDPOINTS: dict[str, str] = {
        "requisitions":    "/api/v1/requisitions",
        "purchaseOrders":  "/api/v1/purchaseOrders",
        "invoices":        "/api/v1/invoices",
        "suppliers":       "/api/v1/suppliers",
        "contracts":       "/api/v1/contracts",
        "sourcingEvents":  "/api/v1/sourcingEvents",
        "spendAnalysis":   "/api/v1/spendAnalysis",
        "savingsTracker":  "/api/v1/savingsTracker",
    }

    def __init__(self, config: ConnectorConfig):
        super().__init__(config)
        self._access_token: Optional[str] = None

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------
    async def authenticate(self) -> str:
        """Authenticate via OAuth 2.0 against GEP SMART token endpoint.

        Returns the bearer access token.
        """
        raise NotImplementedError(
            "GEPSmartConnector.authenticate: OAuth 2.0 flow against "
            "GEP SMART token endpoint not yet implemented."
        )

    # ------------------------------------------------------------------
    # Requisitions
    # ------------------------------------------------------------------
    async def get_requisitions(self, filters: dict) -> list:
        """Retrieve requisitions from GEP SMART.

        Filters may include: status, requester, date_from, date_to.
        """
        raise NotImplementedError(
            "GEPSmartConnector.get_requisitions: "
            "GET /api/v1/requisitions not yet implemented."
        )

    async def create_requisition(self, req: dict) -> str:
        """Create a requisition in GEP SMART.

        Returns the new requisition ID.
        """
        raise NotImplementedError(
            "GEPSmartConnector.create_requisition: "
            "POST /api/v1/requisitions not yet implemented."
        )

    # ------------------------------------------------------------------
    # Purchase Orders
    # ------------------------------------------------------------------
    async def get_purchase_orders(self, filters: dict) -> list:
        """Retrieve purchase orders from GEP SMART."""
        raise NotImplementedError(
            "GEPSmartConnector.get_purchase_orders: "
            "GET /api/v1/purchaseOrders not yet implemented."
        )

    async def create_purchase_order(self, po: dict) -> str:
        """Create a purchase order in GEP SMART.

        Returns the new PO ID.
        """
        raise NotImplementedError(
            "GEPSmartConnector.create_purchase_order: "
            "POST /api/v1/purchaseOrders not yet implemented."
        )

    # ------------------------------------------------------------------
    # Invoices
    # ------------------------------------------------------------------
    async def get_invoices(self, filters: dict) -> list:
        """Retrieve invoices from GEP SMART."""
        raise NotImplementedError(
            "GEPSmartConnector.get_invoices: "
            "GET /api/v1/invoices not yet implemented."
        )

    # ------------------------------------------------------------------
    # Vendors / Suppliers
    # ------------------------------------------------------------------
    async def get_vendors(self, filters: dict) -> list:
        """Retrieve suppliers from GEP SMART."""
        raise NotImplementedError(
            "GEPSmartConnector.get_vendors: "
            "GET /api/v1/suppliers not yet implemented."
        )

    # ------------------------------------------------------------------
    # Contracts
    # ------------------------------------------------------------------
    async def get_contracts(self, filters: dict) -> list:
        """Retrieve contracts from GEP SMART."""
        raise NotImplementedError(
            "GEPSmartConnector.get_contracts: "
            "GET /api/v1/contracts not yet implemented."
        )

    # ------------------------------------------------------------------
    # Catalogs
    # ------------------------------------------------------------------
    async def get_catalog_items(self, search: str) -> list:
        """Search catalog items in GEP SMART."""
        raise NotImplementedError(
            "GEPSmartConnector.get_catalog_items: "
            "GEP SMART catalog search not yet implemented."
        )

    # ------------------------------------------------------------------
    # GEP SMART-specific: Sourcing Events
    # ------------------------------------------------------------------
    async def get_sourcing_events(self, filters: dict) -> list:
        """Retrieve sourcing events from GEP SMART.

        Args:
            filters: May include status, event_type, created_date.

        Returns:
            List of sourcing event dicts.
        """
        raise NotImplementedError(
            "GEPSmartConnector.get_sourcing_events: "
            "GET /api/v1/sourcingEvents not yet implemented."
        )

    # ------------------------------------------------------------------
    # GEP SMART-specific: Spend Analysis
    # ------------------------------------------------------------------
    async def get_spend_analysis(self, filters: dict) -> list:
        """Retrieve spend analysis data from GEP SMART.

        Args:
            filters: May include category, period, business_unit.

        Returns:
            List of spend analysis record dicts.
        """
        raise NotImplementedError(
            "GEPSmartConnector.get_spend_analysis: "
            "GET /api/v1/spendAnalysis not yet implemented."
        )

    # ------------------------------------------------------------------
    # GEP SMART-specific: Savings Tracker
    # ------------------------------------------------------------------
    async def get_savings_tracker(self, filters: dict) -> list:
        """Retrieve savings tracker data from GEP SMART.

        Args:
            filters: May include project_id, category, period.

        Returns:
            List of savings tracker record dicts.
        """
        raise NotImplementedError(
            "GEPSmartConnector.get_savings_tracker: "
            "GET /api/v1/savingsTracker not yet implemented."
        )
