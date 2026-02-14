"""
Audit Trail Package

Provides append-only audit logging and PDF report generation
for procurement AI agent decisions.
"""

from .audit_log import AuditLogger, get_audit_logger, init_db
from .pdf_export import generate_audit_pdf

__all__ = [
    "AuditLogger",
    "get_audit_logger",
    "init_db",
    "generate_audit_pdf",
]
