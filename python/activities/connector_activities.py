"""
Talos AI — Connector Activities

Temporal activities that wrap procurement platform connector operations.
These bridge Temporal workflows to external ERP/procurement systems.
"""

import logging
import os
from typing import Optional

from temporalio import activity

logger = logging.getLogger(__name__)


def _get_connector():
    """Get the configured procurement connector."""
    from connectors.registry import get_connector
    from connectors.base import ConnectorConfig

    platform = os.getenv("PROCUREMENT_PLATFORM", "jaggaer")
    config = ConnectorConfig(
        base_url=os.getenv("PROCUREMENT_BASE_URL", ""),
        api_key=os.getenv("PROCUREMENT_API_KEY"),
        client_id=os.getenv("PROCUREMENT_CLIENT_ID"),
        client_secret=os.getenv("PROCUREMENT_CLIENT_SECRET"),
        tenant_id=os.getenv("PROCUREMENT_TENANT_ID"),
        environment=os.getenv("PROCUREMENT_ENV", "production"),
    )
    return get_connector(platform, config)


@activity.defn(name="create_requisition_in_erp")
async def create_requisition_in_erp(req_data: dict) -> str:
    """Create a requisition in the procurement system."""
    connector = _get_connector()
    try:
        req_id = await connector.create_requisition(req_data)
        logger.info(f"Created requisition in ERP: {req_id}")
        return req_id
    finally:
        await connector.close()


@activity.defn(name="create_po_in_erp")
async def create_po_in_erp(po_data: dict) -> str:
    """Create a purchase order in the procurement system."""
    connector = _get_connector()
    try:
        po_id = await connector.create_purchase_order(po_data)
        logger.info(f"Created PO in ERP: {po_id}")
        return po_id
    finally:
        await connector.close()


@activity.defn(name="get_invoices_from_erp")
async def get_invoices_from_erp(filters: dict) -> list:
    """Fetch invoices from the procurement system."""
    connector = _get_connector()
    try:
        invoices = await connector.get_invoices(filters)
        logger.info(f"Fetched {len(invoices)} invoices from ERP")
        return invoices
    finally:
        await connector.close()


@activity.defn(name="get_vendors_from_erp")
async def get_vendors_from_erp(filters: dict) -> list:
    """Fetch vendors from the procurement system."""
    connector = _get_connector()
    try:
        vendors = await connector.get_vendors(filters)
        logger.info(f"Fetched {len(vendors)} vendors from ERP")
        return vendors
    finally:
        await connector.close()


@activity.defn(name="get_contracts_from_erp")
async def get_contracts_from_erp(filters: dict) -> list:
    """Fetch contracts from the procurement system."""
    connector = _get_connector()
    try:
        contracts = await connector.get_contracts(filters)
        logger.info(f"Fetched {len(contracts)} contracts from ERP")
        return contracts
    finally:
        await connector.close()


@activity.defn(name="search_catalog")
async def search_catalog(search_query: str) -> list:
    """Search vendor catalog items."""
    connector = _get_connector()
    try:
        items = await connector.get_catalog_items(search_query)
        logger.info(f"Found {len(items)} catalog items for: {search_query}")
        return items
    finally:
        await connector.close()
