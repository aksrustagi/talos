"""
Pydantic models for the audit trail system.

All models are designed for federal grant audit compliance.
"""

from typing import Optional, List
from datetime import datetime

from pydantic import BaseModel, Field


class AuditEntry(BaseModel):
    """A single audit log entry recording one agent interaction."""

    id: Optional[int] = Field(None, description="Auto-generated row ID")
    timestamp: str = Field(
        default_factory=lambda: datetime.utcnow().isoformat() + "Z",
        description="ISO 8601 UTC timestamp of when this event occurred",
    )
    agent_name: str = Field(..., description="Name/ID of the agent that executed")
    agent_tier: Optional[int] = Field(None, description="Agent tier (1-3)")

    # What was sent and returned
    input_text: str = Field(..., description="Full input sent to the LLM")
    output_text: str = Field(..., description="Full output returned by the LLM")

    # Model and cost tracking
    model_used: str = Field(..., description="LLM model identifier")
    input_tokens: Optional[int] = Field(None, description="Input token count")
    output_tokens: Optional[int] = Field(None, description="Output token count")
    cost_usd: Optional[float] = Field(None, description="Estimated cost in USD")

    # Decision information
    decision: Optional[str] = Field(
        None,
        description="The decision made (e.g., 'approved', 'vendor_selected', 'price_accepted')",
    )
    reasoning: Optional[str] = Field(
        None, description="Agent's reasoning for the decision"
    )

    # Tool calls made during this interaction
    tool_calls: Optional[str] = Field(
        None, description="JSON-serialized list of tool calls made"
    )
    tool_results: Optional[str] = Field(
        None, description="JSON-serialized list of tool results"
    )

    # Procurement linkage
    requisition_id: Optional[str] = Field(
        None, description="Associated requisition ID (e.g., REQ-2025-00847)"
    )
    purchase_order_id: Optional[str] = Field(
        None, description="Associated purchase order ID"
    )
    contract_id: Optional[str] = Field(None, description="Associated contract ID")

    # Who triggered it
    triggered_by: str = Field(
        ..., description="Who initiated this action: user ID or 'system'"
    )
    trigger_type: str = Field(
        ..., description="Type of trigger: 'user', 'system', 'scheduled', 'webhook'"
    )
    user_email: Optional[str] = Field(None, description="Email of triggering user")
    user_department: Optional[str] = Field(
        None, description="Department of triggering user"
    )
    university_id: Optional[str] = Field(None, description="University/tenant ID")

    # Execution metadata
    execution_id: Optional[str] = Field(
        None, description="Unique execution/session ID grouping related calls"
    )
    execution_duration_ms: Optional[int] = Field(
        None, description="How long the agent execution took in milliseconds"
    )

    # Tamper-evidence hash chain
    previous_hash: Optional[str] = Field(
        None,
        description="SHA-256 hash of the previous audit entry (chain link)",
    )
    entry_hash: Optional[str] = Field(
        None,
        description="SHA-256 hash of this entry's content (for integrity verification)",
    )


class AuditDecisionSummary(BaseModel):
    """High-level summary of the decision chain for a requisition."""

    requisition_id: str
    first_action: Optional[str] = None
    last_action: Optional[str] = None
    agents_involved: List[str] = Field(default_factory=list)
    total_decisions: int = 0
    total_cost_usd: float = 0.0
    total_duration_ms: int = 0
    vendors_evaluated: List[str] = Field(default_factory=list)
    final_decision: Optional[str] = None
    final_reasoning: Optional[str] = None
    approval_chain: List[dict] = Field(default_factory=list)


class AuditQueryResult(BaseModel):
    """Result of querying audit logs for a requisition."""

    requisition_id: str
    total_entries: int
    decision_chain: List[AuditEntry]
    summary: AuditDecisionSummary


class AuditExportRequest(BaseModel):
    """Request to export an audit report."""

    requisition_id: str
    include_full_io: bool = Field(
        True, description="Include full LLM input/output text"
    )
    include_tool_calls: bool = Field(True, description="Include tool call details")
    format: str = Field("pdf", description="Export format: pdf")
