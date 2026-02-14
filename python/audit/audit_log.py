"""
Append-Only Audit Log for Procurement AI Platform

Records every agent call with full traceability for CFO scrutiny
and federal grant audits. Uses SQLite with enforced append-only
semantics (no UPDATE or DELETE operations).

Answers:
  - "Why did the system choose this vendor?"
  - "Why was this price accepted?"
  - "Who approved this and when?"
"""

import json
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from typing import Optional


# Default database path — configurable via TALOS_AUDIT_DB env var
DEFAULT_DB_PATH = os.environ.get(
    "TALOS_AUDIT_DB",
    os.path.join(os.path.dirname(__file__), "..", "data", "audit.db"),
)


def _get_db_path() -> str:
    path = os.path.abspath(DEFAULT_DB_PATH)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


# Thread-local connections for safe concurrent access
_local = threading.local()


def _get_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    """Get or create a thread-local SQLite connection."""
    path = db_path or _get_db_path()
    key = f"conn_{path}"
    conn = getattr(_local, key, None)
    if conn is None:
        conn = sqlite3.connect(path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        setattr(_local, key, conn)
    return conn


# ============================================
# Schema — append-only audit_log table
# ============================================

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS audit_log (
    id                TEXT PRIMARY KEY,
    timestamp         TEXT NOT NULL,
    agent_name        TEXT NOT NULL,
    agent_id          TEXT NOT NULL,

    -- What was sent to the LLM
    input_message     TEXT NOT NULL,
    input_context     TEXT,           -- JSON blob of full context

    -- What the LLM returned
    output_response   TEXT NOT NULL,
    output_tool_calls TEXT,           -- JSON array of tool calls
    output_actions    TEXT,           -- JSON array of actions taken

    -- Model and cost
    model_used        TEXT NOT NULL,
    cost_input_tokens  INTEGER DEFAULT 0,
    cost_output_tokens INTEGER DEFAULT 0,
    cost_total_usd    REAL DEFAULT 0.0,

    -- Decision traceability
    decision_made     TEXT,
    decision_reasoning TEXT,

    -- Linkage to procurement objects
    requisition_id    TEXT,
    po_id             TEXT,
    contract_id       TEXT,

    -- Who triggered it
    triggered_by      TEXT NOT NULL,  -- 'user' or 'system'
    user_id           TEXT,
    user_email        TEXT,
    university_id     TEXT,

    -- Workflow context
    workflow_run_id   TEXT,
    workflow_step     TEXT,
    parent_audit_id   TEXT,          -- links chained agent calls

    -- Duration
    duration_ms       INTEGER DEFAULT 0
);

-- Indices for common query patterns
CREATE INDEX IF NOT EXISTS idx_audit_requisition
    ON audit_log(requisition_id);
CREATE INDEX IF NOT EXISTS idx_audit_po
    ON audit_log(po_id);
CREATE INDEX IF NOT EXISTS idx_audit_contract
    ON audit_log(contract_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp
    ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_agent
    ON audit_log(agent_name);
CREATE INDEX IF NOT EXISTS idx_audit_user
    ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_workflow
    ON audit_log(workflow_run_id);

-- Prevent UPDATE and DELETE via triggers (append-only enforcement)
CREATE TRIGGER IF NOT EXISTS prevent_audit_update
    BEFORE UPDATE ON audit_log
BEGIN
    SELECT RAISE(ABORT, 'audit_log is append-only: updates are prohibited');
END;

CREATE TRIGGER IF NOT EXISTS prevent_audit_delete
    BEFORE DELETE ON audit_log
BEGIN
    SELECT RAISE(ABORT, 'audit_log is append-only: deletes are prohibited');
END;
"""


def init_db(db_path: Optional[str] = None) -> None:
    """Initialize the audit database schema."""
    conn = _get_connection(db_path)
    conn.executescript(SCHEMA_SQL)
    conn.commit()


# ============================================
# AuditLogger — the primary interface
# ============================================

class AuditLogger:
    """
    Append-only audit logger for agent invocations.

    Usage:
        logger = AuditLogger()
        entry_id = logger.log_agent_call(
            agent_name="RequisitionAgent",
            agent_id="requisition",
            input_message="Create a requisition for 500 pipette tips",
            input_context={"budget_code": "BIO-2024", ...},
            output_response="Requisition REQ-001234 created...",
            output_tool_calls=[...],
            model_used="claude-sonnet-4-20250514",
            triggered_by="user",
            user_id="user_001",
            requisition_id="REQ-001234",
        )
    """

    def __init__(self, db_path: Optional[str] = None):
        self._db_path = db_path
        init_db(db_path)

    def _conn(self) -> sqlite3.Connection:
        return _get_connection(self._db_path)

    def log_agent_call(
        self,
        *,
        agent_name: str,
        agent_id: str,
        input_message: str,
        output_response: str,
        model_used: str,
        triggered_by: str,
        input_context: Optional[dict] = None,
        output_tool_calls: Optional[list] = None,
        output_actions: Optional[list] = None,
        cost_input_tokens: int = 0,
        cost_output_tokens: int = 0,
        cost_total_usd: float = 0.0,
        decision_made: Optional[str] = None,
        decision_reasoning: Optional[str] = None,
        requisition_id: Optional[str] = None,
        po_id: Optional[str] = None,
        contract_id: Optional[str] = None,
        user_id: Optional[str] = None,
        user_email: Optional[str] = None,
        university_id: Optional[str] = None,
        workflow_run_id: Optional[str] = None,
        workflow_step: Optional[str] = None,
        parent_audit_id: Optional[str] = None,
        duration_ms: int = 0,
    ) -> str:
        """
        Record an agent invocation to the audit log.

        Returns the generated audit entry ID.
        """
        entry_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        self._conn().execute(
            """
            INSERT INTO audit_log (
                id, timestamp, agent_name, agent_id,
                input_message, input_context,
                output_response, output_tool_calls, output_actions,
                model_used, cost_input_tokens, cost_output_tokens, cost_total_usd,
                decision_made, decision_reasoning,
                requisition_id, po_id, contract_id,
                triggered_by, user_id, user_email, university_id,
                workflow_run_id, workflow_step, parent_audit_id,
                duration_ms
            ) VALUES (
                ?, ?, ?, ?,
                ?, ?,
                ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?,
                ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?,
                ?
            )
            """,
            (
                entry_id, now, agent_name, agent_id,
                input_message, json.dumps(input_context) if input_context else None,
                output_response,
                json.dumps(output_tool_calls) if output_tool_calls else None,
                json.dumps(output_actions) if output_actions else None,
                model_used, cost_input_tokens, cost_output_tokens, cost_total_usd,
                decision_made, decision_reasoning,
                requisition_id, po_id, contract_id,
                triggered_by, user_id, user_email, university_id,
                workflow_run_id, workflow_step, parent_audit_id,
                duration_ms,
            ),
        )
        self._conn().commit()
        return entry_id

    # ============================================
    # Query methods
    # ============================================

    def get_by_requisition(self, requisition_id: str) -> list[dict]:
        """Get the complete decision chain for a requisition."""
        cursor = self._conn().execute(
            """
            SELECT * FROM audit_log
            WHERE requisition_id = ?
            ORDER BY timestamp ASC
            """,
            (requisition_id,),
        )
        return [dict(row) for row in cursor.fetchall()]

    def get_by_po(self, po_id: str) -> list[dict]:
        """Get all audit entries for a purchase order."""
        cursor = self._conn().execute(
            """
            SELECT * FROM audit_log
            WHERE po_id = ?
            ORDER BY timestamp ASC
            """,
            (po_id,),
        )
        return [dict(row) for row in cursor.fetchall()]

    def get_by_contract(self, contract_id: str) -> list[dict]:
        """Get all audit entries for a contract."""
        cursor = self._conn().execute(
            """
            SELECT * FROM audit_log
            WHERE contract_id = ?
            ORDER BY timestamp ASC
            """,
            (contract_id,),
        )
        return [dict(row) for row in cursor.fetchall()]

    def get_by_workflow(self, workflow_run_id: str) -> list[dict]:
        """Get all audit entries for a workflow run."""
        cursor = self._conn().execute(
            """
            SELECT * FROM audit_log
            WHERE workflow_run_id = ?
            ORDER BY timestamp ASC
            """,
            (workflow_run_id,),
        )
        return [dict(row) for row in cursor.fetchall()]

    def get_by_user(self, user_id: str, limit: int = 100) -> list[dict]:
        """Get recent audit entries for a user."""
        cursor = self._conn().execute(
            """
            SELECT * FROM audit_log
            WHERE user_id = ?
            ORDER BY timestamp DESC
            LIMIT ?
            """,
            (user_id, limit),
        )
        return [dict(row) for row in cursor.fetchall()]

    def get_by_id(self, entry_id: str) -> Optional[dict]:
        """Get a single audit entry by ID."""
        cursor = self._conn().execute(
            "SELECT * FROM audit_log WHERE id = ?",
            (entry_id,),
        )
        row = cursor.fetchone()
        return dict(row) if row else None

    def get_decision_chain(self, requisition_id: str) -> list[dict]:
        """
        Build a human-readable decision chain for a requisition.

        This is the key method for answering audit questions like:
          - "Why did the system choose this vendor?"
          - "Why was this price accepted?"
          - "Who approved this and when?"
        """
        entries = self.get_by_requisition(requisition_id)

        chain = []
        for entry in entries:
            step = {
                "step": len(chain) + 1,
                "timestamp": entry["timestamp"],
                "agent": entry["agent_name"],
                "action": entry["decision_made"] or f"Agent call: {entry['agent_id']}",
                "reasoning": entry["decision_reasoning"] or "See full output for details",
                "input_summary": (entry["input_message"][:200] + "...")
                    if len(entry["input_message"]) > 200
                    else entry["input_message"],
                "output_summary": (entry["output_response"][:200] + "...")
                    if len(entry["output_response"]) > 200
                    else entry["output_response"],
                "model": entry["model_used"],
                "cost_usd": entry["cost_total_usd"],
                "triggered_by": entry["triggered_by"],
                "user_id": entry["user_id"],
                "full_input": entry["input_message"],
                "full_output": entry["output_response"],
                "tool_calls": json.loads(entry["output_tool_calls"])
                    if entry["output_tool_calls"]
                    else [],
                "duration_ms": entry["duration_ms"],
            }
            chain.append(step)

        return chain

    def get_summary_stats(self, requisition_id: str) -> dict:
        """Get summary statistics for a requisition's audit trail."""
        entries = self.get_by_requisition(requisition_id)

        if not entries:
            return {"requisition_id": requisition_id, "total_entries": 0}

        total_cost = sum(e["cost_total_usd"] for e in entries)
        total_tokens_in = sum(e["cost_input_tokens"] for e in entries)
        total_tokens_out = sum(e["cost_output_tokens"] for e in entries)
        total_duration = sum(e["duration_ms"] for e in entries)
        agents_involved = list(set(e["agent_name"] for e in entries))

        return {
            "requisition_id": requisition_id,
            "total_entries": len(entries),
            "first_action": entries[0]["timestamp"],
            "last_action": entries[-1]["timestamp"],
            "agents_involved": agents_involved,
            "total_cost_usd": round(total_cost, 6),
            "total_input_tokens": total_tokens_in,
            "total_output_tokens": total_tokens_out,
            "total_duration_ms": total_duration,
        }


# Module-level singleton for convenience
_default_logger: Optional[AuditLogger] = None


def get_audit_logger(db_path: Optional[str] = None) -> AuditLogger:
    """Get or create the default AuditLogger singleton."""
    global _default_logger
    if _default_logger is None:
        _default_logger = AuditLogger(db_path)
    return _default_logger
