"""
Procurement Platform Connectors — Base Classes

Top 10+ Procurement Platform Connectors for Talos.
Each connector reads/writes: Requisitions, POs, Invoices, Contracts, Vendors, Catalogs.
"""

from abc import ABC, abstractmethod
from typing import Optional

import httpx
from pydantic import BaseModel


class ConnectorConfig(BaseModel):
    """Base configuration for all connectors."""
    base_url: str
    api_key: Optional[str] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    tenant_id: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    environment: str = "production"  # production, sandbox


class ProcurementConnector(ABC):
    """Base class for all procurement system connectors."""

    def __init__(self, config: ConnectorConfig):
        self.config = config
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.config.base_url,
                timeout=60,
            )
        return self._client

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None

    @abstractmethod
    async def authenticate(self) -> str:
        """Authenticate and return access token."""
        ...

    @abstractmethod
    async def get_requisitions(self, filters: dict) -> list:
        ...

    @abstractmethod
    async def create_requisition(self, req: dict) -> str:
        ...

    @abstractmethod
    async def get_purchase_orders(self, filters: dict) -> list:
        ...

    @abstractmethod
    async def create_purchase_order(self, po: dict) -> str:
        ...

    @abstractmethod
    async def get_invoices(self, filters: dict) -> list:
        ...

    @abstractmethod
    async def get_vendors(self, filters: dict) -> list:
        ...

    @abstractmethod
    async def get_contracts(self, filters: dict) -> list:
        ...

    @abstractmethod
    async def get_catalog_items(self, search: str) -> list:
        ...
