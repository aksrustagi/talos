"""
Talos AI — Ivalua Connector

Ivalua connector for highly configurable source-to-pay procurement
platforms.  Covers requests, orders, invoices, suppliers, contracts,
catalog, and sourcing via REST and SOAP APIs.
"""

from __future__ import annotations

from typing import Optional

import httpx

from connectors.base import ProcurementConnector, ConnectorConfig


class IvaluaConnector(ProcurementConnector):
    """
    Ivalua connector.

    Ivalua is a highly configurable source-to-pay (S2P) platform favoured
    by large enterprises that need deep customisation of procurement
    workflows.  It exposes REST endpoints under ``/api/v2/`` and legacy
    SOAP services for older integrations.

    Authentication supports both API Key and OAuth 2.0 (client-credentials).
    """

    ENDPOINTS: dict[str, str] = {
        "requests":   "/api/v2/requests",
        "orders":     "/api/v2/orders",
        "invoices":   "/api/v2/invoices",
        "suppliers":  "/api/v2/suppliers",
        "contracts":  "/api/v2/contracts",
        "catalog":    "/api/v2/catalog",
        "sourcing":   "/api/v2/sourcing",
    }

    def __init__(self, config: ConnectorConfig):
        super().__init__(config)
        self._access_token: Optional[str] = None

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------
    async def authenticate(self) -> str:
        """Authenticate via API Key or OAuth 2.0 against Ivalua.

        When ``config.api_key`` is set, uses header-based API-key auth.
        Otherwise performs an OAuth 2.0 client-credentials grant.

        Returns the access token or API key string.
        """
        raise NotImplementedError(
            "IvaluaConnector.authenticate: API Key / OAuth 2.0 "
            "authentication not yet implemented."
        )

    # ------------------------------------------------------------------
    # Requisitions
    # ------------------------------------------------------------------
    async def get_requisitions(self, filters: dict) -> list:
        """Retrieve purchase requests from Ivalua.

        Filters may include: status, requester, date_from, date_to.
        """
        raise NotImplementedError(
            "IvaluaConnector.get_requisitions: "
            "GET /api/v2/requests not yet implemented."
        )

    async def create_requisition(self, req: dict) -> str:
        """Create a purchase request in Ivalua.

        Returns the new request ID.
        """
        raise NotImplementedError(
            "IvaluaConnector.create_requisition: "
            "POST /api/v2/requests not yet implemented."
        )

    # ------------------------------------------------------------------
    # Purchase Orders
    # ------------------------------------------------------------------
    async def get_purchase_orders(self, filters: dict) -> list:
        """Retrieve purchase orders from Ivalua."""
        raise NotImplementedError(
            "IvaluaConnector.get_purchase_orders: "
            "GET /api/v2/orders not yet implemented."
        )

    async def create_purchase_order(self, po: dict) -> str:
        """Create a purchase order in Ivalua.

        Returns the new order ID.
        """
        raise NotImplementedError(
            "IvaluaConnector.create_purchase_order: "
            "POST /api/v2/orders not yet implemented."
        )

    # ------------------------------------------------------------------
    # Invoices
    # ------------------------------------------------------------------
    async def get_invoices(self, filters: dict) -> list:
        """Retrieve invoices from Ivalua."""
        raise NotImplementedError(
            "IvaluaConnector.get_invoices: "
            "GET /api/v2/invoices not yet implemented."
        )

    # ------------------------------------------------------------------
    # Vendors / Suppliers
    # ------------------------------------------------------------------
    async def get_vendors(self, filters: dict) -> list:
        """Retrieve suppliers from Ivalua."""
        raise NotImplementedError(
            "IvaluaConnector.get_vendors: "
            "GET /api/v2/suppliers not yet implemented."
        )

    # ------------------------------------------------------------------
    # Contracts
    # ------------------------------------------------------------------
    async def get_contracts(self, filters: dict) -> list:
        """Retrieve contracts from Ivalua."""
        raise NotImplementedError(
            "IvaluaConnector.get_contracts: "
            "GET /api/v2/contracts not yet implemented."
        )

    # ------------------------------------------------------------------
    # Catalogs
    # ------------------------------------------------------------------
    async def get_catalog_items(self, search: str) -> list:
        """Search catalog items in Ivalua."""
        raise NotImplementedError(
            "IvaluaConnector.get_catalog_items: "
            "GET /api/v2/catalog not yet implemented."
        )

    # ------------------------------------------------------------------
    # Ivalua-specific: Sourcing
    # ------------------------------------------------------------------
    async def get_sourcing_events(self, filters: dict) -> list:
        """Retrieve sourcing events from Ivalua.

        Args:
            filters: May include status, event_type, created_date.

        Returns:
            List of sourcing event dicts.
        """
        raise NotImplementedError(
            "IvaluaConnector.get_sourcing_events: "
            "GET /api/v2/sourcing not yet implemented."
        )
