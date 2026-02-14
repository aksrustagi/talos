"""
PDF Audit Report Generator

Generates formatted PDF audit reports suitable for CFO review
and federal grant audit documentation.
"""

import json
import os
from datetime import datetime, timezone
from typing import Optional

from fpdf import FPDF

from audit.audit_log import AuditLogger, get_audit_logger


class AuditReportPDF(FPDF):
    """Custom PDF class with header/footer for audit reports."""

    def __init__(self, requisition_id: str, **kwargs):
        super().__init__(**kwargs)
        self.requisition_id = requisition_id
        self.set_auto_page_break(auto=True, margin=25)

    def header(self):
        self.set_font("Helvetica", "B", 10)
        self.cell(0, 6, "TALOS PROCUREMENT AI PLATFORM", align="L")
        self.cell(0, 6, "CONFIDENTIAL - AUDIT DOCUMENT", align="R", new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 8)
        self.cell(
            0, 5,
            f"Requisition: {self.requisition_id}    |    Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}",
            align="L", new_x="LMARGIN", new_y="NEXT",
        )
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(4)

    def footer(self):
        self.set_y(-20)
        self.set_font("Helvetica", "I", 7)
        self.cell(0, 5, f"Page {self.page_no()}/{{nb}}", align="C", new_x="LMARGIN", new_y="NEXT")
        self.cell(
            0, 5,
            "This report is auto-generated from the append-only audit log. "
            "Records cannot be modified or deleted after creation.",
            align="C",
        )


def _safe_text(value) -> str:
    """Convert a value to safe text for PDF output."""
    if value is None:
        return "N/A"
    if isinstance(value, (dict, list)):
        return json.dumps(value, indent=2, default=str)
    return str(value)


def _truncate(text: str, max_len: int = 500) -> str:
    if len(text) <= max_len:
        return text
    return text[:max_len] + "... [truncated]"


def generate_audit_pdf(
    requisition_id: str,
    output_path: Optional[str] = None,
    audit_logger: Optional[AuditLogger] = None,
) -> str:
    """
    Generate a PDF audit report for a requisition.

    Args:
        requisition_id: The requisition to generate the report for.
        output_path: Optional file path. If None, generates to a temp location.
        audit_logger: Optional AuditLogger instance. Uses default if None.

    Returns:
        The file path of the generated PDF.
    """
    logger = audit_logger or get_audit_logger()
    entries = logger.get_by_requisition(requisition_id)
    stats = logger.get_summary_stats(requisition_id)
    chain = logger.get_decision_chain(requisition_id)

    pdf = AuditReportPDF(requisition_id)
    pdf.alias_nb_pages()
    pdf.add_page()

    # ==========================================
    # Title
    # ==========================================
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 12, "AI Decision Audit Report", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 8, f"Requisition ID: {requisition_id}", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    # ==========================================
    # Section 1: Executive Summary
    # ==========================================
    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(0, 8, "1. Executive Summary", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    pdf.set_font("Helvetica", "", 10)

    summary_lines = [
        f"Total Agent Calls: {stats.get('total_entries', 0)}",
        f"Agents Involved: {', '.join(stats.get('agents_involved', []))}",
        f"First Action: {stats.get('first_action', 'N/A')}",
        f"Last Action: {stats.get('last_action', 'N/A')}",
        f"Total AI Cost: ${stats.get('total_cost_usd', 0):.4f}",
        f"Total Input Tokens: {stats.get('total_input_tokens', 0):,}",
        f"Total Output Tokens: {stats.get('total_output_tokens', 0):,}",
        f"Total Processing Time: {stats.get('total_duration_ms', 0):,} ms",
    ]
    for line in summary_lines:
        pdf.cell(0, 6, line, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # ==========================================
    # Section 2: Decision Chain
    # ==========================================
    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(0, 8, "2. Decision Chain", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    pdf.multi_cell(0, 5, (
        "Each step below represents an AI agent invocation in the decision process. "
        "The chain shows the complete reasoning path from request to final decision."
    ))
    pdf.ln(3)

    for step in chain:
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_fill_color(230, 230, 240)
        pdf.cell(
            0, 7,
            f"Step {step['step']}: {step['agent']} ({step['timestamp']})",
            fill=True, new_x="LMARGIN", new_y="NEXT",
        )
        pdf.ln(1)

        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(35, 5, "Triggered By:")
        pdf.set_font("Helvetica", "", 9)
        pdf.cell(0, 5, f"{step['triggered_by']} (user: {step['user_id'] or 'N/A'})", new_x="LMARGIN", new_y="NEXT")

        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(35, 5, "Action:")
        pdf.set_font("Helvetica", "", 9)
        pdf.cell(0, 5, _safe_text(step["action"]), new_x="LMARGIN", new_y="NEXT")

        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(35, 5, "Model:")
        pdf.set_font("Helvetica", "", 9)
        pdf.cell(0, 5, f"{step['model']}  |  Cost: ${step['cost_usd']:.4f}  |  Duration: {step['duration_ms']}ms", new_x="LMARGIN", new_y="NEXT")

        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(0, 5, "Input:", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Courier", "", 8)
        pdf.multi_cell(0, 4, _truncate(step["full_input"], 800))
        pdf.ln(1)

        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(0, 5, "Output:", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Courier", "", 8)
        pdf.multi_cell(0, 4, _truncate(step["full_output"], 800))
        pdf.ln(1)

        if step["reasoning"] and step["reasoning"] != "See full output for details":
            pdf.set_font("Helvetica", "B", 9)
            pdf.cell(0, 5, "Reasoning:", new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("Helvetica", "I", 9)
            pdf.multi_cell(0, 4, _truncate(step["reasoning"], 500))
            pdf.ln(1)

        if step["tool_calls"]:
            pdf.set_font("Helvetica", "B", 9)
            pdf.cell(0, 5, "Tool Calls:", new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("Courier", "", 8)
            for tc in step["tool_calls"][:10]:
                tc_text = f"  - {tc.get('name', 'unknown')}({json.dumps(tc.get('args', {}), default=str)[:200]})"
                pdf.multi_cell(0, 4, tc_text)
            pdf.ln(1)

        pdf.ln(3)

    # ==========================================
    # Section 3: Full Audit Log Entries
    # ==========================================
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(0, 8, "3. Complete Audit Log Entries", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    pdf.multi_cell(0, 5, (
        "Raw audit log records. Each record is immutable and stored in an "
        "append-only SQLite database with triggers preventing modification or deletion."
    ))
    pdf.ln(3)

    for i, entry in enumerate(entries):
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_fill_color(240, 240, 245)
        pdf.cell(
            0, 6,
            f"Record {i + 1} of {len(entries)}  |  ID: {entry['id']}",
            fill=True, new_x="LMARGIN", new_y="NEXT",
        )
        pdf.set_font("Courier", "", 7)

        fields = [
            ("Timestamp", entry["timestamp"]),
            ("Agent", f"{entry['agent_name']} ({entry['agent_id']})"),
            ("Model", entry["model_used"]),
            ("Triggered By", f"{entry['triggered_by']} | User: {entry.get('user_id', 'N/A')}"),
            ("Requisition", entry.get("requisition_id", "N/A")),
            ("PO", entry.get("po_id", "N/A")),
            ("Contract", entry.get("contract_id", "N/A")),
            ("Decision", entry.get("decision_made", "N/A")),
            ("Cost (USD)", f"${entry.get('cost_total_usd', 0):.4f}"),
            ("Tokens In/Out", f"{entry.get('cost_input_tokens', 0)} / {entry.get('cost_output_tokens', 0)}"),
            ("Duration", f"{entry.get('duration_ms', 0)} ms"),
            ("Workflow Run", entry.get("workflow_run_id", "N/A")),
        ]

        for label, value in fields:
            pdf.cell(0, 4, f"  {label}: {_safe_text(value)}", new_x="LMARGIN", new_y="NEXT")

        pdf.ln(2)

    # ==========================================
    # Section 4: Integrity Statement
    # ==========================================
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(0, 8, "4. Data Integrity Statement", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    pdf.set_font("Helvetica", "", 10)
    integrity_text = (
        "This audit report was generated from an append-only SQLite database. "
        "The database enforces immutability through SQL triggers that prevent "
        "UPDATE and DELETE operations on the audit_log table. Each record is "
        "assigned a UUID at creation time and timestamped in UTC.\n\n"
        "The audit trail captures the complete input and output of every AI "
        "agent invocation, including the model used, token counts, cost, and "
        "the agent's decision reasoning. This provides full traceability for "
        "every automated decision in the procurement process.\n\n"
        "For questions about this report, contact the Procurement Systems team."
    )
    pdf.multi_cell(0, 6, integrity_text)

    # ==========================================
    # Write PDF
    # ==========================================
    if output_path is None:
        output_dir = os.path.join(os.path.dirname(__file__), "..", "data", "reports")
        os.makedirs(output_dir, exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        output_path = os.path.join(output_dir, f"audit_{requisition_id}_{timestamp}.pdf")

    output_path = os.path.abspath(output_path)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    pdf.output(output_path)
    return output_path
