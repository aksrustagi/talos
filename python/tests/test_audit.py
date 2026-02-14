"""
Tests for the audit trail system.

Covers:
- Append-only enforcement (UPDATE/DELETE blocked)
- Hash chain integrity
- Decision chain reconstruction
- PDF export generation
- Auto-extraction of requisition IDs
- Token cost estimation
"""

import os
import sqlite3
import tempfile
import json

import pytest

from audit.database import AuditDatabase
from audit.models import AuditEntry, AuditDecisionSummary
from audit.logger import AuditLogger
from audit.pdf_export import AuditPDFExporter


@pytest.fixture
def tmp_db_path(tmp_path):
    """Provide a temporary database path."""
    return str(tmp_path / "test_audit.db")


@pytest.fixture
def audit_db(tmp_db_path):
    """Create a fresh AuditDatabase for each test."""
    return AuditDatabase(db_path=tmp_db_path)


@pytest.fixture
def audit_logger(audit_db):
    """Create an AuditLogger backed by the test database."""
    return AuditLogger(db=audit_db)


@pytest.fixture
def sample_entry():
    """A minimal valid AuditEntry for testing."""
    return AuditEntry(
        agent_name="requisition",
        agent_tier=2,
        input_text="Create a requisition for 100 lab gloves",
        output_text="Requisition REQ-2025-00847 created successfully.",
        model_used="claude-sonnet-4-20250514",
        input_tokens=1500,
        output_tokens=800,
        decision="requisition_created",
        reasoning="Created requisition with 1 items",
        requisition_id="REQ-2025-00847",
        triggered_by="user_001",
        trigger_type="user",
        user_email="buyer@university.edu",
        user_department="Chemistry",
        university_id="university_001",
        execution_id="exec_test123",
        execution_duration_ms=2500,
    )


# ============================================
# Append-Only Enforcement Tests
# ============================================


class TestAppendOnly:
    """Verify that UPDATE and DELETE operations are blocked by triggers."""

    def test_insert_succeeds(self, audit_db, sample_entry):
        row_id = audit_db.insert(sample_entry)
        assert row_id >= 1

    def test_update_blocked(self, audit_db, sample_entry):
        row_id = audit_db.insert(sample_entry)

        conn = sqlite3.connect(audit_db.db_path)
        with pytest.raises(sqlite3.IntegrityError, match="append-only"):
            conn.execute(
                "UPDATE audit_log SET decision = 'tampered' WHERE id = ?",
                (row_id,),
            )
        conn.close()

    def test_delete_blocked(self, audit_db, sample_entry):
        row_id = audit_db.insert(sample_entry)

        conn = sqlite3.connect(audit_db.db_path)
        with pytest.raises(sqlite3.IntegrityError, match="append-only"):
            conn.execute("DELETE FROM audit_log WHERE id = ?", (row_id,))
        conn.close()

    def test_delete_all_blocked(self, audit_db, sample_entry):
        audit_db.insert(sample_entry)

        conn = sqlite3.connect(audit_db.db_path)
        with pytest.raises(sqlite3.IntegrityError, match="append-only"):
            conn.execute("DELETE FROM audit_log")
        conn.close()

    def test_multiple_inserts_succeed(self, audit_db, sample_entry):
        ids = []
        for i in range(5):
            entry = sample_entry.model_copy()
            entry.agent_name = f"agent-{i}"
            ids.append(audit_db.insert(entry))

        assert len(ids) == 5
        assert len(set(ids)) == 5  # All unique IDs


# ============================================
# Hash Chain Tests
# ============================================


class TestHashChain:
    """Verify SHA-256 hash chain integrity."""

    def test_first_entry_has_genesis_previous(self, audit_db, sample_entry):
        audit_db.insert(sample_entry)

        entries = audit_db.query_by_requisition("REQ-2025-00847")
        assert entries[0].previous_hash == "GENESIS"
        assert entries[0].entry_hash is not None
        assert len(entries[0].entry_hash) == 64  # SHA-256 hex length

    def test_chain_links_correctly(self, audit_db, sample_entry):
        # Insert 3 entries
        for i in range(3):
            entry = sample_entry.model_copy()
            entry.agent_name = f"agent-{i}"
            audit_db.insert(entry)

        entries = audit_db.query_by_requisition("REQ-2025-00847")
        assert len(entries) == 3

        # First links to GENESIS
        assert entries[0].previous_hash == "GENESIS"

        # Each subsequent entry's previous_hash matches the prior entry's entry_hash
        assert entries[1].previous_hash == entries[0].entry_hash
        assert entries[2].previous_hash == entries[1].entry_hash

    def test_verify_intact_chain(self, audit_db, sample_entry):
        for i in range(5):
            entry = sample_entry.model_copy()
            entry.agent_name = f"agent-{i}"
            audit_db.insert(entry)

        result = audit_db.verify_chain_integrity()
        assert result["valid"] is True
        assert result["total_entries"] == 5
        assert result["first_broken_id"] is None

    def test_verify_detects_tampered_content(self, audit_db, sample_entry):
        for i in range(3):
            entry = sample_entry.model_copy()
            entry.agent_name = f"agent-{i}"
            audit_db.insert(entry)

        # Tamper with content directly at the SQLite level (bypass triggers temporarily)
        conn = sqlite3.connect(audit_db.db_path)
        # Drop and recreate the trigger to allow tampering for this test
        conn.execute("DROP TRIGGER IF EXISTS audit_no_update")
        conn.execute(
            "UPDATE audit_log SET output_text = 'TAMPERED' WHERE id = 2"
        )
        conn.commit()
        conn.close()

        # Re-init to get triggers back
        audit_db._init_db()

        result = audit_db.verify_chain_integrity()
        assert result["valid"] is False
        assert result["first_broken_id"] == 2

    def test_verify_empty_db(self, audit_db):
        result = audit_db.verify_chain_integrity()
        assert result["valid"] is True
        assert result["total_entries"] == 0


# ============================================
# Decision Chain Reconstruction Tests
# ============================================


class TestDecisionChain:
    """Verify decision chain reconstruction from audit entries."""

    def test_empty_chain(self, audit_logger):
        result = audit_logger.get_decision_chain("REQ-NONEXISTENT")
        assert result["total_entries"] == 0
        assert result["decision_chain"] == []

    def test_single_entry_chain(self, audit_logger):
        audit_logger.log_agent_call(
            agent_name="requisition",
            agent_tier=2,
            input_text="Create requisition",
            output_text="Created REQ-2025-00001",
            model_used="claude-sonnet-4-20250514",
            triggered_by="user_001",
            trigger_type="user",
            decision="requisition_created",
            reasoning="Budget verified, policy compliant",
            requisition_id="REQ-2025-00001",
            input_tokens=1000,
            output_tokens=500,
        )

        result = audit_logger.get_decision_chain("REQ-2025-00001")
        assert result["total_entries"] == 1
        assert result["summary"]["agents_involved"] == ["requisition"]
        assert result["summary"]["final_decision"] == "requisition_created"

    def test_multi_agent_chain(self, audit_logger):
        # Simulate a full procurement flow
        agents = [
            ("requisition", "requisition_created", "Budget available"),
            ("vendor-selection", "vendor_evaluated", "VendorA scored 92/100"),
            ("approval-workflow", "approved", "Manager approved $2500 order"),
        ]

        for agent, decision, reasoning in agents:
            audit_logger.log_agent_call(
                agent_name=agent,
                input_text=f"Process via {agent}",
                output_text=f"Result from {agent}",
                model_used="claude-sonnet-4-20250514",
                triggered_by="user_001",
                trigger_type="user",
                decision=decision,
                reasoning=reasoning,
                requisition_id="REQ-2025-00002",
                input_tokens=1000,
                output_tokens=500,
            )

        result = audit_logger.get_decision_chain("REQ-2025-00002")
        assert result["total_entries"] == 3
        summary = result["summary"]
        assert len(summary["agents_involved"]) == 3
        assert summary["final_decision"] == "approved"
        assert summary["final_reasoning"] == "Manager approved $2500 order"
        assert summary["total_decisions"] == 3

    def test_approval_chain_extraction(self, audit_logger):
        audit_logger.log_agent_call(
            agent_name="approval-workflow",
            input_text="Process approval",
            output_text="Approved by manager",
            model_used="claude-sonnet-4-20250514",
            triggered_by="manager_001",
            trigger_type="user",
            decision="approved",
            reasoning="Within budget, policy compliant",
            requisition_id="REQ-2025-00003",
            user_email="manager@university.edu",
        )

        result = audit_logger.get_decision_chain("REQ-2025-00003")
        approvals = result["summary"]["approval_chain"]
        assert len(approvals) == 1
        assert approvals[0]["decision"] == "approved"
        assert approvals[0]["email"] == "manager@university.edu"

    def test_vendor_extraction_from_tool_calls(self, audit_logger):
        audit_logger.log_agent_call(
            agent_name="vendor-selection",
            input_text="Evaluate vendors",
            output_text="VendorA recommended",
            model_used="claude-sonnet-4-20250514",
            triggered_by="user_001",
            trigger_type="user",
            decision="vendor_evaluated",
            reasoning="Best price and quality",
            tool_calls=[
                {"name": "score_vendor", "args": {"vendor_id": "v001"}},
                {"name": "score_vendor", "args": {"vendor_id": "v002"}},
                {"name": "assess_vendor_risk", "args": {"vendor_id": "v003"}},
            ],
            requisition_id="REQ-2025-00004",
        )

        result = audit_logger.get_decision_chain("REQ-2025-00004")
        vendors = result["summary"]["vendors_evaluated"]
        assert sorted(vendors) == ["v001", "v002", "v003"]


# ============================================
# Cost Estimation Tests
# ============================================


class TestCostEstimation:
    """Verify that cost is auto-calculated from token counts."""

    def test_cost_auto_calculated(self, audit_logger):
        row_id = audit_logger.log_agent_call(
            agent_name="test",
            input_text="input",
            output_text="output",
            model_used="claude-sonnet-4-20250514",
            triggered_by="user_001",
            input_tokens=1000,
            output_tokens=500,
            requisition_id="REQ-COST-TEST",
        )

        entries = audit_logger.db.query_by_requisition("REQ-COST-TEST")
        assert len(entries) == 1
        # Sonnet: $0.003/1K input + $0.015/1K output
        # = (1000/1000 * 0.003) + (500/1000 * 0.015)
        # = 0.003 + 0.0075 = 0.0105
        assert entries[0].cost_usd == pytest.approx(0.0105, abs=0.0001)

    def test_cost_not_overridden_when_explicit(self, audit_logger):
        audit_logger.log_agent_call(
            agent_name="test",
            input_text="input",
            output_text="output",
            model_used="claude-sonnet-4-20250514",
            triggered_by="user_001",
            input_tokens=1000,
            output_tokens=500,
            cost_usd=0.05,  # Explicit cost
            requisition_id="REQ-COST-EXPLICIT",
        )

        entries = audit_logger.db.query_by_requisition("REQ-COST-EXPLICIT")
        assert entries[0].cost_usd == 0.05

    def test_cost_none_without_tokens(self, audit_logger):
        audit_logger.log_agent_call(
            agent_name="test",
            input_text="input",
            output_text="output",
            model_used="claude-sonnet-4-20250514",
            triggered_by="user_001",
            requisition_id="REQ-COST-NONE",
        )

        entries = audit_logger.db.query_by_requisition("REQ-COST-NONE")
        assert entries[0].cost_usd is None


# ============================================
# Query Tests
# ============================================


class TestQueries:
    """Verify database query methods."""

    def test_query_by_requisition(self, audit_db, sample_entry):
        audit_db.insert(sample_entry)

        entries = audit_db.query_by_requisition("REQ-2025-00847")
        assert len(entries) == 1
        assert entries[0].agent_name == "requisition"

    def test_query_by_requisition_empty(self, audit_db):
        entries = audit_db.query_by_requisition("REQ-NONEXISTENT")
        assert entries == []

    def test_query_by_purchase_order(self, audit_db, sample_entry):
        entry = sample_entry.model_copy()
        entry.purchase_order_id = "PO-2025-00100"
        audit_db.insert(entry)

        entries = audit_db.query_by_purchase_order("PO-2025-00100")
        assert len(entries) == 1

    def test_query_by_contract(self, audit_db, sample_entry):
        entry = sample_entry.model_copy()
        entry.contract_id = "CON-2025-00050"
        audit_db.insert(entry)

        entries = audit_db.query_by_contract("CON-2025-00050")
        assert len(entries) == 1

    def test_query_by_execution(self, audit_db, sample_entry):
        audit_db.insert(sample_entry)

        entries = audit_db.query_by_execution("exec_test123")
        assert len(entries) == 1

    def test_count_by_requisition(self, audit_db, sample_entry):
        for i in range(3):
            entry = sample_entry.model_copy()
            entry.agent_name = f"agent-{i}"
            audit_db.insert(entry)

        count = audit_db.count_by_requisition("REQ-2025-00847")
        assert count == 3

    def test_query_ordering(self, audit_db):
        # Insert entries with specific timestamps
        for i, ts in enumerate(["2025-01-03T00:00:00Z", "2025-01-01T00:00:00Z", "2025-01-02T00:00:00Z"]):
            entry = AuditEntry(
                timestamp=ts,
                agent_name=f"agent-{i}",
                input_text="test",
                output_text="test",
                model_used="claude-sonnet-4-20250514",
                triggered_by="user_001",
                trigger_type="user",
                requisition_id="REQ-ORDER-TEST",
            )
            audit_db.insert(entry)

        entries = audit_db.query_by_requisition("REQ-ORDER-TEST")
        timestamps = [e.timestamp for e in entries]
        assert timestamps == sorted(timestamps)


# ============================================
# PDF Export Tests
# ============================================


class TestPDFExport:
    """Verify PDF generation produces valid output."""

    def test_generates_pdf_bytes(self, sample_entry):
        exporter = AuditPDFExporter()

        summary = {
            "requisition_id": "REQ-2025-00847",
            "first_action": "2025-01-01T00:00:00Z",
            "last_action": "2025-01-01T01:00:00Z",
            "agents_involved": ["requisition"],
            "total_decisions": 1,
            "total_cost_usd": 0.0105,
            "total_duration_ms": 2500,
            "vendors_evaluated": [],
            "final_decision": "requisition_created",
            "final_reasoning": "Created requisition with 1 items",
            "approval_chain": [],
        }

        pdf_bytes = exporter.generate_report(
            requisition_id="REQ-2025-00847",
            entries=[sample_entry],
            summary=summary,
        )

        assert isinstance(pdf_bytes, (bytes, bytearray))
        assert len(pdf_bytes) > 0
        # PDF magic bytes
        assert pdf_bytes[:4] == b"%PDF"

    def test_pdf_with_chain_verification(self, sample_entry):
        exporter = AuditPDFExporter()

        summary = {
            "requisition_id": "REQ-2025-00847",
            "first_action": "2025-01-01T00:00:00Z",
            "last_action": "2025-01-01T01:00:00Z",
            "agents_involved": ["requisition"],
            "total_decisions": 1,
            "total_cost_usd": 0.0105,
            "total_duration_ms": 2500,
            "vendors_evaluated": [],
            "final_decision": "requisition_created",
            "final_reasoning": "Created",
            "approval_chain": [],
        }

        pdf_bytes = exporter.generate_report(
            requisition_id="REQ-2025-00847",
            entries=[sample_entry],
            summary=summary,
            chain_verification={"valid": True, "total_entries": 1, "first_broken_id": None},
        )

        assert pdf_bytes[:4] == b"%PDF"

    def test_pdf_with_approval_chain(self, sample_entry):
        exporter = AuditPDFExporter()

        summary = {
            "requisition_id": "REQ-2025-00847",
            "first_action": "2025-01-01T00:00:00Z",
            "last_action": "2025-01-01T01:00:00Z",
            "agents_involved": ["requisition", "approval-workflow"],
            "total_decisions": 2,
            "total_cost_usd": 0.021,
            "total_duration_ms": 5000,
            "vendors_evaluated": ["v001"],
            "final_decision": "approved",
            "final_reasoning": "Budget available, policy compliant",
            "approval_chain": [
                {
                    "timestamp": "2025-01-01T01:00:00Z",
                    "decision": "approved",
                    "by": "manager_001",
                    "email": "manager@university.edu",
                    "reasoning": "Within budget limits",
                }
            ],
        }

        pdf_bytes = exporter.generate_report(
            requisition_id="REQ-2025-00847",
            entries=[sample_entry],
            summary=summary,
        )

        assert pdf_bytes[:4] == b"%PDF"
        assert len(pdf_bytes) > 500  # Non-trivial PDF

    def test_pdf_without_full_io(self, sample_entry):
        exporter = AuditPDFExporter()

        summary = {
            "requisition_id": "REQ-2025-00847",
            "agents_involved": ["requisition"],
            "total_decisions": 1,
            "total_cost_usd": 0.01,
        }

        pdf_bytes = exporter.generate_report(
            requisition_id="REQ-2025-00847",
            entries=[sample_entry],
            summary=summary,
            include_full_io=False,
            include_tool_calls=False,
        )

        assert pdf_bytes[:4] == b"%PDF"


# ============================================
# Execution ID Tests
# ============================================


class TestExecutionID:
    """Verify execution ID generation and grouping."""

    def test_start_execution_returns_unique_ids(self, audit_logger):
        ids = {audit_logger.start_execution() for _ in range(100)}
        assert len(ids) == 100

    def test_execution_id_format(self, audit_logger):
        exec_id = audit_logger.start_execution()
        assert exec_id.startswith("exec_")
        assert len(exec_id) == 21  # "exec_" + 16 hex chars


# ============================================
# Model Tests
# ============================================


class TestModels:
    """Verify Pydantic model behavior."""

    def test_audit_entry_timestamp_auto_generated(self):
        entry = AuditEntry(
            agent_name="test",
            input_text="in",
            output_text="out",
            model_used="claude-sonnet-4-20250514",
            triggered_by="user",
            trigger_type="user",
        )
        assert entry.timestamp.endswith("Z")

    def test_audit_entry_serialization(self, sample_entry):
        data = sample_entry.model_dump()
        restored = AuditEntry(**data)
        assert restored.agent_name == sample_entry.agent_name
        assert restored.requisition_id == sample_entry.requisition_id

    def test_audit_decision_summary(self):
        summary = AuditDecisionSummary(requisition_id="REQ-TEST")
        assert summary.total_decisions == 0
        assert summary.total_cost_usd == 0.0
        assert summary.agents_involved == []
