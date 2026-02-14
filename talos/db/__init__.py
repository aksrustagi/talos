"""
Talos DB — SQLite storage for requisitions, savings, costs, and conversations.

Game-changing decision #5: ZERO-CONFIG PERSISTENCE
- SQLite = no database server to install, configure, or manage
- File-based = portable, works everywhere (dev, CI, prod)
- JSON columns = flexible schema evolution without migrations
- Full audit trail of every LLM call and decision
"""
from __future__ import annotations

import json
import sqlite3
import logging
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from ..schemas import RequisitionPipeline, SavingsRecord, ConversationSession, ChatMessage

log = logging.getLogger("talos.db")


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class TalosDB:
    """
    SQLite database for Talos. Stores pipeline results, savings, conversations, and costs.
    """

    def __init__(self, db_path: str = "talos.db"):
        self.db_path = db_path
        self._persistent_conn: sqlite3.Connection | None = None
        self._init_db()

    @contextmanager
    def _conn(self):
        """Context manager that properly manages connections.
        In-memory DBs reuse a persistent connection; file DBs open/close per operation.
        """
        if self.db_path == ":memory:":
            if self._persistent_conn is None:
                self._persistent_conn = sqlite3.connect(":memory:", check_same_thread=False)
                self._persistent_conn.row_factory = sqlite3.Row
            yield self._persistent_conn
        else:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            try:
                yield conn
                conn.commit()
            finally:
                conn.close()

    def _init_db(self):
        with self._conn() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS pipelines (
                    id TEXT PRIMARY KEY,
                    raw_text TEXT,
                    requester_name TEXT,
                    department TEXT,
                    status TEXT,
                    client_type TEXT,
                    estimated_total REAL DEFAULT 0,
                    category TEXT DEFAULT '',
                    llm_cost REAL DEFAULT 0,
                    data JSON,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS savings (
                    savings_id TEXT PRIMARY KEY,
                    pipeline_id TEXT,
                    category TEXT,
                    description TEXT,
                    baseline_price REAL,
                    new_price REAL,
                    volume INTEGER,
                    total_savings REAL,
                    talos_share REAL,
                    confidence REAL,
                    verification_method TEXT,
                    period TEXT,
                    data JSON,
                    created_at TEXT DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS llm_calls (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    pipeline_id TEXT,
                    agent TEXT,
                    model TEXT,
                    tokens_in INTEGER,
                    tokens_out INTEGER,
                    cost REAL,
                    latency_ms REAL,
                    success INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS historical_orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    po_number TEXT,
                    vendor_name TEXT,
                    category TEXT,
                    item_description TEXT,
                    quantity INTEGER,
                    unit_price REAL,
                    total REAL,
                    department TEXT,
                    order_date TEXT,
                    data JSON
                );

                CREATE TABLE IF NOT EXISTS conversations (
                    session_id TEXT PRIMARY KEY,
                    requester_name TEXT DEFAULT '',
                    department TEXT DEFAULT '',
                    pipeline_id TEXT,
                    status TEXT DEFAULT 'active',
                    data JSON,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS vendor_memory (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    vendor_name TEXT,
                    item_category TEXT,
                    last_price REAL,
                    best_price REAL,
                    contract_price REAL,
                    last_updated TEXT DEFAULT (datetime('now')),
                    notes TEXT DEFAULT '',
                    data JSON
                );

                CREATE INDEX IF NOT EXISTS idx_pipelines_status ON pipelines(status);
                CREATE INDEX IF NOT EXISTS idx_savings_period ON savings(period);
                CREATE INDEX IF NOT EXISTS idx_orders_category ON historical_orders(category);
                CREATE INDEX IF NOT EXISTS idx_orders_vendor ON historical_orders(vendor_name);
                CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
                CREATE INDEX IF NOT EXISTS idx_vendor_memory_name ON vendor_memory(vendor_name);
                CREATE INDEX IF NOT EXISTS idx_vendor_memory_category ON vendor_memory(item_category);
            """)
        log.info(f"Database initialized: {self.db_path}")

    def close(self):
        """Close persistent connection if one exists."""
        if self._persistent_conn:
            self._persistent_conn.close()
            self._persistent_conn = None

    @staticmethod
    def _escape_like(value: str) -> str:
        """Escape special characters for LIKE queries to prevent injection."""
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

    # ---- Pipeline CRUD ----

    def save_pipeline(self, pipe: RequisitionPipeline, client_type: str = "university"):
        with self._conn() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO pipelines
                   (id, raw_text, requester_name, department, status, client_type,
                    estimated_total, category, llm_cost, data, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    pipe.id, pipe.raw_text, pipe.requester_name, pipe.department,
                    pipe.status, client_type,
                    pipe.parsed.estimated_total if pipe.parsed else 0,
                    pipe.parsed.category if pipe.parsed else "",
                    pipe.total_llm_cost, pipe.model_dump_json(),
                    _utcnow_iso(),
                ),
            )
            if pipe.savings:
                self.save_savings(pipe.savings, pipe.id)

    def get_pipeline(self, pipeline_id: str) -> RequisitionPipeline | None:
        with self._conn() as conn:
            row = conn.execute("SELECT data FROM pipelines WHERE id = ?", (pipeline_id,)).fetchone()
            if row:
                return RequisitionPipeline.model_validate_json(row["data"])
        return None

    def list_pipelines(self, limit: int = 50, offset: int = 0, status: str | None = None) -> list[dict]:
        limit = min(limit, 200)
        with self._conn() as conn:
            if status:
                rows = conn.execute(
                    "SELECT id, requester_name, department, status, estimated_total, category, llm_cost, created_at "
                    "FROM pipelines WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
                    (status, limit, offset),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT id, requester_name, department, status, estimated_total, category, llm_cost, created_at "
                    "FROM pipelines ORDER BY created_at DESC LIMIT ? OFFSET ?",
                    (limit, offset),
                ).fetchall()
            return [dict(r) for r in rows]

    # ---- Savings CRUD ----

    def save_savings(self, savings: SavingsRecord, pipeline_id: str = ""):
        with self._conn() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO savings
                   (savings_id, pipeline_id, category, description, baseline_price, new_price,
                    volume, total_savings, talos_share, confidence, verification_method, period, data)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    savings.savings_id, pipeline_id, savings.category, savings.description,
                    savings.baseline_price, savings.new_price, savings.volume,
                    savings.total_savings, savings.talos_share, savings.confidence,
                    savings.verification_method.value, savings.period,
                    savings.model_dump_json(),
                ),
            )

    def list_savings(self, period: str | None = None, limit: int = 50, offset: int = 0) -> list[dict]:
        limit = min(limit, 200)
        with self._conn() as conn:
            if period:
                rows = conn.execute(
                    "SELECT * FROM savings WHERE period = ? ORDER BY total_savings DESC LIMIT ? OFFSET ?",
                    (period, limit, offset),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM savings ORDER BY created_at DESC LIMIT ? OFFSET ?",
                    (limit, offset),
                ).fetchall()
            return [dict(r) for r in rows]

    def savings_summary(self) -> dict:
        with self._conn() as conn:
            row = conn.execute("""
                SELECT
                    COUNT(*) as total_records,
                    COALESCE(SUM(total_savings), 0) as total_savings,
                    COALESCE(SUM(talos_share), 0) as total_talos_share,
                    COALESCE(AVG(confidence), 0) as avg_confidence
                FROM savings
            """).fetchone()
            return dict(row) if row else {}

    # ---- Conversation CRUD (Decision #2: doanything-style UX) ----

    def save_conversation(self, session: ConversationSession):
        with self._conn() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO conversations
                   (session_id, requester_name, department, pipeline_id, status, data, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    session.session_id, session.requester_name, session.department,
                    session.pipeline_id, session.status,
                    session.model_dump_json(),
                    _utcnow_iso(),
                ),
            )

    def get_conversation(self, session_id: str) -> ConversationSession | None:
        with self._conn() as conn:
            row = conn.execute("SELECT data FROM conversations WHERE session_id = ?", (session_id,)).fetchone()
            if row:
                return ConversationSession.model_validate_json(row["data"])
        return None

    def list_conversations(self, limit: int = 20, offset: int = 0, status: str = "active") -> list[dict]:
        limit = min(limit, 200)
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT session_id, requester_name, department, pipeline_id, status, created_at "
                "FROM conversations WHERE status = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                (status, limit, offset),
            ).fetchall()
            return [dict(r) for r in rows]

    # ---- Vendor Memory (Decision #8: vendor intelligence) ----

    def save_vendor_price(self, vendor_name: str, item_category: str, price: float,
                          contract_price: float | None = None, notes: str = ""):
        with self._conn() as conn:
            existing = conn.execute(
                "SELECT id, best_price FROM vendor_memory WHERE vendor_name = ? AND item_category = ?",
                (vendor_name, item_category),
            ).fetchone()

            if existing:
                best = min(existing["best_price"], price) if existing["best_price"] else price
                conn.execute(
                    """UPDATE vendor_memory SET last_price = ?, best_price = ?,
                       contract_price = COALESCE(?, contract_price),
                       last_updated = ?, notes = ? WHERE id = ?""",
                    (price, best, contract_price, _utcnow_iso(), notes, existing["id"]),
                )
            else:
                conn.execute(
                    """INSERT INTO vendor_memory (vendor_name, item_category, last_price, best_price, contract_price, notes)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (vendor_name, item_category, price, price, contract_price, notes),
                )

    def get_vendor_prices(self, item_category: str) -> list[dict]:
        escaped = self._escape_like(item_category)
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT vendor_name, last_price, best_price, contract_price, last_updated, notes "
                "FROM vendor_memory WHERE item_category LIKE ? ESCAPE '\\' ORDER BY best_price ASC",
                (f"%{escaped}%",),
            ).fetchall()
            return [dict(r) for r in rows]

    # ---- Historical Orders ----

    def import_orders(self, orders: list[dict]):
        """Import historical PO data (from CSV or API)."""
        with self._conn() as conn:
            for order in orders:
                conn.execute(
                    """INSERT INTO historical_orders
                       (po_number, vendor_name, category, item_description, quantity,
                        unit_price, total, department, order_date, data)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        order.get("po_number", ""), order.get("vendor_name", ""),
                        order.get("category", ""), order.get("item_description", ""),
                        order.get("quantity", 0), order.get("unit_price", 0),
                        order.get("total", 0), order.get("department", ""),
                        order.get("order_date", ""), json.dumps(order),
                    ),
                )
        log.info(f"Imported {len(orders)} historical orders")

    def find_similar_orders(self, category: str, days_back: int = 90) -> list[dict]:
        escaped = self._escape_like(category)
        with self._conn() as conn:
            rows = conn.execute(
                """SELECT po_number, vendor_name, item_description, quantity, unit_price,
                          total, department, order_date
                   FROM historical_orders
                   WHERE category LIKE ? ESCAPE '\\'
                   ORDER BY order_date DESC LIMIT 20""",
                (f"%{escaped}%",),
            ).fetchall()
            return [dict(r) for r in rows]

    # ---- LLM Cost Tracking ----

    def save_llm_calls(self, calls: list, pipeline_id: str = ""):
        with self._conn() as conn:
            for c in calls:
                conn.execute(
                    """INSERT INTO llm_calls (pipeline_id, agent, model, tokens_in, tokens_out, cost, latency_ms, success)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (pipeline_id, c.agent, c.model, c.tokens_in, c.tokens_out, c.cost, c.latency_ms, int(c.success)),
                )

    def cost_summary(self) -> dict:
        with self._conn() as conn:
            row = conn.execute("""
                SELECT
                    COUNT(*) as total_calls,
                    COALESCE(SUM(cost), 0) as total_cost,
                    COALESCE(AVG(latency_ms), 0) as avg_latency
                FROM llm_calls
            """).fetchone()
            by_agent = conn.execute("""
                SELECT agent, COUNT(*) as calls, SUM(cost) as cost, AVG(latency_ms) as avg_latency
                FROM llm_calls GROUP BY agent ORDER BY cost DESC
            """).fetchall()
            return {
                "totals": dict(row) if row else {},
                "by_agent": [dict(r) for r in by_agent],
            }

    # ---- Dashboard Stats ----

    def dashboard(self) -> dict:
        with self._conn() as conn:
            pipelines = conn.execute("SELECT COUNT(*) as n, status FROM pipelines GROUP BY status").fetchall()
            savings = self.savings_summary()
            costs = self.cost_summary()
            conversations = conn.execute("SELECT COUNT(*) as n FROM conversations WHERE status = 'active'").fetchone()
            return {
                "pipelines": {r["status"]: r["n"] for r in pipelines},
                "savings": savings,
                "llm_costs": costs["totals"],
                "active_conversations": conversations["n"] if conversations else 0,
                "roi": (savings.get("total_savings", 0) / max(costs["totals"].get("total_cost", 0.01), 0.01)),
            }
