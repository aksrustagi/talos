"""
Audit DB Schema Migrations

Simple forward-only migration system.  Each migration is a (version, sql) tuple.
The current version is stored in a `schema_version` table.
"""

MIGRATIONS: list[tuple[int, str]] = [
    # Version 1 — initial schema
    (1, """
    CREATE TABLE IF NOT EXISTS audit_log (
        id                TEXT PRIMARY KEY,
        timestamp         TEXT NOT NULL,
        agent_name        TEXT NOT NULL,
        agent_id          TEXT NOT NULL,

        input_message     TEXT NOT NULL,
        input_context     TEXT,
        output_response   TEXT NOT NULL,
        output_tool_calls TEXT,
        output_actions    TEXT,

        model_used        TEXT NOT NULL,
        cost_input_tokens INTEGER DEFAULT 0,
        cost_output_tokens INTEGER DEFAULT 0,
        cost_total_usd    REAL DEFAULT 0.0,

        decision_made     TEXT,
        decision_reasoning TEXT,

        requisition_id    TEXT,
        po_id             TEXT,
        contract_id       TEXT,

        triggered_by      TEXT NOT NULL CHECK(triggered_by IN ('user', 'system')),
        user_id           TEXT,
        user_email        TEXT,
        university_id     TEXT,

        workflow_run_id   TEXT,
        workflow_step     TEXT,
        parent_audit_id   TEXT,

        duration_ms       INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_audit_requisition ON audit_log(requisition_id);
    CREATE INDEX IF NOT EXISTS idx_audit_po ON audit_log(po_id);
    CREATE INDEX IF NOT EXISTS idx_audit_contract ON audit_log(contract_id);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_agent ON audit_log(agent_id);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_workflow ON audit_log(workflow_run_id);
    CREATE INDEX IF NOT EXISTS idx_audit_university ON audit_log(university_id);

    -- Enforce append-only
    CREATE TRIGGER IF NOT EXISTS prevent_audit_update
    BEFORE UPDATE ON audit_log
    BEGIN
        SELECT RAISE(ABORT, 'audit_log is append-only: updates are not allowed');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_audit_delete
    BEFORE DELETE ON audit_log
    BEGIN
        SELECT RAISE(ABORT, 'audit_log is append-only: deletes are not allowed');
    END;
    """),

    # Version 2 — add error_message column for capturing agent failures
    (2, """
    ALTER TABLE audit_log ADD COLUMN error_message TEXT;
    """),
]


async def apply_migrations(db) -> int:
    """Apply any pending migrations. Returns the final schema version."""
    await db.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)"
    )
    await db.commit()

    rows = await db.execute_fetchall(
        "SELECT COALESCE(MAX(version), 0) AS v FROM schema_version"
    )
    current = rows[0][0] if rows else 0

    for version, sql in MIGRATIONS:
        if version > current:
            await db.executescript(sql)
            await db.execute(
                "INSERT INTO schema_version (version) VALUES (?)", (version,)
            )
            await db.commit()
            current = version

    return current
