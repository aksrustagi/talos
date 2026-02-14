"""
Audit Trail Package

Provides append-only audit logging and PDF report generation
for procurement AI agent decisions.
"""

from .audit_log import AuditLogger, get_audit_logger, init_db


def generate_audit_pdf(*args, **kwargs):
    """Lazy wrapper — imports fpdf only when PDF generation is actually needed."""
    from .pdf_export import generate_audit_pdf as _generate
    return _generate(*args, **kwargs)


__all__ = [
    "AuditLogger",
    "get_audit_logger",
    "init_db",
    "generate_audit_pdf",
]
