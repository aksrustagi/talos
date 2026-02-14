"""Tests for Temporal procurement activities backed by ProcurementStore.

These tests validate the activity functions work correctly against a real
SQLite database without needing a running Temporal server.

Note: test_workflow.py may mock sys.modules for activities packages.
We explicitly reload the real modules here to avoid contamination.
"""

import importlib
import sys
import pytest
import pytest_asyncio
from unittest.mock import patch

from procurement.store import ProcurementStore


def _ensure_real_activities():
    """Remove any mock entries from sys.modules and import the real modules."""
    for key in ["activities", "activities.agent_activities", "activities.procurement_activities"]:
        mod = sys.modules.get(key)
        if mod is not None and not hasattr(mod, "__file__"):
            # It's a mock — remove it so we can import the real module
            del sys.modules[key]
    # Now import the real module
    import activities.procurement_activities
    importlib.reload(activities.procurement_activities)
    return activities.procurement_activities


# Get the real module (not mock)
_pa = _ensure_real_activities()


@pytest_asyncio.fixture
async def store(tmp_path):
    """Provide a temporary ProcurementStore and patch the singleton."""
    db_path = str(tmp_path / "test_activities.db")
    s = ProcurementStore(db_path)
    # Patch the module-level singleton so activities use our test store
    with patch("procurement.store._store", s):
        with patch("procurement.store._DB_PATH", db_path):
            yield s


# ============================================
# Budget activities
# ============================================


class TestBudgetActivities:
    @pytest.mark.asyncio
    async def test_validate_budget(self, store):
        result = await _pa.validate_budget("BIO-2024", 1000.0)
        assert result["available"] is True
        assert result["budget_code"] == "BIO-2024"

    @pytest.mark.asyncio
    async def test_validate_budget_insufficient(self, store):
        result = await _pa.validate_budget("BIO-2024", 999_999.0)
        assert result["available"] is False


# ============================================
# Approver activities
# ============================================


class TestApproverActivities:
    @pytest.mark.asyncio
    async def test_determine_approvers(self, store):
        approvers = await _pa.determine_approvers({"total": 10_000})
        assert len(approvers) == 2  # manager + director
        assert approvers[0]["role"] == "manager"
        assert approvers[1]["role"] == "director"

    @pytest.mark.asyncio
    async def test_send_approval_notification(self, store):
        # First create a requisition for the foreign key
        result = await store.create_requisition({
            "items": [{"description": "Test", "quantity": 1, "unit_price": 100}],
            "budget_code": "BIO-2024",
            "user_id": "user_001",
            "department": "Biology",
        })
        result_sent = await _pa.send_approval_notification({
            "requisition_id": result["requisition_id"],
            "approver_id": "manager_001",
            "level": 1,
            "deadline": "2024-12-31T00:00:00Z",
        })
        assert result_sent is True


# ============================================
# Purchase order activities
# ============================================


class TestPurchaseOrderActivities:
    @pytest.mark.asyncio
    async def test_generate_purchase_order(self, store):
        # Create requisition
        result = await store.create_requisition({
            "items": [{"description": "Gloves", "quantity": 5, "unit_price": 12.99}],
            "budget_code": "BIO-2024",
            "user_id": "user_001",
            "department": "Biology",
        })
        po = await _pa.generate_purchase_order(result["requisition_id"])
        assert po.startswith("PO-")

    @pytest.mark.asyncio
    async def test_send_po_to_vendor(self, store):
        # Create a PO first
        result = await store.create_requisition({
            "items": [{"description": "Item", "quantity": 1, "unit_price": 50}],
            "budget_code": "BIO-2024",
            "user_id": "user_001",
            "department": "Biology",
        })
        po = await store.generate_purchase_order(result["requisition_id"])
        sent = await _pa.send_po_to_vendor(po, "fisher-sci")
        assert sent is True


# ============================================
# Invoice activities
# ============================================


class TestInvoiceActivities:
    @pytest.mark.asyncio
    async def test_parse_invoice(self, store):
        result = await _pa.parse_invoice("INV-TEST-001")
        assert result["invoice_id"] == "INV-TEST-001"

    @pytest.mark.asyncio
    async def test_find_matching_po(self, store):
        result = await _pa.find_matching_po({"invoice_id": "test", "po_number": None})
        assert result["found"] is False


# ============================================
# Catalog activities
# ============================================


class TestCatalogActivities:
    @pytest.mark.asyncio
    async def test_fetch_vendor_catalog(self, store):
        result = await _pa.fetch_vendor_catalog("fisher-sci")
        assert result["vendor_id"] == "fisher-sci"
        assert len(result["products"]) > 0

    @pytest.mark.asyncio
    async def test_normalize_catalog(self, store):
        result = await _pa.normalize_catalog({
            "products": [
                {"id": "1", "product_name": "Widget", "unit_price": 10.0},
            ],
        })
        assert result["normalized_count"] == 1
        assert result["errors"] == []

    @pytest.mark.asyncio
    async def test_detect_price_changes(self, store):
        catalog = await store.fetch_vendor_catalog("fisher-sci")
        result = await _pa.detect_price_changes("fisher-sci", catalog)
        # No changes when comparing against identical catalog
        assert result["significant_changes"] is False

    @pytest.mark.asyncio
    async def test_notify_price_changes(self, store):
        result = await _pa.notify_price_changes({"significant_changes": True, "changes": [{}]})
        assert result is True


# ============================================
# Contract activities
# ============================================


class TestContractActivities:
    @pytest.mark.asyncio
    async def test_analyze_contract_performance(self, store):
        result = await _pa.analyze_contract_performance("CON-FISHER-2024")
        assert result["contract_id"] == "CON-FISHER-2024"
        assert "vendor_name" in result

    @pytest.mark.asyncio
    async def test_generate_renewal_recommendation(self, store):
        analysis = {
            "spend_vs_commitment": 0.5,
            "on_time_delivery": 0.93,
            "price_compliance": 0.97,
            "total_value": 300_000,
            "recommendation": "renew",
        }
        result = await _pa.generate_renewal_recommendation("CON-TEST", analysis)
        assert result["recommendation"] == "renew"
        assert len(result["suggested_changes"]) > 0
