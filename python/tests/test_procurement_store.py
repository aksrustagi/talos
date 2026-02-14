"""Tests for the ProcurementStore (async SQLite data store).

These tests exercise the full data store lifecycle: budgets, requisitions,
purchase orders, approvals, invoices, contracts, catalogs, and vendors.
"""

import json
import pytest
import pytest_asyncio

from procurement.store import ProcurementStore


@pytest_asyncio.fixture
async def store(tmp_path):
    """Create a ProcurementStore backed by a temp database."""
    db_path = str(tmp_path / "test_procurement.db")
    s = ProcurementStore(db_path)
    return s


# ============================================
# Budget validation
# ============================================


class TestBudgetValidation:
    @pytest.mark.asyncio
    async def test_valid_budget_has_enough(self, store):
        result = await store.validate_budget("BIO-2024", 1000.0)
        assert result["available"] is True
        assert result["budget_code"] == "BIO-2024"
        assert result["department"] == "Biology"
        assert result["remaining"] > 0

    @pytest.mark.asyncio
    async def test_budget_insufficient(self, store):
        result = await store.validate_budget("BIO-2024", 999_999.0)
        assert result["available"] is False

    @pytest.mark.asyncio
    async def test_unknown_budget(self, store):
        result = await store.validate_budget("NONEXISTENT-2024", 100.0)
        assert result["available"] is False
        assert "not found" in result["reason"]

    @pytest.mark.asyncio
    async def test_commit_budget(self, store):
        before = await store.validate_budget("BIO-2024", 0)
        remaining_before = before["remaining"]

        await store.commit_budget("BIO-2024", 500.0)

        after = await store.validate_budget("BIO-2024", 0)
        assert after["remaining"] == pytest.approx(remaining_before - 500.0)


# ============================================
# Requisitions
# ============================================


class TestRequisitions:
    @pytest.mark.asyncio
    async def test_create_and_retrieve_requisition(self, store):
        result = await store.create_requisition({
            "items": [
                {"description": "Pipette tips", "quantity": 10, "unit_price": 25.0},
            ],
            "budget_code": "BIO-2024",
            "user_id": "user_001",
            "department": "Biology",
            "urgency": "standard",
        })

        assert result["requisition_id"].startswith("REQ-")
        assert result["total"] == 250.0
        assert result["status"] == "pending_approval"

        # Retrieve it
        req = await store.get_requisition(result["requisition_id"])
        assert req is not None
        assert req["budget_code"] == "BIO-2024"
        assert req["status"] == "pending_approval"

    @pytest.mark.asyncio
    async def test_get_nonexistent_requisition(self, store):
        req = await store.get_requisition("NONEXISTENT")
        assert req is None

    @pytest.mark.asyncio
    async def test_update_requisition_status(self, store):
        result = await store.create_requisition({
            "items": [{"description": "Test", "quantity": 1, "unit_price": 10.0}],
            "budget_code": "BIO-2024",
            "user_id": "user_001",
            "department": "Biology",
        })
        req_id = result["requisition_id"]

        await store.update_requisition_status(req_id, "approved", vendor_id="fisher-sci")

        req = await store.get_requisition(req_id)
        assert req["status"] == "approved"
        assert req["vendor_id"] == "fisher-sci"


# ============================================
# Approvers
# ============================================


class TestApprovers:
    @pytest.mark.asyncio
    async def test_no_approvers_for_small_amount(self, store):
        approvers = await store.determine_approvers(100.0)
        assert len(approvers) == 0

    @pytest.mark.asyncio
    async def test_manager_for_medium_amount(self, store):
        approvers = await store.determine_approvers(1000.0)
        assert len(approvers) == 1
        assert approvers[0]["role"] == "manager"

    @pytest.mark.asyncio
    async def test_multiple_approvers_for_large_amount(self, store):
        approvers = await store.determine_approvers(30_000.0)
        assert len(approvers) == 3
        roles = [a["role"] for a in approvers]
        assert "manager" in roles
        assert "director" in roles
        assert "vp" in roles

    @pytest.mark.asyncio
    async def test_cfo_for_huge_amount(self, store):
        approvers = await store.determine_approvers(200_000.0)
        assert len(approvers) == 4
        assert approvers[-1]["role"] == "cfo"


# ============================================
# Purchase orders
# ============================================


class TestPurchaseOrders:
    @pytest.mark.asyncio
    async def test_generate_and_send_po(self, store):
        # Create a requisition first
        result = await store.create_requisition({
            "items": [{"description": "Gloves", "quantity": 5, "unit_price": 12.99}],
            "budget_code": "BIO-2024",
            "user_id": "user_001",
            "department": "Biology",
        })
        req_id = result["requisition_id"]

        # Generate PO
        po_number = await store.generate_purchase_order(req_id)
        assert po_number.startswith("PO-")

        # Requisition should now be po_issued
        req = await store.get_requisition(req_id)
        assert req["status"] == "po_issued"

        # Mark as sent
        sent = await store.mark_po_sent(po_number)
        assert sent is True

    @pytest.mark.asyncio
    async def test_generate_po_nonexistent_requisition(self, store):
        with pytest.raises(ValueError, match="not found"):
            await store.generate_purchase_order("NONEXISTENT")


# ============================================
# Invoices
# ============================================


class TestInvoices:
    @pytest.mark.asyncio
    async def test_parse_unknown_invoice(self, store):
        result = await store.parse_invoice("INV-UNKNOWN")
        assert result["invoice_id"] == "INV-UNKNOWN"
        assert result["status"] == "unparsed"

    @pytest.mark.asyncio
    async def test_find_matching_po_no_po_number(self, store):
        result = await store.find_matching_po({"invoice_id": "test"})
        assert result["found"] is False

    @pytest.mark.asyncio
    async def test_find_matching_po_with_po(self, store):
        # Create a PO first
        result = await store.create_requisition({
            "items": [{"description": "Item", "quantity": 1, "unit_price": 50.0}],
            "budget_code": "BIO-2024",
            "user_id": "user_001",
            "department": "Biology",
        })
        po = await store.generate_purchase_order(result["requisition_id"])

        match = await store.find_matching_po({"po_number": po})
        assert match["found"] is True
        assert match["po_number"] == po


# ============================================
# Contracts
# ============================================


class TestContracts:
    @pytest.mark.asyncio
    async def test_analyze_contract_performance(self, store):
        result = await store.analyze_contract_performance("CON-FISHER-2024")
        assert result["contract_id"] == "CON-FISHER-2024"
        assert result["vendor_name"] == "Fisher Scientific"
        assert 0 <= result["spend_vs_commitment"] <= 1
        assert result["recommendation"] in ("renew", "review")

    @pytest.mark.asyncio
    async def test_analyze_nonexistent_contract(self, store):
        result = await store.analyze_contract_performance("NONEXISTENT")
        assert "error" in result

    @pytest.mark.asyncio
    async def test_generate_renewal_recommendation(self, store):
        analysis = {
            "spend_vs_commitment": 0.5,
            "on_time_delivery": 0.93,
            "price_compliance": 0.97,
            "total_value": 300_000,
            "recommendation": "renew",
        }
        result = await store.generate_renewal_recommendation("CON-TEST", analysis)
        assert result["recommendation"] == "renew"
        assert result["negotiation_priority"] == "high"
        assert len(result["suggested_changes"]) > 0


# ============================================
# Catalogs
# ============================================


class TestCatalogs:
    @pytest.mark.asyncio
    async def test_fetch_vendor_catalog(self, store):
        result = await store.fetch_vendor_catalog("fisher-sci")
        assert result["vendor_id"] == "fisher-sci"
        assert len(result["products"]) > 0

    @pytest.mark.asyncio
    async def test_fetch_empty_catalog(self, store):
        result = await store.fetch_vendor_catalog("nonexistent-vendor")
        assert result["products"] == []

    @pytest.mark.asyncio
    async def test_normalize_catalog(self, store):
        catalog_data = {
            "products": [
                {"id": "1", "product_name": "Widget", "unit_price": 9.99},
                {"id": "2", "product_name": "", "unit_price": 0},
            ],
        }
        result = await store.normalize_catalog(catalog_data)
        assert result["normalized_count"] == 2
        assert len(result["errors"]) > 0  # Product 2 has invalid price

    @pytest.mark.asyncio
    async def test_detect_price_changes(self, store):
        # Fetch the existing catalog to simulate update detection
        catalog = await store.fetch_vendor_catalog("fisher-sci")
        # Modify a price
        if catalog["products"]:
            catalog["products"][0]["unit_price"] += 5.0

        result = await store.detect_price_changes("fisher-sci", catalog)
        assert result["significant_changes"] is True
        assert len(result["changes"]) >= 1


# ============================================
# Vendors
# ============================================


class TestVendors:
    @pytest.mark.asyncio
    async def test_get_vendor(self, store):
        vendor = await store.get_vendor("fisher-sci")
        assert vendor is not None
        assert vendor["name"] == "Fisher Scientific"

    @pytest.mark.asyncio
    async def test_get_nonexistent_vendor(self, store):
        vendor = await store.get_vendor("nonexistent")
        assert vendor is None

    @pytest.mark.asyncio
    async def test_list_vendors(self, store):
        vendors = await store.list_vendors()
        assert len(vendors) == 8  # 8 seeded vendors
        names = [v["name"] for v in vendors]
        assert "Fisher Scientific" in names
        assert "Dell Technologies" in names
