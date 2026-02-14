"""Tests for Talos database layer."""
import pytest
from talos.db import TalosDB
from talos.schemas import (
    RequisitionPipeline, ParsedRequisition, ComplianceResult,
    SavingsRecord, ConversationSession, ChatMessage, LineItem,
)
from talos.llm import LLMCall


class TestTalosDB:
    def test_init_creates_tables(self, db):
        """Database initialization should create all required tables."""
        with db._conn() as conn:
            tables = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            ).fetchall()
            table_names = [t["name"] for t in tables]
            assert "pipelines" in table_names
            assert "savings" in table_names
            assert "llm_calls" in table_names
            assert "conversations" in table_names
            assert "vendor_memory" in table_names
            assert "historical_orders" in table_names

    def test_close(self):
        db = TalosDB(":memory:")
        db.close()
        assert db._persistent_conn is None


class TestPipelineCRUD:
    def test_save_and_get_pipeline(self, db, sample_pipeline):
        db.save_pipeline(sample_pipeline, "university")
        result = db.get_pipeline(sample_pipeline.id)
        assert result is not None
        assert result.id == sample_pipeline.id
        assert result.parsed is not None
        assert result.parsed.req_id == sample_pipeline.parsed.req_id

    def test_get_nonexistent_pipeline(self, db):
        result = db.get_pipeline("PIPE-NONEXISTENT")
        assert result is None

    def test_list_pipelines(self, db, sample_pipeline):
        db.save_pipeline(sample_pipeline, "university")
        results = db.list_pipelines()
        assert len(results) == 1
        assert results[0]["id"] == sample_pipeline.id

    def test_list_pipelines_with_status_filter(self, db, sample_pipeline):
        db.save_pipeline(sample_pipeline, "university")
        results = db.list_pipelines(status="compliance_checked")
        assert len(results) == 1
        results = db.list_pipelines(status="nonexistent")
        assert len(results) == 0

    def test_list_pipelines_pagination(self, db):
        for i in range(5):
            pipe = RequisitionPipeline(id=f"PIPE-{i:04d}", raw_text=f"Test {i}")
            db.save_pipeline(pipe, "university")
        results = db.list_pipelines(limit=2, offset=0)
        assert len(results) == 2
        results = db.list_pipelines(limit=2, offset=3)
        assert len(results) == 2

    def test_list_pipelines_max_limit(self, db):
        results = db.list_pipelines(limit=500)
        # Should cap at 200
        assert results == []  # No data but no error

    def test_save_pipeline_with_savings(self, db, sample_pipeline, sample_savings):
        sample_pipeline.savings = sample_savings
        db.save_pipeline(sample_pipeline, "university")
        savings_list = db.list_savings()
        assert len(savings_list) == 1


class TestSavingsCRUD:
    def test_save_and_list_savings(self, db, sample_savings):
        db.save_savings(sample_savings, "PIPE-TEST")
        results = db.list_savings()
        assert len(results) == 1
        assert results[0]["savings_id"] == sample_savings.savings_id

    def test_list_savings_by_period(self, db, sample_savings):
        sample_savings.period = "2025-01"
        db.save_savings(sample_savings, "PIPE-TEST")
        results = db.list_savings(period="2025-01")
        assert len(results) == 1
        results = db.list_savings(period="2024-12")
        assert len(results) == 0

    def test_savings_summary(self, db, sample_savings):
        db.save_savings(sample_savings, "PIPE-TEST")
        summary = db.savings_summary()
        assert summary["total_records"] == 1
        assert summary["total_savings"] == sample_savings.total_savings
        assert summary["total_talos_share"] == sample_savings.talos_share

    def test_savings_pagination(self, db):
        for i in range(5):
            s = SavingsRecord(
                savings_id=f"SAV-{i:04d}",
                total_savings=float(i * 100),
                talos_share=float(i * 33),
            )
            db.save_savings(s)
        results = db.list_savings(limit=2, offset=2)
        assert len(results) == 2


class TestConversationCRUD:
    def test_save_and_get_conversation(self, db, sample_session):
        db.save_conversation(sample_session)
        result = db.get_conversation(sample_session.session_id)
        assert result is not None
        assert result.session_id == sample_session.session_id
        assert len(result.messages) == 2

    def test_get_nonexistent_conversation(self, db):
        result = db.get_conversation("CHAT-NONEXISTENT")
        assert result is None

    def test_list_conversations(self, db, sample_session):
        db.save_conversation(sample_session)
        results = db.list_conversations()
        assert len(results) == 1

    def test_list_conversations_pagination(self, db):
        for i in range(5):
            s = ConversationSession(session_id=f"CHAT-{i:04d}")
            db.save_conversation(s)
        results = db.list_conversations(limit=2, offset=1)
        assert len(results) == 2


class TestVendorMemory:
    def test_save_and_get_vendor_price(self, db):
        db.save_vendor_price("Fisher Scientific", "Lab Supplies", 12.50)
        results = db.get_vendor_prices("Lab Supplies")
        assert len(results) == 1
        assert results[0]["vendor_name"] == "Fisher Scientific"
        assert results[0]["last_price"] == 12.50

    def test_update_vendor_price(self, db):
        db.save_vendor_price("Fisher", "Gloves", 15.00)
        db.save_vendor_price("Fisher", "Gloves", 12.00)
        results = db.get_vendor_prices("Gloves")
        assert len(results) == 1
        assert results[0]["last_price"] == 12.00
        assert results[0]["best_price"] == 12.00

    def test_like_injection_escaped(self, db):
        db.save_vendor_price("Vendor", "100% pure", 10.0)
        # The % in the category should be escaped
        results = db.get_vendor_prices("100% pure")
        assert len(results) == 1

    def test_underscore_injection_escaped(self, db):
        db.save_vendor_price("Vendor", "item_special", 10.0)
        results = db.get_vendor_prices("item_special")
        assert len(results) == 1


class TestHistoricalOrders:
    def test_import_and_find_orders(self, db):
        orders = [
            {"po_number": "PO-001", "vendor_name": "Fisher", "category": "Lab Supplies",
             "item_description": "Gloves", "quantity": 50, "unit_price": 12.0,
             "total": 600, "department": "Chemistry", "order_date": "2025-01-15"},
        ]
        db.import_orders(orders)
        results = db.find_similar_orders("Lab Supplies")
        assert len(results) == 1


class TestLLMCostTracking:
    def test_save_and_summarize_llm_calls(self, db):
        calls = [
            LLMCall(agent="intake_parser", model="test-model", tokens_in=100, tokens_out=50, cost=0.01, latency_ms=500),
            LLMCall(agent="policy_compliance", model="test-model", tokens_in=200, tokens_out=100, cost=0.05, latency_ms=800),
        ]
        db.save_llm_calls(calls, "PIPE-TEST")
        summary = db.cost_summary()
        assert summary["totals"]["total_calls"] == 2
        assert summary["totals"]["total_cost"] == pytest.approx(0.06)
        assert len(summary["by_agent"]) == 2


class TestDashboard:
    def test_dashboard_empty(self, db):
        dash = db.dashboard()
        assert "pipelines" in dash
        assert "savings" in dash
        assert "llm_costs" in dash
        assert "active_conversations" in dash

    def test_dashboard_with_data(self, db, sample_pipeline, sample_savings, sample_session):
        db.save_pipeline(sample_pipeline, "university")
        db.save_savings(sample_savings)
        db.save_conversation(sample_session)
        dash = db.dashboard()
        assert dash["active_conversations"] == 1


class TestEscapeLike:
    def test_escape_percent(self):
        assert TalosDB._escape_like("100%") == "100\\%"

    def test_escape_underscore(self):
        assert TalosDB._escape_like("item_1") == "item\\_1"

    def test_escape_backslash(self):
        assert TalosDB._escape_like("path\\file") == "path\\\\file"

    def test_no_escape_needed(self):
        assert TalosDB._escape_like("normal text") == "normal text"
