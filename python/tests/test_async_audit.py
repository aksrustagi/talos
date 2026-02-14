"""Tests for the AsyncAuditLogger and schema migration system."""

import pytest
import pytest_asyncio
import aiosqlite

from audit.audit_log import AsyncAuditLogger
from audit.migrations import apply_migrations, MIGRATIONS


# ============================================
# Schema migrations
# ============================================


class TestMigrations:
    @pytest.mark.asyncio
    async def test_apply_migrations_creates_tables(self, tmp_path):
        db_path = str(tmp_path / "migration_test.db")
        async with aiosqlite.connect(db_path) as db:
            version = await apply_migrations(db)
            assert version == len(MIGRATIONS)

            # Verify audit_log table exists
            rows = await db.execute_fetchall(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log'"
            )
            assert len(rows) == 1

            # Verify schema_version table exists
            rows = await db.execute_fetchall(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
            )
            assert len(rows) == 1

    @pytest.mark.asyncio
    async def test_migrations_are_idempotent(self, tmp_path):
        db_path = str(tmp_path / "idempotent_test.db")
        async with aiosqlite.connect(db_path) as db:
            v1 = await apply_migrations(db)
            v2 = await apply_migrations(db)
            assert v1 == v2

    @pytest.mark.asyncio
    async def test_migration_v2_adds_error_message(self, tmp_path):
        db_path = str(tmp_path / "v2_test.db")
        async with aiosqlite.connect(db_path) as db:
            await apply_migrations(db)
            # Verify error_message column exists
            cursor = await db.execute("PRAGMA table_info(audit_log)")
            columns = [row[1] for row in await cursor.fetchall()]
            assert "error_message" in columns


# ============================================
# AsyncAuditLogger
# ============================================


class TestAsyncAuditLogger:
    @pytest.mark.asyncio
    async def test_log_and_retrieve(self, tmp_path):
        db_path = str(tmp_path / "async_audit.db")
        logger = AsyncAuditLogger(db_path)

        entry_id = await logger.log_agent_call(
            agent_name="TestAgent",
            agent_id="test",
            input_message="Hello",
            output_response="World",
            model_used="test-model",
            triggered_by="user",
            requisition_id="REQ-ASYNC-001",
        )
        assert entry_id is not None
        assert len(entry_id) == 36  # UUID format

        entries = await logger.get_by_requisition("REQ-ASYNC-001")
        assert len(entries) == 1
        assert entries[0]["agent_name"] == "TestAgent"

    @pytest.mark.asyncio
    async def test_get_by_po(self, tmp_path):
        db_path = str(tmp_path / "async_po.db")
        logger = AsyncAuditLogger(db_path)

        await logger.log_agent_call(
            agent_name="Agent1",
            agent_id="a1",
            input_message="msg",
            output_response="resp",
            model_used="test",
            triggered_by="system",
            po_id="PO-ASYNC-001",
        )

        entries = await logger.get_by_po("PO-ASYNC-001")
        assert len(entries) == 1

    @pytest.mark.asyncio
    async def test_get_by_contract(self, tmp_path):
        db_path = str(tmp_path / "async_contract.db")
        logger = AsyncAuditLogger(db_path)

        await logger.log_agent_call(
            agent_name="Agent1",
            agent_id="a1",
            input_message="msg",
            output_response="resp",
            model_used="test",
            triggered_by="system",
            contract_id="CON-ASYNC-001",
        )

        entries = await logger.get_by_contract("CON-ASYNC-001")
        assert len(entries) == 1

    @pytest.mark.asyncio
    async def test_decision_chain(self, tmp_path):
        db_path = str(tmp_path / "async_chain.db")
        logger = AsyncAuditLogger(db_path)

        for i in range(3):
            await logger.log_agent_call(
                agent_name=f"Agent{i}",
                agent_id=f"a{i}",
                input_message=f"input-{i}",
                output_response=f"output-{i}",
                model_used="test",
                triggered_by="system",
                requisition_id="REQ-CHAIN-001",
                duration_ms=100 * (i + 1),
            )

        chain = await logger.get_decision_chain("REQ-CHAIN-001")
        assert len(chain) == 3
        assert chain[0]["step"] == 1
        assert chain[2]["step"] == 3

    @pytest.mark.asyncio
    async def test_summary_stats(self, tmp_path):
        db_path = str(tmp_path / "async_stats.db")
        logger = AsyncAuditLogger(db_path)

        for i in range(2):
            await logger.log_agent_call(
                agent_name=f"Agent{i}",
                agent_id=f"a{i}",
                input_message=f"msg-{i}",
                output_response=f"resp-{i}",
                model_used="test",
                triggered_by="system",
                requisition_id="REQ-STATS-001",
                duration_ms=100 * (i + 1),
                cost_total_usd=0.01 * (i + 1),
            )

        stats = await logger.get_summary_stats("REQ-STATS-001")
        assert stats["total_entries"] == 2
        assert stats["total_duration_ms"] == 300
        assert stats["total_cost_usd"] == pytest.approx(0.03)

    @pytest.mark.asyncio
    async def test_summary_stats_empty(self, tmp_path):
        db_path = str(tmp_path / "async_empty.db")
        logger = AsyncAuditLogger(db_path)
        stats = await logger.get_summary_stats("NONEXISTENT")
        assert stats["total_entries"] == 0
