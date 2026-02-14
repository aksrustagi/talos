"""
SAP Ariba Procurement Connector

Platform:   SAP Ariba (Ariba Network + Ariba Buying / Sourcing)
Segment:    Largest global procurement network — Fortune 500 enterprises
API type:   REST (Procurement API) + SOAP (Legacy) + IDoc (SAP ERP integration)
Auth:       OAuth 2.0 (application key + shared secret)
Docs:       https://developer.ariba.com

Key capabilities:
  - Ariba Network discovery and supplier collaboration
  - Requisitions, purchase orders, and invoices
  - Strategic sourcing events (RFx)
  - Spend visibility and analytics
  - Contract lifecycle management
"""

from __future__ import annotations

from typing import Optional

from .base import ConnectorConfig, ProcurementConnector


class SAPAribaConnector(ProcurementConnector):
    """SAP Ariba connector — enterprise procurement network.

    SAP Ariba is the world's largest B2B procurement network.  Its REST
    APIs cover buying, sourcing, spend management, and supplier
    collaboration.  Legacy SOAP and IDoc interfaces are available for
    SAP ERP back-end integration.

    Authentication uses OAuth 2.0 with an application key and shared
    secret issued via the SAP Ariba Developer Portal.
    """

    ENDPOINTS: dict[str, str] = {
        "requisitions":     "/api/procurement/v2/requisitions",
        "orders":           "/api/procurement/v2/orders",
        "invoices":         "/api/procurement/v2/invoices",
        "suppliers":        "/api/supplier/v2/suppliers",
        "contracts":        "/api/contract/v1/contracts",
        "items":            "/api/catalog/v1/items",
        "sourcing_events":  "/api/sourcing/v2/events",
        "spend":            "/api/spend/v1/spend",
        "network":          "/api/network/v1/discovery",
    }

    def __init__(self, config: ConnectorConfig):
        super().__init__(config)
        self._access_token: Optional[str] = None

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------
    async def authenticate(self) -> str:
        """Authenticate via OAuth 2.0 using Ariba application key + shared secret.

        Returns the bearer access token.
        """
        raise NotImplementedError(
            "SAPAribaConnector.authenticate: OAuth 2.0 flow against "
            "SAP Ariba token endpoint not yet implemented."
        )

    # ------------------------------------------------------------------
    # Requisitions
    # ------------------------------------------------------------------
    async def get_requisitions(self, filters: dict) -> list:
        """Retrieve requisitions from SAP Ariba.

        Filters may include: realm, status, created_date_from, created_date_to.
        """
        raise NotImplementedError(
            "SAPAribaConnector.get_requisitions: "
            "GET /api/procurement/v2/requisitions not yet implemented."
        )

    async def create_requisition(self, req: dict) -> str:
        """Create a purchase requisition in SAP Ariba.

        Returns the new requisition unique name.
        """
        raise NotImplementedError(
            "SAPAribaConnector.create_requisition: "
            "POST /api/procurement/v2/requisitions not yet implemented."
        )

    # ------------------------------------------------------------------
    # Purchase Orders
    # ------------------------------------------------------------------
    async def get_purchase_orders(self, filters: dict) -> list:
        """Retrieve purchase orders from SAP Ariba."""
        raise NotImplementedError(
            "SAPAribaConnector.get_purchase_orders: "
            "GET /api/procurement/v2/orders not yet implemented."
        )

    async def create_purchase_order(self, po: dict) -> str:
        """Create a purchase order in SAP Ariba.

        Returns the new order ID.
        """
        raise NotImplementedError(
            "SAPAribaConnector.create_purchase_order: "
            "POST /api/procurement/v2/orders not yet implemented."
        )

    # ------------------------------------------------------------------
    # Invoices
    # ------------------------------------------------------------------
    async def get_invoices(self, filters: dict) -> list:
        """Retrieve invoices from SAP Ariba."""
        raise NotImplementedError(
            "SAPAribaConnector.get_invoices: "
            "GET /api/procurement/v2/invoices not yet implemented."
        )

    # ------------------------------------------------------------------
    # Vendors / Suppliers
    # ------------------------------------------------------------------
    async def get_vendors(self, filters: dict) -> list:
        """Retrieve suppliers from SAP Ariba."""
        raise NotImplementedError(
            "SAPAribaConnector.get_vendors: "
            "GET /api/supplier/v2/suppliers not yet implemented."
        )

    # ------------------------------------------------------------------
    # Contracts
    # ------------------------------------------------------------------
    async def get_contracts(self, filters: dict) -> list:
        """Retrieve contracts from SAP Ariba."""
        raise NotImplementedError(
            "SAPAribaConnector.get_contracts: "
            "GET /api/contract/v1/contracts not yet implemented."
        )

    # ------------------------------------------------------------------
    # Catalogs
    # ------------------------------------------------------------------
    async def get_catalog_items(self, search: str) -> list:
        """Search catalog items in SAP Ariba."""
        raise NotImplementedError(
            "SAPAribaConnector.get_catalog_items: "
            "GET /api/catalog/v1/items not yet implemented."
        )

    # ------------------------------------------------------------------
    # SAP Ariba-specific: Network Discovery
    # ------------------------------------------------------------------
    async def discover_suppliers(self, query: str, region: Optional[str] = None) -> list:
        """Search the Ariba Network for suppliers.

        Leverages the Ariba Discovery API to find qualified suppliers
        by commodity, region, or diversity classification.

        Args:
            query: Free-text or commodity-code search string.
            region: Optional ISO-3166 country/region code filter.

        Returns:
            List of supplier profile dicts from the Ariba Network.
        """
        raise NotImplementedError(
            "SAPAribaConnector.discover_suppliers: "
            "GET /api/network/v1/discovery not yet implemented."
        )

    async def submit_sourcing_event(self, event: dict) -> str:
        """Create a sourcing event (RFx) in SAP Ariba Sourcing.

        Args:
            event: Sourcing event payload (type, items, invited suppliers, etc.).

        Returns:
            The sourcing event ID.
        """
        raise NotImplementedError(
            "SAPAribaConnector.submit_sourcing_event: "
            "POST /api/sourcing/v2/events not yet implemented."
        )
