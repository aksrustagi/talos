"""Tests for the append-only audit log system."""

import json
import sqlite3
import threading

import pytest

from audit.audit_log import AuditLogger, init_db


# ============================================
# Basic logging
# ============================================


class TestAuditLogBasic:
    def test_log_agent_call_returns_uuid(self, tmp_audit_db):
        logger = AuditLogger(tmp_audit_db)
        entry_id = logger.log_agent_call(
            agent_name="TestAgent",
            agent_id="test-agent",
            input_message="Hello",
            output_response="World",
            model_used="test-model",
            triggered_by="user",
        )
        assert entry_id is not None
        assert len(entry_id) == 36  # UUID format

    def test_log_and_retrieve_by_id(self, tmp_audit_db):
        logger = AuditLogger(tmp_audit_db)
        entry_id = logger.log_agent_call(
            agent_name="TestAgent",
            agent_id="test-agent",
            input_message="test input",
            output_response="test output",
            model_used="claude-test",
            triggered_by="system",
            user_id="user_001",
        )

        entry = logger.get_by_id(entry_id)
        assert entry is not None
        assert entry["agent_name"] == "TestAgent"
        assert entry["agent_id"] == "test-agent"
        assert entry["input_message"] == "test input"
        assert entry["output_response"] == "test output"
        assert entry["model_used"] == "claude-test"
        assert entry["triggered_by"] == "system"
        assert entry["user_id"] == "user_001"

    def test_log_with_all_optional_fields(self, tmp_audit_db):
        logger = AuditLogger(tmp_audit_db)
        tool_calls = [{"name": "search_vendors", "args": {"category": "lab"}}]
        context = {"budget_code": "BIO-2024", "department": "Biology"}

        entry_id = logger.log_agent_call(
            agent_name="VendorAgent",
            agent_id="vendor-selection",
            input_message="Find vendors",
            output_response="Found 3 vendors",
            model_used="claude-sonnet-4-20250514",
            triggered_by="user",
            input_context=context,
            output_tool_calls=tool_calls,
            output_actions=["searched_catalog"],
            cost_input_tokens=100,
            cost_output_tokens=200,
            cost_total_usd=0.005,
            decision_made="Selected vendor A",
            decision_reasoning="Best price-quality ratio",
            requisition_id="REQ-001",
            po_id="PO-001",
            contract_id="CON-001",
            user_id="user_001",
            user_email="user@university.edu",
            university_id="univ_001",
            workflow_run_id="wf-123",
            workflow_step="vendor_selection",
            parent_audit_id="parent-456",
            duration_ms=1500,
        )

        entry = logger.get_by_id(entry_id)
        assert entry["requisition_id"] == "REQ-001"
        assert entry["po_id"] == "PO-001"
        assert entry["contract_id"] == "CON-001"
        assert entry["cost_input_tokens"] == 100
        assert entry["cost_output_tokens"] == 200
        assert entry["cost_total_usd"] == pytest.approx(0.005)
        assert entry["duration_ms"] == 1500
        assert entry["workflow_run_id"] == "wf-123"
        assert entry["workflow_step"] == "vendor_selection"

        # JSON fields should round-trip
        stored_context = json.loads(entry["input_context"])
        assert stored_context["budget_code"] == "BIO-2024"
        stored_tools = json.loads(entry["output_tool_calls"])
        assert stored_tools[0]["name"] == "search_vendors"

    def test_get_by_id_nonexistent(self, tmp_audit_db):
        logger = AuditLogger(tmp_audit_db)
        assert logger.get_by_id("nonexistent-id") is None


# ============================================
# Query methods
# ============================================


class TestAuditLogQueries:
    def _populate(self, logger):
        """Insert several entries for query tests."""
        ids = []
        for i, (req, po, wf) in enumerate([
            ("REQ-A", "PO-A", "wf-1"),
            ("REQ-A", "PO-A", "wf-1"),
            ("REQ-A", None, "wf-1"),
            ("REQ-B", "PO-B", "wf-2"),
        ]):
            eid = logger.log_agent_call(
                agent_name=f"Agent{i}",
                agent_id=f"agent-{i}",
                input_message=f"msg-{i}",
                output_response=f"resp-{i}",
                model_used="test",
                triggered_by="system",
                requisition_id=req,
                po_id=po,
                contract_id=f"CON-{i}" if i == 0 else None,
                workflow_run_id=wf,
                user_id="user_001",
                duration_ms=100 * (i + 1),
            )
            ids.append(eid)
        return ids

    def test_get_by_requisition(self, tmp_audit_db):
        logger = AuditLogger(tmp_audit_db)
        self._populate(logger)
        entries = logger.get_by_requisition("REQ-A")
        assert len(entries) == 3

    def test_get_by_po(self, tmp_audit_db):
        logger = AuditLogger(tmp_audit_db)
        self._populate(logger)
        entries = logger.get_by_po("PO-A")
        assert len(entries) == 2

    def test_get_by_contract(self, tmp_audit_db):
        logger = AuditLogger(tmp_audit_db)
        self._populate(logger)
        entries = logger.get_by_contract("CON-0")
        assert len(entries) == 1

    def test_get_by_workflow(self, tmp_audit_db):
        logger = AuditLogger(tmp_audit_db)
        self._populate(logger)
        entries = logger.get_by_workflow("wf-1")
        assert len(entries) == 3

    def test_get_by_user(self, tmp_audit_db):
        logger = AuditLogger(tmp_audit_db)
        self._populate(logger)
        entries = logger.get_by_user("user_001")
        assert len(entries) == 4

    def test_get_decision_chain(self, tmp_audit_db):
        logger = AuditLogger(tmp_audit_db)
        self._populate(logger)
        chain = logger.get_decision_chain("REQ-A")
        assert len(chain) == 3
        assert chain[0]["step"] == 1
        assert chain[1]["step"] == 2
        assert chain[2]["step"] == 3

    def test_get_summary_stats(self, tmp_audit_db):
        logger = AuditLogger(tmp_audit_db)
        self._populate(logger)
        stats = logger.get_summary_stats("REQ-A")
        assert stats["total_entries"] == 3
        assert stats["total_duration_ms"] == 100 + 200 + 300
        assert "agents_involved" in stats

    def test_get_summary_stats_empty(self, tmp_audit_db):
        logger = AuditLogger(tmp_audit_db)
        stats = logger.get_summary_stats("NONEXISTENT")
        assert stats["total_entries"] == 0


# ============================================
# Append-only enforcement
# ============================================


class TestAuditLogImmutability:
    def test_update_is_rejected(self, tmp_audit_db):
        logger = AuditLogger(tmp_audit_db)
        entry_id = logger.log_agent_call(
            agent_name="TestAgent",
            agent_id="test",
            input_message="original",
            output_response="original",
            model_used="test",
            triggered_by="user",
        )

        conn = logger._conn()
        with pytest.raises(sqlite3.IntegrityError, match="append-only"):
            conn.execute(
                "UPDATE audit_log SET input_message = 'tampered' WHERE id = ?",
                (entry_id,),
            )

    def test_delete_is_rejected(self, tmp_audit_db):
        logger = AuditLogger(tmp_audit_db)
        entry_id = logger.log_agent_call(
            agent_name="TestAgent",
            agent_id="test",
            input_message="original",
            output_response="original",
            model_used="test",
            triggered_by="user",
        )

        conn = logger._conn()
        with pytest.raises(sqlite3.IntegrityError, match="append-only"):
            conn.execute("DELETE FROM audit_log WHERE id = ?", (entry_id,))


# ============================================
# Thread safety
# ============================================


class TestAuditLogThreadSafety:
    def test_concurrent_writes(self, tmp_audit_db):
        logger = AuditLogger(tmp_audit_db)
        errors = []

        def write_entry(idx):
            try:
                logger.log_agent_call(
                    agent_name=f"Agent-{idx}",
                    agent_id=f"agent-{idx}",
                    input_message=f"msg-{idx}",
                    output_response=f"resp-{idx}",
                    model_used="test",
                    triggered_by="system",
                    requisition_id="REQ-CONCURRENT",
                )
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=write_entry, args=(i,)) for i in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0
        entries = logger.get_by_requisition("REQ-CONCURRENT")
        assert len(entries) == 10
