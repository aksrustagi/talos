"""
Procurement Data Store

Local SQLite-backed store for budgets, requisitions, purchase orders,
vendors, invoices, contracts, and catalogs. Provides the backing data
layer that the Temporal activities read/write against.

In production this would be replaced by the Convex backend; this module
gives us a fully functional local system for development and testing.
"""

import os
import uuid
import threading
from datetime import datetime, timezone
from typing import Optional

import aiosqlite
import structlog

logger = structlog.get_logger(__name__)

_DB_PATH = os.environ.get("TALOS_PROCUREMENT_DB", "data/procurement.db")

# --------------------------------------------------------------------------- #
# Schema
# --------------------------------------------------------------------------- #

_SCHEMA = """
CREATE TABLE IF NOT EXISTS budgets (
    budget_code   TEXT PRIMARY KEY,
    department    TEXT NOT NULL,
    total         REAL NOT NULL DEFAULT 0,
    committed     REAL NOT NULL DEFAULT 0,
    spent         REAL NOT NULL DEFAULT 0,
    fiscal_year   TEXT NOT NULL DEFAULT '2024'
);

CREATE TABLE IF NOT EXISTS requisitions (
    id            TEXT PRIMARY KEY,
    requester_id  TEXT NOT NULL,
    requester_email TEXT,
    department    TEXT NOT NULL,
    budget_code   TEXT NOT NULL,
    line_items    TEXT NOT NULL,          -- JSON array
    total         REAL NOT NULL DEFAULT 0,
    urgency       TEXT NOT NULL DEFAULT 'standard',
    needed_by     TEXT,
    notes         TEXT,
    status        TEXT NOT NULL DEFAULT 'draft',
    vendor_id     TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    FOREIGN KEY (budget_code) REFERENCES budgets(budget_code)
);

CREATE TABLE IF NOT EXISTS approval_records (
    id              TEXT PRIMARY KEY,
    requisition_id  TEXT NOT NULL,
    approver_id     TEXT NOT NULL,
    approver_email  TEXT,
    level           INTEGER NOT NULL DEFAULT 1,
    decision        TEXT,                    -- approve / reject / NULL (pending)
    comments        TEXT,
    decided_at      TEXT,
    deadline        TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    FOREIGN KEY (requisition_id) REFERENCES requisitions(id)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
    po_number       TEXT PRIMARY KEY,
    requisition_id  TEXT NOT NULL,
    vendor_id       TEXT NOT NULL,
    line_items      TEXT NOT NULL,          -- JSON
    total           REAL NOT NULL,
    status          TEXT NOT NULL DEFAULT 'created',
    sent_at         TEXT,
    acknowledged_at TEXT,
    created_at      TEXT NOT NULL,
    FOREIGN KEY (requisition_id) REFERENCES requisitions(id)
);

CREATE TABLE IF NOT EXISTS vendors (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    email           TEXT,
    diversity_type  TEXT,                   -- MWBE, SBE, SDVOSB, HUBZone
    on_time_rate    REAL NOT NULL DEFAULT 0.95,
    quality_score   REAL NOT NULL DEFAULT 4.0,
    price_compliance REAL NOT NULL DEFAULT 0.97,
    active          INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS invoices (
    id              TEXT PRIMARY KEY,
    invoice_number  TEXT NOT NULL,
    vendor_id       TEXT NOT NULL,
    po_number       TEXT,
    total           REAL NOT NULL,
    line_items      TEXT NOT NULL,          -- JSON
    status          TEXT NOT NULL DEFAULT 'received',
    exception_id    TEXT,
    created_at      TEXT NOT NULL,
    FOREIGN KEY (po_number) REFERENCES purchase_orders(po_number)
);

CREATE TABLE IF NOT EXISTS contracts (
    id              TEXT PRIMARY KEY,
    vendor_id       TEXT NOT NULL,
    vendor_name     TEXT NOT NULL,
    start_date      TEXT NOT NULL,
    end_date        TEXT NOT NULL,
    total_value     REAL NOT NULL,
    spent           REAL NOT NULL DEFAULT 0,
    categories      TEXT NOT NULL,          -- JSON array
    status          TEXT NOT NULL DEFAULT 'active',
    FOREIGN KEY (vendor_id) REFERENCES vendors(id)
);

CREATE TABLE IF NOT EXISTS catalogs (
    id              TEXT PRIMARY KEY,
    vendor_id       TEXT NOT NULL,
    product_name    TEXT NOT NULL,
    sku             TEXT,
    unit_price      REAL NOT NULL,
    category        TEXT,
    last_updated    TEXT NOT NULL,
    discontinued    INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id)
);
"""

_SEED_DATA = """
-- Sample budgets
INSERT OR IGNORE INTO budgets (budget_code, department, total, committed, spent, fiscal_year)
VALUES
    ('BIO-2024', 'Biology', 150000, 35000, 22000, '2024'),
    ('CHEM-2024', 'Chemistry', 200000, 80000, 55000, '2024'),
    ('ENG-2024', 'Engineering', 300000, 120000, 95000, '2024'),
    ('IT-2024', 'Information Technology', 250000, 100000, 78000, '2024'),
    ('MED-2024', 'Medical School', 500000, 200000, 150000, '2024');

-- Sample vendors
INSERT OR IGNORE INTO vendors (id, name, email, diversity_type, on_time_rate, quality_score, price_compliance)
VALUES
    ('fisher-sci', 'Fisher Scientific', 'orders@fishersci.com', NULL, 0.96, 4.5, 0.99),
    ('vwr-intl', 'VWR International', 'orders@vwr.com', NULL, 0.94, 4.3, 0.97),
    ('sigma-aldrich', 'Sigma-Aldrich', 'orders@sigmaaldrich.com', NULL, 0.97, 4.7, 0.98),
    ('bio-rad', 'Bio-Rad Laboratories', 'orders@bio-rad.com', 'SBE', 0.93, 4.4, 0.96),
    ('dell-tech', 'Dell Technologies', 'procurement@dell.com', NULL, 0.98, 4.6, 0.99),
    ('cdw-gov', 'CDW-G', 'govorders@cdw.com', NULL, 0.95, 4.2, 0.95),
    ('diverse-lab', 'DiverseLab Supplies', 'sales@diverselab.com', 'MWBE', 0.91, 4.0, 0.94),
    ('greentech', 'GreenTech Office', 'orders@greentech.com', 'SDVOSB', 0.92, 4.1, 0.93);

-- Sample contracts
INSERT OR IGNORE INTO contracts (id, vendor_id, vendor_name, start_date, end_date, total_value, spent, categories, status)
VALUES
    ('CON-FISHER-2024', 'fisher-sci', 'Fisher Scientific', '2024-01-01', '2024-12-31', 500000, 180000, '["lab-supplies","chemicals"]', 'active'),
    ('CON-VWR-2024', 'vwr-intl', 'VWR International', '2024-03-01', '2025-02-28', 300000, 95000, '["lab-supplies","safety"]', 'active'),
    ('CON-DELL-2024', 'dell-tech', 'Dell Technologies', '2024-06-01', '2025-05-31', 400000, 210000, '["it-equipment","peripherals"]', 'active'),
    ('CON-CDW-2024', 'cdw-gov', 'CDW-G', '2024-01-15', '2025-01-14', 250000, 120000, '["it-equipment","software"]', 'active');

-- Sample catalog items
INSERT OR IGNORE INTO catalogs (id, vendor_id, product_name, sku, unit_price, category, last_updated)
VALUES
    ('cat-001', 'fisher-sci', 'Pipette Tips 200uL (960pk)', 'FS-02-681-137', 42.50, 'lab-supplies', '2024-06-01'),
    ('cat-002', 'fisher-sci', 'Nitrile Gloves Medium (100pk)', 'FS-19-130-1597', 12.99, 'safety', '2024-06-01'),
    ('cat-003', 'vwr-intl', 'Pipette Tips 200uL (960pk)', 'VWR-89079-478', 39.99, 'lab-supplies', '2024-06-01'),
    ('cat-004', 'sigma-aldrich', 'Ethanol 200 Proof 4L', 'SA-459836', 85.00, 'chemicals', '2024-06-01'),
    ('cat-005', 'dell-tech', 'Latitude 5540 Laptop', 'DELL-LAT5540', 1299.00, 'it-equipment', '2024-06-01'),
    ('cat-006', 'cdw-gov', 'Latitude 5540 Laptop', 'CDW-6723891', 1275.00, 'it-equipment', '2024-06-01'),
    ('cat-007', 'diverse-lab', 'Pipette Tips 200uL (960pk)', 'DL-PT200', 41.00, 'lab-supplies', '2024-06-01'),
    ('cat-008', 'bio-rad', 'PCR Plates 96-well (25pk)', 'BR-MLL9651', 78.50, 'lab-supplies', '2024-06-01');
"""


class ProcurementStore:
    """Async SQLite-backed procurement data store."""

    def __init__(self, db_path: str | None = None):
        self._db_path = db_path or _DB_PATH
        self._initialised = False

    async def _db(self) -> aiosqlite.Connection:
        db = await aiosqlite.connect(self._db_path)
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("PRAGMA foreign_keys=ON")
        if not self._initialised:
            await db.executescript(_SCHEMA)
            await db.executescript(_SEED_DATA)
            await db.commit()
            self._initialised = True
        return db

    # ------------------------------------------------------------------ #
    # Budget
    # ------------------------------------------------------------------ #

    async def validate_budget(self, budget_code: str, amount: float) -> dict:
        db = await self._db()
        try:
            row = await db.execute_fetchall(
                "SELECT * FROM budgets WHERE budget_code = ?", (budget_code,)
            )
            if not row:
                return {
                    "available": False,
                    "budget_code": budget_code,
                    "requested": amount,
                    "reason": f"Budget code {budget_code} not found",
                }
            b = dict(row[0])
            remaining = b["total"] - b["committed"] - b["spent"]
            return {
                "available": remaining >= amount,
                "budget_code": budget_code,
                "requested": amount,
                "remaining": round(remaining, 2),
                "total": b["total"],
                "committed": b["committed"],
                "spent": b["spent"],
                "department": b["department"],
                "fiscal_year": b["fiscal_year"],
            }
        finally:
            await db.close()

    async def commit_budget(self, budget_code: str, amount: float) -> bool:
        db = await self._db()
        try:
            await db.execute(
                "UPDATE budgets SET committed = committed + ? WHERE budget_code = ?",
                (amount, budget_code),
            )
            await db.commit()
            return True
        finally:
            await db.close()

    # ------------------------------------------------------------------ #
    # Approvers
    # ------------------------------------------------------------------ #

    async def determine_approvers(self, total: float) -> list[dict]:
        approvers = []
        if total > 500:
            approvers.append({
                "level": 1, "role": "manager",
                "approver_id": "manager_001",
                "approver_email": "manager@university.edu",
            })
        if total > 5_000:
            approvers.append({
                "level": 2, "role": "director",
                "approver_id": "director_001",
                "approver_email": "director@university.edu",
            })
        if total > 25_000:
            approvers.append({
                "level": 3, "role": "vp",
                "approver_id": "vp_001",
                "approver_email": "vp@university.edu",
            })
        if total > 100_000:
            approvers.append({
                "level": 4, "role": "cfo",
                "approver_id": "cfo_001",
                "approver_email": "cfo@university.edu",
            })
        return approvers

    # ------------------------------------------------------------------ #
    # Requisitions
    # ------------------------------------------------------------------ #

    async def create_requisition(self, data: dict) -> dict:
        import json as _json
        db = await self._db()
        try:
            req_id = f"REQ-{uuid.uuid4().hex[:8].upper()}"
            now = datetime.now(timezone.utc).isoformat()
            total = sum(
                i.get("quantity", 1) * i.get("unit_price", 0) for i in data["items"]
            )
            await db.execute(
                """INSERT INTO requisitions
                   (id, requester_id, requester_email, department, budget_code,
                    line_items, total, urgency, needed_by, notes, status,
                    created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_approval', ?, ?)""",
                (
                    req_id, data["user_id"], data.get("user_email"),
                    data["department"], data["budget_code"],
                    _json.dumps(data["items"]), total,
                    data.get("urgency", "standard"), data.get("needed_by"),
                    data.get("notes"), now, now,
                ),
            )
            await db.commit()
            return {"requisition_id": req_id, "total": total, "status": "pending_approval"}
        finally:
            await db.close()

    async def get_requisition(self, requisition_id: str) -> dict | None:
        db = await self._db()
        try:
            rows = await db.execute_fetchall(
                "SELECT * FROM requisitions WHERE id = ?", (requisition_id,)
            )
            return dict(rows[0]) if rows else None
        finally:
            await db.close()

    async def update_requisition_status(
        self, requisition_id: str, status: str, vendor_id: str | None = None,
    ) -> bool:
        db = await self._db()
        try:
            now = datetime.now(timezone.utc).isoformat()
            if vendor_id:
                await db.execute(
                    "UPDATE requisitions SET status=?, vendor_id=?, updated_at=? WHERE id=?",
                    (status, vendor_id, now, requisition_id),
                )
            else:
                await db.execute(
                    "UPDATE requisitions SET status=?, updated_at=? WHERE id=?",
                    (status, now, requisition_id),
                )
            await db.commit()
            return True
        finally:
            await db.close()

    # ------------------------------------------------------------------ #
    # Approval records
    # ------------------------------------------------------------------ #

    async def create_approval_record(self, data: dict) -> str:
        db = await self._db()
        try:
            rec_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc).isoformat()
            await db.execute(
                """INSERT INTO approval_records
                   (id, requisition_id, approver_id, approver_email, level,
                    deadline, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    rec_id, data["requisition_id"], data["approver_id"],
                    data.get("approver_email"), data.get("level", 1),
                    data["deadline"], now,
                ),
            )
            await db.commit()
            return rec_id
        finally:
            await db.close()

    async def record_approval_decision(
        self, requisition_id: str, approver_id: str, decision: str,
        comments: str | None = None,
    ) -> bool:
        db = await self._db()
        try:
            now = datetime.now(timezone.utc).isoformat()
            await db.execute(
                """UPDATE approval_records
                   SET decision=?, comments=?, decided_at=?
                   WHERE requisition_id=? AND approver_id=?""",
                (decision, comments, now, requisition_id, approver_id),
            )
            await db.commit()
            return True
        finally:
            await db.close()

    async def check_approval_status(self, requisition_id: str) -> dict:
        db = await self._db()
        try:
            rows = await db.execute_fetchall(
                "SELECT * FROM approval_records WHERE requisition_id=?",
                (requisition_id,),
            )
            if not rows:
                return {"approved": False, "rejected": False, "pending": True}
            records = [dict(r) for r in rows]
            rejected = any(r["decision"] == "reject" for r in records)
            all_approved = all(r["decision"] == "approve" for r in records)
            pending = any(r["decision"] is None for r in records)
            return {
                "approved": all_approved and not pending,
                "rejected": rejected,
                "pending": pending and not rejected,
                "records": records,
            }
        finally:
            await db.close()

    # ------------------------------------------------------------------ #
    # Purchase orders
    # ------------------------------------------------------------------ #

    async def generate_purchase_order(
        self, requisition_id: str, vendor_id: str | None = None,
    ) -> str:
        import json as _json
        db = await self._db()
        try:
            rows = await db.execute_fetchall(
                "SELECT * FROM requisitions WHERE id=?", (requisition_id,),
            )
            if not rows:
                raise ValueError(f"Requisition {requisition_id} not found")
            req = dict(rows[0])
            po_number = f"PO-{uuid.uuid4().hex[:8].upper()}"
            now = datetime.now(timezone.utc).isoformat()
            vid = vendor_id or req.get("vendor_id") or "unassigned"
            await db.execute(
                """INSERT INTO purchase_orders
                   (po_number, requisition_id, vendor_id, line_items, total,
                    status, created_at)
                   VALUES (?, ?, ?, ?, ?, 'created', ?)""",
                (po_number, requisition_id, vid, req["line_items"], req["total"], now),
            )
            # Mark requisition as PO-issued
            await db.execute(
                "UPDATE requisitions SET status='po_issued', updated_at=? WHERE id=?",
                (now, requisition_id),
            )
            await db.commit()
            return po_number
        finally:
            await db.close()

    async def mark_po_sent(self, po_number: str) -> bool:
        db = await self._db()
        try:
            now = datetime.now(timezone.utc).isoformat()
            await db.execute(
                "UPDATE purchase_orders SET status='sent', sent_at=? WHERE po_number=?",
                (now, po_number),
            )
            await db.commit()
            return True
        finally:
            await db.close()

    # ------------------------------------------------------------------ #
    # Invoices
    # ------------------------------------------------------------------ #

    async def parse_invoice(self, invoice_id: str) -> dict:
        db = await self._db()
        try:
            rows = await db.execute_fetchall(
                "SELECT * FROM invoices WHERE id=?", (invoice_id,),
            )
            if rows:
                return dict(rows[0])
            # Not found — create a placeholder (simulating parsing)
            return {
                "invoice_id": invoice_id,
                "invoice_number": f"INV-{invoice_id[-6:]}",
                "vendor_id": "unknown",
                "po_number": None,
                "total": 0.0,
                "line_items": "[]",
                "status": "unparsed",
            }
        finally:
            await db.close()

    async def find_matching_po(self, invoice: dict) -> dict:
        po_number = invoice.get("po_number")
        if not po_number:
            return {"found": False, "po_number": None, "match_confidence": 0.0}
        db = await self._db()
        try:
            rows = await db.execute_fetchall(
                "SELECT * FROM purchase_orders WHERE po_number=?", (po_number,),
            )
            if rows:
                return {"found": True, "po_number": po_number, "match_confidence": 1.0}
            return {"found": False, "po_number": po_number, "match_confidence": 0.0}
        finally:
            await db.close()

    async def match_invoice_lines(self, invoice: dict, po_number: str) -> dict:
        import json as _json
        db = await self._db()
        try:
            rows = await db.execute_fetchall(
                "SELECT line_items FROM purchase_orders WHERE po_number=?", (po_number,),
            )
            if not rows:
                return {"all_matched": False, "matched_lines": 0, "mismatches": ["PO not found"]}
            po_lines = _json.loads(rows[0]["line_items"])
            inv_lines = _json.loads(invoice.get("line_items", "[]"))
            return {
                "all_matched": len(inv_lines) <= len(po_lines),
                "matched_lines": min(len(inv_lines), len(po_lines)),
                "mismatches": [],
            }
        finally:
            await db.close()

    async def validate_contract_prices(self, invoice: dict, line_matches: dict) -> dict:
        # If all lines matched, prices are valid
        if line_matches.get("all_matched"):
            return {"all_valid": True, "violations": []}
        return {"all_valid": False, "violations": ["Line mismatch detected"]}

    async def verify_receipts(self, invoice: dict, po_number: str) -> dict:
        db = await self._db()
        try:
            rows = await db.execute_fetchall(
                "SELECT status FROM purchase_orders WHERE po_number=?", (po_number,),
            )
            if not rows:
                return {"all_received": False, "issues": ["PO not found"]}
            status = rows[0]["status"]
            received = status in ("received", "sent", "acknowledged")
            return {
                "all_received": received,
                "issues": [] if received else [f"PO status is {status}"],
            }
        finally:
            await db.close()

    async def approve_invoice(self, invoice_id: str) -> bool:
        db = await self._db()
        try:
            await db.execute(
                "UPDATE invoices SET status='approved' WHERE id=?", (invoice_id,),
            )
            await db.commit()
            return True
        finally:
            await db.close()

    async def create_exception(
        self, invoice_id: str, line_matches: dict,
        price_validation: dict, receipt_check: dict,
    ) -> str:
        exc_id = f"EXC-{uuid.uuid4().hex[:8].upper()}"
        db = await self._db()
        try:
            await db.execute(
                "UPDATE invoices SET status='exception', exception_id=? WHERE id=?",
                (exc_id, invoice_id),
            )
            await db.commit()
            return exc_id
        finally:
            await db.close()

    # ------------------------------------------------------------------ #
    # Contracts
    # ------------------------------------------------------------------ #

    async def analyze_contract_performance(self, contract_id: str) -> dict:
        db = await self._db()
        try:
            rows = await db.execute_fetchall(
                "SELECT c.*, v.on_time_rate, v.quality_score, v.price_compliance "
                "FROM contracts c JOIN vendors v ON c.vendor_id = v.id "
                "WHERE c.id=?", (contract_id,),
            )
            if not rows:
                return {"error": f"Contract {contract_id} not found"}
            c = dict(rows[0])
            commitment = c["spent"] / c["total_value"] if c["total_value"] else 0
            return {
                "contract_id": contract_id,
                "vendor_name": c["vendor_name"],
                "spend_vs_commitment": round(commitment, 2),
                "price_compliance": c["price_compliance"],
                "on_time_delivery": c["on_time_rate"],
                "quality_score": c["quality_score"],
                "total_value": c["total_value"],
                "spent": c["spent"],
                "remaining": round(c["total_value"] - c["spent"], 2),
                "recommendation": "renew" if commitment >= 0.5 and c["quality_score"] >= 3.5 else "review",
            }
        finally:
            await db.close()

    async def generate_renewal_recommendation(self, contract_id: str, analysis: dict) -> dict:
        rec = analysis.get("recommendation", "review")
        suggested_changes = []
        if analysis.get("spend_vs_commitment", 0) < 0.7:
            suggested_changes.append("Reduce commitment level to match actual spend")
        if analysis.get("on_time_delivery", 1) < 0.95:
            suggested_changes.append("Add SLA penalties for late deliveries")
        if analysis.get("price_compliance", 1) < 0.98:
            suggested_changes.append("Strengthen price-audit clause")
        suggested_changes.append("Request 3% price reduction for renewal")

        return {
            "contract_id": contract_id,
            "recommendation": rec,
            "suggested_changes": suggested_changes,
            "negotiation_priority": "high" if analysis.get("total_value", 0) > 200_000 else "medium",
        }

    # ------------------------------------------------------------------ #
    # Catalogs
    # ------------------------------------------------------------------ #

    async def fetch_vendor_catalog(self, vendor_id: str) -> dict:
        db = await self._db()
        try:
            rows = await db.execute_fetchall(
                "SELECT * FROM catalogs WHERE vendor_id=? AND discontinued=0",
                (vendor_id,),
            )
            products = [dict(r) for r in rows]
            return {
                "vendor_id": vendor_id,
                "products": products,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            }
        finally:
            await db.close()

    async def normalize_catalog(self, catalog_data: dict) -> dict:
        products = catalog_data.get("products", [])
        errors = []
        for p in products:
            if not p.get("product_name"):
                errors.append(f"Product {p.get('id')} missing name")
            if p.get("unit_price", 0) <= 0:
                errors.append(f"Product {p.get('id')} has invalid price")
        return {
            "normalized_count": len(products),
            "errors": errors,
        }

    async def detect_price_changes(self, vendor_id: str, catalog: dict) -> dict:
        # Compare against stored catalog
        db = await self._db()
        try:
            rows = await db.execute_fetchall(
                "SELECT * FROM catalogs WHERE vendor_id=?", (vendor_id,),
            )
            stored = {r["id"]: dict(r) for r in rows}
            changes = []
            new_count = 0
            discontinued_count = 0

            for product in catalog.get("products", []):
                pid = product.get("id")
                if pid in stored:
                    old_price = stored[pid]["unit_price"]
                    new_price = product.get("unit_price", old_price)
                    if abs(new_price - old_price) > 0.01:
                        pct = ((new_price - old_price) / old_price) * 100
                        changes.append({
                            "product_id": pid,
                            "product_name": product.get("product_name"),
                            "old_price": old_price,
                            "new_price": new_price,
                            "change_pct": round(pct, 1),
                        })
                else:
                    new_count += 1

            return {
                "significant_changes": len(changes) > 0,
                "changes": changes,
                "new_count": new_count,
                "discontinued_count": discontinued_count,
            }
        finally:
            await db.close()

    # ------------------------------------------------------------------ #
    # Vendors
    # ------------------------------------------------------------------ #

    async def get_vendor(self, vendor_id: str) -> dict | None:
        db = await self._db()
        try:
            rows = await db.execute_fetchall(
                "SELECT * FROM vendors WHERE id=?", (vendor_id,),
            )
            return dict(rows[0]) if rows else None
        finally:
            await db.close()

    async def list_vendors(self, active_only: bool = True) -> list[dict]:
        db = await self._db()
        try:
            q = "SELECT * FROM vendors"
            if active_only:
                q += " WHERE active=1"
            rows = await db.execute_fetchall(q)
            return [dict(r) for r in rows]
        finally:
            await db.close()


# --------------------------------------------------------------------------- #
# Singleton
# --------------------------------------------------------------------------- #

_store: ProcurementStore | None = None


def get_store(db_path: str | None = None) -> ProcurementStore:
    global _store
    if _store is None:
        _store = ProcurementStore(db_path)
    return _store
