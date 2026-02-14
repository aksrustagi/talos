"""
PDF Audit Report Generator

Generates formal audit reports suitable for CFO review and federal grant audits.
Uses fpdf2 for PDF generation - no external services required.
"""

import json
import io
import textwrap
from typing import List, Optional
from datetime import datetime

from fpdf import FPDF

from audit.models import AuditEntry


class AuditPDFExporter:
    """
    Generates PDF audit reports for procurement decision chains.

    Reports include:
    - Executive summary with key facts
    - Complete chronological decision chain
    - Agent-by-agent breakdown with reasoning
    - Full input/output logs (optional)
    - Cost accounting
    - Approval chain documentation
    """

    FONT_FAMILY = "Helvetica"

    def __init__(self):
        pass

    def generate_report(
        self,
        requisition_id: str,
        entries: List[AuditEntry],
        summary: dict,
        include_full_io: bool = True,
        include_tool_calls: bool = True,
    ) -> bytes:
        """
        Generate a PDF audit report and return it as bytes.

        Args:
            requisition_id: The requisition being audited
            entries: All audit log entries for this requisition
            summary: Decision chain summary dict
            include_full_io: Whether to include full LLM input/output
            include_tool_calls: Whether to include tool call details

        Returns:
            PDF file content as bytes
        """
        pdf = FPDF()
        pdf.set_auto_page_break(auto=True, margin=20)

        # -- Title page --
        self._add_title_page(pdf, requisition_id, summary)

        # -- Executive summary --
        self._add_executive_summary(pdf, requisition_id, entries, summary)

        # -- Decision chain timeline --
        self._add_decision_timeline(pdf, entries)

        # -- Detailed entries --
        self._add_detailed_entries(pdf, entries, include_full_io, include_tool_calls)

        # -- Approval chain --
        if summary.get("approval_chain"):
            self._add_approval_chain(pdf, summary)

        # -- Cost summary --
        self._add_cost_summary(pdf, entries)

        # -- Appendix: integrity notice --
        self._add_integrity_notice(pdf, requisition_id, entries)

        return pdf.output()

    def _add_title_page(self, pdf: FPDF, requisition_id: str, summary: dict):
        """Add the title/cover page."""
        pdf.add_page()

        # Title
        pdf.set_font(self.FONT_FAMILY, "B", 24)
        pdf.cell(0, 20, "AI Decision Audit Report", new_x="LMARGIN", new_y="NEXT", align="C")

        pdf.set_font(self.FONT_FAMILY, "", 14)
        pdf.cell(0, 10, "Talos Procurement AI Platform", new_x="LMARGIN", new_y="NEXT", align="C")

        pdf.ln(20)

        # Report details
        pdf.set_font(self.FONT_FAMILY, "B", 12)
        pdf.cell(0, 8, f"Requisition: {requisition_id}", new_x="LMARGIN", new_y="NEXT")

        pdf.set_font(self.FONT_FAMILY, "", 11)
        generated = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        pdf.cell(0, 8, f"Report Generated: {generated}", new_x="LMARGIN", new_y="NEXT")

        if summary.get("first_action"):
            pdf.cell(
                0, 8,
                f"Period: {summary['first_action']} to {summary['last_action']}",
                new_x="LMARGIN", new_y="NEXT",
            )

        pdf.cell(
            0, 8,
            f"Total AI Interactions: {summary.get('total_decisions', 0)} decisions across "
            f"{len(summary.get('agents_involved', []))} agents",
            new_x="LMARGIN", new_y="NEXT",
        )

        total_cost = summary.get("total_cost_usd", 0)
        pdf.cell(0, 8, f"Total AI Cost: ${total_cost:.4f}", new_x="LMARGIN", new_y="NEXT")

        pdf.ln(15)

        # Confidentiality notice
        pdf.set_font(self.FONT_FAMILY, "I", 9)
        pdf.multi_cell(
            0, 5,
            "CONFIDENTIAL - This report contains a complete audit trail of AI-assisted "
            "procurement decisions. It is intended for authorized auditors, compliance "
            "officers, and financial oversight personnel only. This report is generated "
            "from an append-only audit database where records cannot be modified or deleted.",
        )

    def _add_executive_summary(
        self, pdf: FPDF, requisition_id: str, entries: List[AuditEntry], summary: dict
    ):
        """Add executive summary section."""
        pdf.add_page()
        self._section_header(pdf, "1. Executive Summary")

        pdf.set_font(self.FONT_FAMILY, "", 10)

        # Key questions answered
        pdf.set_font(self.FONT_FAMILY, "B", 10)
        pdf.cell(0, 7, "Key Audit Questions:", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font(self.FONT_FAMILY, "", 10)

        final_decision = summary.get("final_decision", "N/A")
        final_reasoning = summary.get("final_reasoning", "N/A")
        agents = ", ".join(summary.get("agents_involved", []))
        vendors = ", ".join(summary.get("vendors_evaluated", [])) or "None evaluated"

        qa_items = [
            (
                "What was the final decision?",
                f"{final_decision}",
            ),
            (
                "Why was this decision made?",
                f"{final_reasoning}",
            ),
            (
                "Which AI agents were involved?",
                f"{agents}",
            ),
            (
                "Which vendors were evaluated?",
                f"{vendors}",
            ),
        ]

        # Add approval info if available
        if summary.get("approval_chain"):
            approvals = summary["approval_chain"]
            last_approval = approvals[-1]
            qa_items.append((
                "Who approved this and when?",
                f"{last_approval.get('email', last_approval.get('by', 'N/A'))} "
                f"at {last_approval.get('timestamp', 'N/A')}",
            ))

        for question, answer in qa_items:
            pdf.set_font(self.FONT_FAMILY, "B", 10)
            pdf.cell(5, 6, "Q:", new_x="RIGHT")
            pdf.set_font(self.FONT_FAMILY, "", 10)
            pdf.cell(0, 6, f" {question}", new_x="LMARGIN", new_y="NEXT")

            pdf.set_font(self.FONT_FAMILY, "B", 10)
            pdf.cell(5, 6, "A:", new_x="RIGHT")
            pdf.set_font(self.FONT_FAMILY, "", 10)
            pdf.multi_cell(0, 6, f" {answer}")
            pdf.ln(2)

    def _add_decision_timeline(self, pdf: FPDF, entries: List[AuditEntry]):
        """Add a chronological timeline of decisions."""
        pdf.add_page()
        self._section_header(pdf, "2. Decision Timeline")

        pdf.set_font(self.FONT_FAMILY, "", 9)

        # Table header
        col_widths = [38, 30, 30, 92]
        headers = ["Timestamp", "Agent", "Decision", "Reasoning"]

        pdf.set_font(self.FONT_FAMILY, "B", 9)
        pdf.set_fill_color(220, 220, 220)
        for i, header in enumerate(headers):
            pdf.cell(col_widths[i], 7, header, border=1, fill=True)
        pdf.ln()

        pdf.set_font(self.FONT_FAMILY, "", 8)
        for entry in entries:
            # Check if we need a new page
            if pdf.get_y() > 260:
                pdf.add_page()
                pdf.set_font(self.FONT_FAMILY, "B", 9)
                pdf.set_fill_color(220, 220, 220)
                for i, header in enumerate(headers):
                    pdf.cell(col_widths[i], 7, header, border=1, fill=True)
                pdf.ln()
                pdf.set_font(self.FONT_FAMILY, "", 8)

            ts = entry.timestamp[:19] if entry.timestamp else ""
            agent = entry.agent_name[:15] if entry.agent_name else ""
            decision = (entry.decision or "")[:18]
            reasoning = (entry.reasoning or "—")[:60]

            pdf.cell(col_widths[0], 6, ts, border=1)
            pdf.cell(col_widths[1], 6, agent, border=1)
            pdf.cell(col_widths[2], 6, decision, border=1)
            pdf.cell(col_widths[3], 6, reasoning, border=1)
            pdf.ln()

    def _add_detailed_entries(
        self,
        pdf: FPDF,
        entries: List[AuditEntry],
        include_full_io: bool,
        include_tool_calls: bool,
    ):
        """Add detailed log entries."""
        pdf.add_page()
        self._section_header(pdf, "3. Detailed Agent Interaction Log")

        for i, entry in enumerate(entries):
            if pdf.get_y() > 230:
                pdf.add_page()

            # Entry header
            pdf.set_font(self.FONT_FAMILY, "B", 10)
            pdf.set_fill_color(240, 240, 240)
            pdf.cell(
                0, 7,
                f"Entry #{entry.id or i + 1} - {entry.agent_name} @ {entry.timestamp}",
                new_x="LMARGIN", new_y="NEXT", fill=True,
            )

            pdf.set_font(self.FONT_FAMILY, "", 9)

            # Metadata
            meta_lines = [
                f"Model: {entry.model_used}",
                f"Triggered by: {entry.triggered_by} ({entry.trigger_type})",
            ]
            if entry.user_email:
                meta_lines.append(f"User: {entry.user_email}")
            if entry.user_department:
                meta_lines.append(f"Department: {entry.user_department}")
            if entry.cost_usd is not None:
                meta_lines.append(f"Cost: ${entry.cost_usd:.6f}")
            if entry.input_tokens is not None:
                meta_lines.append(
                    f"Tokens: {entry.input_tokens} in / {entry.output_tokens} out"
                )
            if entry.execution_duration_ms is not None:
                meta_lines.append(f"Duration: {entry.execution_duration_ms}ms")

            for line in meta_lines:
                pdf.cell(0, 5, f"  {line}", new_x="LMARGIN", new_y="NEXT")

            # Decision
            if entry.decision:
                pdf.ln(2)
                pdf.set_font(self.FONT_FAMILY, "B", 9)
                pdf.cell(0, 5, f"  Decision: {entry.decision}", new_x="LMARGIN", new_y="NEXT")
                pdf.set_font(self.FONT_FAMILY, "", 9)
                if entry.reasoning:
                    wrapped = textwrap.fill(entry.reasoning, width=95)
                    pdf.multi_cell(0, 5, f"  Reasoning: {wrapped}")

            # Full I/O
            if include_full_io:
                pdf.ln(2)
                self._add_text_block(pdf, "INPUT:", entry.input_text)
                self._add_text_block(pdf, "OUTPUT:", entry.output_text)

            # Tool calls
            if include_tool_calls and entry.tool_calls:
                pdf.ln(2)
                self._add_text_block(pdf, "TOOL CALLS:", entry.tool_calls)

            if include_tool_calls and entry.tool_results:
                self._add_text_block(pdf, "TOOL RESULTS:", entry.tool_results)

            pdf.ln(5)

    def _add_approval_chain(self, pdf: FPDF, summary: dict):
        """Add approval chain documentation."""
        pdf.add_page()
        self._section_header(pdf, "4. Approval Chain")

        pdf.set_font(self.FONT_FAMILY, "", 10)

        for i, approval in enumerate(summary["approval_chain"]):
            pdf.set_font(self.FONT_FAMILY, "B", 10)
            pdf.cell(
                0, 7,
                f"Step {i + 1}: {approval.get('decision', 'N/A').upper()}",
                new_x="LMARGIN", new_y="NEXT",
            )

            pdf.set_font(self.FONT_FAMILY, "", 9)
            pdf.cell(0, 5, f"  When: {approval.get('timestamp', 'N/A')}", new_x="LMARGIN", new_y="NEXT")
            pdf.cell(0, 5, f"  By: {approval.get('email', approval.get('by', 'N/A'))}", new_x="LMARGIN", new_y="NEXT")
            if approval.get("reasoning"):
                pdf.multi_cell(0, 5, f"  Reasoning: {approval['reasoning']}")
            pdf.ln(3)

    def _add_cost_summary(self, pdf: FPDF, entries: List[AuditEntry]):
        """Add cost accounting section."""
        if pdf.get_y() > 220:
            pdf.add_page()

        self._section_header(pdf, "5. AI Cost Accounting")

        pdf.set_font(self.FONT_FAMILY, "", 9)

        # Cost by agent
        agent_costs: dict[str, dict] = {}
        for entry in entries:
            name = entry.agent_name
            if name not in agent_costs:
                agent_costs[name] = {
                    "calls": 0,
                    "cost": 0.0,
                    "input_tokens": 0,
                    "output_tokens": 0,
                }
            agent_costs[name]["calls"] += 1
            agent_costs[name]["cost"] += entry.cost_usd or 0
            agent_costs[name]["input_tokens"] += entry.input_tokens or 0
            agent_costs[name]["output_tokens"] += entry.output_tokens or 0

        # Table
        col_widths = [45, 20, 30, 35, 35, 25]
        headers = ["Agent", "Calls", "Cost (USD)", "Input Tokens", "Output Tokens", "Model"]

        pdf.set_font(self.FONT_FAMILY, "B", 9)
        pdf.set_fill_color(220, 220, 220)
        for i, header in enumerate(headers):
            pdf.cell(col_widths[i], 7, header, border=1, fill=True)
        pdf.ln()

        pdf.set_font(self.FONT_FAMILY, "", 8)
        total_cost = 0.0
        for agent_name, data in agent_costs.items():
            total_cost += data["cost"]
            # Find model from entries
            model = next(
                (e.model_used for e in entries if e.agent_name == agent_name),
                "unknown",
            )
            short_model = model.split("-")[1] if "-" in model else model

            pdf.cell(col_widths[0], 6, agent_name[:25], border=1)
            pdf.cell(col_widths[1], 6, str(data["calls"]), border=1, align="R")
            pdf.cell(col_widths[2], 6, f"${data['cost']:.6f}", border=1, align="R")
            pdf.cell(col_widths[3], 6, f"{data['input_tokens']:,}", border=1, align="R")
            pdf.cell(col_widths[4], 6, f"{data['output_tokens']:,}", border=1, align="R")
            pdf.cell(col_widths[5], 6, short_model[:12], border=1)
            pdf.ln()

        # Total row
        pdf.set_font(self.FONT_FAMILY, "B", 8)
        pdf.cell(col_widths[0], 6, "TOTAL", border=1, fill=True)
        pdf.cell(col_widths[1], 6, str(len(entries)), border=1, align="R", fill=True)
        pdf.cell(col_widths[2], 6, f"${total_cost:.6f}", border=1, align="R", fill=True)
        total_in = sum(d["input_tokens"] for d in agent_costs.values())
        total_out = sum(d["output_tokens"] for d in agent_costs.values())
        pdf.cell(col_widths[3], 6, f"{total_in:,}", border=1, align="R", fill=True)
        pdf.cell(col_widths[4], 6, f"{total_out:,}", border=1, align="R", fill=True)
        pdf.cell(col_widths[5], 6, "", border=1, fill=True)
        pdf.ln()

    def _add_integrity_notice(
        self, pdf: FPDF, requisition_id: str, entries: List[AuditEntry]
    ):
        """Add data integrity and provenance notice."""
        if pdf.get_y() > 220:
            pdf.add_page()

        pdf.ln(10)
        self._section_header(pdf, "6. Data Integrity Notice")

        pdf.set_font(self.FONT_FAMILY, "", 9)
        generated = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")

        notice = (
            f"This audit report was generated on {generated} from the Talos Procurement "
            f"AI Platform's append-only audit database. The underlying SQLite database "
            f"enforces immutability through database triggers that prevent UPDATE and DELETE "
            f"operations on the audit_log table.\n\n"
            f"Requisition: {requisition_id}\n"
            f"Total entries in audit trail: {len(entries)}\n"
            f"First entry timestamp: {entries[0].timestamp if entries else 'N/A'}\n"
            f"Last entry timestamp: {entries[-1].timestamp if entries else 'N/A'}\n"
            f"Entry ID range: {entries[0].id if entries else 'N/A'} "
            f"to {entries[-1].id if entries else 'N/A'}\n\n"
            f"For questions about this audit trail, contact your system administrator "
            f"or the Talos platform team."
        )

        pdf.multi_cell(0, 5, notice)

    def _section_header(self, pdf: FPDF, title: str):
        """Add a section header."""
        pdf.set_font(self.FONT_FAMILY, "B", 14)
        pdf.cell(0, 10, title, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

    def _add_text_block(self, pdf: FPDF, label: str, text: str):
        """Add a labeled text block with wrapping."""
        pdf.set_font(self.FONT_FAMILY, "B", 8)
        pdf.cell(0, 5, f"  {label}", new_x="LMARGIN", new_y="NEXT")

        pdf.set_font("Courier", "", 7)
        # Truncate very long text for readability but include enough for audit
        display_text = text if len(text) <= 3000 else text[:3000] + "\n... [truncated, see database for full text]"
        wrapped = textwrap.fill(display_text, width=110)
        pdf.multi_cell(0, 3.5, f"  {wrapped}")
        pdf.set_font(self.FONT_FAMILY, "", 9)
