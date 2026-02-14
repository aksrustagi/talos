"""
SQLite database for append-only audit trail.

Design principles:
- APPEND-ONLY: No UPDATE or DELETE operations exposed.
- WAL mode for concurrent read access during report generation.
- Indexed on requisition_id, purchase_order_id, contract_id for fast lookups.
- All writes go through a single insert method.
"""

import sqlite3
import os
import json
from typing import Optional, List
from datetime import datetime

import structlog

from audit.models import AuditEntry

logger = structlog.get_logger()

# Default database path - can be overridden via environment variable
DEFAULT_DB_PATH = os.environ.get(
    "TALOS_AUDIT_DB_PATH",
    os.path.join(os.path.dirname(__file__), "..", "..", "data", "audit_trail.db"),
)

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    agent_tier INTEGER,

    -- Full LLM interaction
    input_text TEXT NOT NULL,
    output_text TEXT NOT NULL,

    -- Model and cost
    model_used TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cost_usd REAL,

    -- Decision
    decision TEXT,
    reasoning TEXT,

    -- Tool calls
    tool_calls TEXT,
    tool_results TEXT,

    -- Procurement linkage
    requisition_id TEXT,
    purchase_order_id TEXT,
    contract_id TEXT,

    -- Trigger info
    triggered_by TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    user_email TEXT,
    user_department TEXT,
    university_id TEXT,

    -- Execution metadata
    execution_id TEXT,
    execution_duration_ms INTEGER
);
"""

CREATE_INDEXES_SQL = [
    "CREATE INDEX IF NOT EXISTS idx_audit_requisition ON audit_log(requisition_id);",
    "CREATE INDEX IF NOT EXISTS idx_audit_po ON audit_log(purchase_order_id);",
    "CREATE INDEX IF NOT EXISTS idx_audit_contract ON audit_log(contract_id);",
    "CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);",
    "CREATE INDEX IF NOT EXISTS idx_audit_agent ON audit_log(agent_name);",
    "CREATE INDEX IF NOT EXISTS idx_audit_triggered_by ON audit_log(triggered_by);",
    "CREATE INDEX IF NOT EXISTS idx_audit_execution ON audit_log(execution_id);",
    "CREATE INDEX IF NOT EXISTS idx_audit_university ON audit_log(university_id);",
]

# Trigger to enforce append-only: block UPDATE and DELETE
APPEND_ONLY_TRIGGERS_SQL = [
    """
    CREATE TRIGGER IF NOT EXISTS audit_no_update
    BEFORE UPDATE ON audit_log
    BEGIN
        SELECT RAISE(ABORT, 'Audit log is append-only. UPDATE operations are prohibited.');
    END;
    """,
    """
    CREATE TRIGGER IF NOT EXISTS audit_no_delete
    BEFORE DELETE ON audit_log
    BEGIN
        SELECT RAISE(ABORT, 'Audit log is append-only. DELETE operations are prohibited.');
    END;
    """,
]


class AuditDatabase:
    """
    Append-only SQLite database for audit trail storage.

    Thread-safe for concurrent reads. All writes are serialized
    through a single connection with WAL mode.
    """

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or DEFAULT_DB_PATH
        self._ensure_directory()
        self._init_db()

    def _ensure_directory(self):
        """Ensure the database directory exists."""
        db_dir = os.path.dirname(os.path.abspath(self.db_path))
        os.makedirs(db_dir, exist_ok=True)

    def _get_connection(self) -> sqlite3.Connection:
        """Get a new database connection."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        return conn

    def _init_db(self):
        """Initialize the database schema."""
        conn = self._get_connection()
        try:
            conn.execute(CREATE_TABLE_SQL)
            for idx_sql in CREATE_INDEXES_SQL:
                conn.execute(idx_sql)
            for trigger_sql in APPEND_ONLY_TRIGGERS_SQL:
                conn.execute(trigger_sql)
            conn.commit()
            logger.info("Audit database initialized", db_path=self.db_path)
        finally:
            conn.close()

    def insert(self, entry: AuditEntry) -> int:
        """
        Insert a single audit log entry. Returns the new row ID.

        This is the ONLY write operation exposed. No update or delete.
        """
        conn = self._get_connection()
        try:
            cursor = conn.execute(
                """
                INSERT INTO audit_log (
                    timestamp, agent_name, agent_tier,
                    input_text, output_text,
                    model_used, input_tokens, output_tokens, cost_usd,
                    decision, reasoning,
                    tool_calls, tool_results,
                    requisition_id, purchase_order_id, contract_id,
                    triggered_by, trigger_type, user_email, user_department,
                    university_id, execution_id, execution_duration_ms
                ) VALUES (
                    ?, ?, ?,
                    ?, ?,
                    ?, ?, ?, ?,
                    ?, ?,
                    ?, ?,
                    ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?
                )
                """,
                (
                    entry.timestamp,
                    entry.agent_name,
                    entry.agent_tier,
                    entry.input_text,
                    entry.output_text,
                    entry.model_used,
                    entry.input_tokens,
                    entry.output_tokens,
                    entry.cost_usd,
                    entry.decision,
                    entry.reasoning,
                    entry.tool_calls,
                    entry.tool_results,
                    entry.requisition_id,
                    entry.purchase_order_id,
                    entry.contract_id,
                    entry.triggered_by,
                    entry.trigger_type,
                    entry.user_email,
                    entry.user_department,
                    entry.university_id,
                    entry.execution_id,
                    entry.execution_duration_ms,
                ),
            )
            conn.commit()
            row_id = cursor.lastrowid
            logger.info(
                "Audit entry recorded",
                row_id=row_id,
                agent=entry.agent_name,
                requisition_id=entry.requisition_id,
            )
            return row_id
        finally:
            conn.close()

    def query_by_requisition(self, requisition_id: str) -> List[AuditEntry]:
        """Get all audit entries for a given requisition, ordered by timestamp."""
        conn = self._get_connection()
        try:
            cursor = conn.execute(
                """
                SELECT * FROM audit_log
                WHERE requisition_id = ?
                ORDER BY timestamp ASC
                """,
                (requisition_id,),
            )
            rows = cursor.fetchall()
            return [self._row_to_entry(row) for row in rows]
        finally:
            conn.close()

    def query_by_purchase_order(self, po_id: str) -> List[AuditEntry]:
        """Get all audit entries for a given purchase order."""
        conn = self._get_connection()
        try:
            cursor = conn.execute(
                """
                SELECT * FROM audit_log
                WHERE purchase_order_id = ?
                ORDER BY timestamp ASC
                """,
                (po_id,),
            )
            rows = cursor.fetchall()
            return [self._row_to_entry(row) for row in rows]
        finally:
            conn.close()

    def query_by_contract(self, contract_id: str) -> List[AuditEntry]:
        """Get all audit entries for a given contract."""
        conn = self._get_connection()
        try:
            cursor = conn.execute(
                """
                SELECT * FROM audit_log
                WHERE contract_id = ?
                ORDER BY timestamp ASC
                """,
                (contract_id,),
            )
            rows = cursor.fetchall()
            return [self._row_to_entry(row) for row in rows]
        finally:
            conn.close()

    def query_by_execution(self, execution_id: str) -> List[AuditEntry]:
        """Get all audit entries for a given execution session."""
        conn = self._get_connection()
        try:
            cursor = conn.execute(
                """
                SELECT * FROM audit_log
                WHERE execution_id = ?
                ORDER BY timestamp ASC
                """,
                (execution_id,),
            )
            rows = cursor.fetchall()
            return [self._row_to_entry(row) for row in rows]
        finally:
            conn.close()

    def query_by_time_range(
        self,
        start: str,
        end: str,
        university_id: Optional[str] = None,
    ) -> List[AuditEntry]:
        """Get all audit entries within a time range."""
        conn = self._get_connection()
        try:
            if university_id:
                cursor = conn.execute(
                    """
                    SELECT * FROM audit_log
                    WHERE timestamp >= ? AND timestamp <= ?
                    AND university_id = ?
                    ORDER BY timestamp ASC
                    """,
                    (start, end, university_id),
                )
            else:
                cursor = conn.execute(
                    """
                    SELECT * FROM audit_log
                    WHERE timestamp >= ? AND timestamp <= ?
                    ORDER BY timestamp ASC
                    """,
                    (start, end),
                )
            rows = cursor.fetchall()
            return [self._row_to_entry(row) for row in rows]
        finally:
            conn.close()

    def count_by_requisition(self, requisition_id: str) -> int:
        """Count audit entries for a requisition."""
        conn = self._get_connection()
        try:
            cursor = conn.execute(
                "SELECT COUNT(*) FROM audit_log WHERE requisition_id = ?",
                (requisition_id,),
            )
            return cursor.fetchone()[0]
        finally:
            conn.close()

    def _row_to_entry(self, row: sqlite3.Row) -> AuditEntry:
        """Convert a database row to an AuditEntry."""
        return AuditEntry(
            id=row["id"],
            timestamp=row["timestamp"],
            agent_name=row["agent_name"],
            agent_tier=row["agent_tier"],
            input_text=row["input_text"],
            output_text=row["output_text"],
            model_used=row["model_used"],
            input_tokens=row["input_tokens"],
            output_tokens=row["output_tokens"],
            cost_usd=row["cost_usd"],
            decision=row["decision"],
            reasoning=row["reasoning"],
            tool_calls=row["tool_calls"],
            tool_results=row["tool_results"],
            requisition_id=row["requisition_id"],
            purchase_order_id=row["purchase_order_id"],
            contract_id=row["contract_id"],
            triggered_by=row["triggered_by"],
            trigger_type=row["trigger_type"],
            user_email=row["user_email"],
            user_department=row["user_department"],
            university_id=row["university_id"],
            execution_id=row["execution_id"],
            execution_duration_ms=row["execution_duration_ms"],
        )
