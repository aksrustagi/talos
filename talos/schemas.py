"""
Talos Schemas — Every data structure agents produce and consume.
"""
from __future__ import annotations
from datetime import datetime, timezone
from enum import Enum
from typing import Optional, Literal
from uuid import uuid4
from pydantic import BaseModel, Field, field_validator


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---- Enums ----

class UrgencyLevel(str, Enum):
    STANDARD = "standard"
    URGENT = "urgent"
    EMERGENCY = "emergency"

class FundingType(str, Enum):
    OPERATING = "operating"
    CAPITAL = "capital"
    GRANT_FEDERAL = "grant_federal"
    GRANT_STATE = "grant_state"
    GRANT_PRIVATE = "grant_private"
    ENDOWMENT = "endowment"
    BOND_FUNDED = "bond_funded"

class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    ESCALATED = "escalated"

class NegotiationStrategy(str, Enum):
    COMPETITIVE_BID = "competitive_bid"
    VOLUME_LEVERAGE = "volume_leverage"
    BENCHMARK_PRESSURE = "benchmark_pressure"
    WALK_AWAY = "walk_away"

class SavingsMethod(str, Enum):
    MARKET_BENCHMARK = "market_benchmark"
    COMPETITIVE_BID = "competitive_bid"
    HISTORICAL = "historical"
    COOPERATIVE_PRICING = "cooperative_pricing"
    CATALOG_COMPARISON = "catalog_comparison"


# ---- Building Blocks ----

class LineItem(BaseModel):
    description: str
    quantity: int = 1
    unit: str = "each"
    estimated_unit_price: float | None = None
    unspsc_code: str | None = None
    preferred_vendor: str | None = None
    specifications: str | None = None

class FundingSource(BaseModel):
    funding_type: FundingType = FundingType.OPERATING
    grant_number: str | None = None
    cost_center: str | None = None
    gl_code: str | None = None
    budget_remaining: float | None = None
    restrictions: list[str] = []

class PolicyViolation(BaseModel):
    policy_id: str = ""
    policy_name: str = ""
    severity: Literal["warning", "block", "requires_justification"] = "warning"
    description: str = ""
    remediation: str = ""

class ApprovalStep(BaseModel):
    approver_name: str = ""
    approver_role: str = ""
    threshold_reason: str = ""

class VendorMatch(BaseModel):
    vendor_name: str = ""
    contract_number: str | None = None
    contract_price: float | None = None
    match_type: Literal["preferred", "cooperative", "gpo", "sole_source", "open_market"] = "open_market"
    match_confidence: float = 0.0

class PricingDataPoint(BaseModel):
    source: str = ""
    vendor_name: str = ""
    unit_price: float = 0.0
    currency: str = "USD"
    quantity_break: int | None = None
    contract_price: bool = False
    url: str | None = None


# ---- Agent Outputs ----

class ParsedRequisition(BaseModel):
    """Agent 1 output."""
    req_id: str = Field(default_factory=lambda: f"REQ-{uuid4().hex[:8].upper()}")
    items: list[LineItem] = []
    estimated_total: float = 0.0
    category: str = "Uncategorized"
    subcategory: str = ""
    urgency: UrgencyLevel = UrgencyLevel.STANDARD
    funding_source: FundingSource = Field(default_factory=FundingSource)
    delivery_location: str | None = None
    needed_by: str | None = None
    confidence_score: float = 0.0
    requires_human_review: bool = False
    compliance_flags: list[str] = []

class ComplianceResult(BaseModel):
    """Agent 2 output."""
    requisition_id: str = ""
    is_compliant: bool = True
    violations: list[PolicyViolation] = []
    required_approvals: list[ApprovalStep] = []
    preferred_vendors: list[VendorMatch] = []
    regulatory_requirements: list[str] = []
    competitive_bid_required: bool = False

class AggregationOpportunity(BaseModel):
    """Agent 3 output."""
    requisition_id: str = ""
    similar_recent_reqs: list[str] = []
    consolidation_savings_estimate: float = 0.0
    recommended_action: Literal["consolidate", "batch", "proceed_solo"] = "proceed_solo"
    batch_window_days: int = 0

class PurchaseOrder(BaseModel):
    """Agent 10 output."""
    po_number: str = Field(default_factory=lambda: f"PO-{uuid4().hex[:8].upper()}")
    requisition_id: str = ""
    vendor_name: str = ""
    items: list[LineItem] = []
    total: float = 0.0
    payment_terms: str = "Net 30"
    delivery_date: str | None = None
    ship_to: str = ""
    gl_code: str = ""
    status: str = "draft"

class SavingsRecord(BaseModel):
    """Agent 17 output — BILLING BASIS."""
    savings_id: str = Field(default_factory=lambda: f"SAV-{uuid4().hex[:8].upper()}")
    category: str = ""
    description: str = ""
    baseline_price: float = 0.0
    new_price: float = 0.0
    volume: int = 0
    period: str = ""
    total_savings: float = 0.0
    verification_method: SavingsMethod = SavingsMethod.MARKET_BENCHMARK
    evidence: list[str] = []
    confidence: float = 0.0
    talos_share: float = 0.0

    def calculate(self) -> "SavingsRecord":
        self.total_savings = (self.baseline_price - self.new_price) * self.volume
        self.talos_share = self.total_savings * 0.33
        return self

class PriceTrackingResult(BaseModel):
    """Agent 23 output."""
    item_description: str = ""
    prices_found: list[PricingDataPoint] = []
    lowest_price: float = 0.0
    highest_price: float = 0.0
    median_price: float = 0.0
    recommended_vendor: str = ""
    recommended_price: float = 0.0
    savings_vs_current: float | None = None
    sources_checked: list[str] = []

class OptimizationDiscovery(BaseModel):
    """Agent 22 output."""
    discovery_id: str = Field(default_factory=lambda: f"OPT-{uuid4().hex[:8].upper()}")
    discovery_type: Literal["consolidation", "renegotiation", "substitute", "eliminate", "timing"] = "consolidation"
    category: str = ""
    description: str = ""
    affected_departments: list[str] = []
    estimated_annual_savings: float = 0.0
    confidence: float = 0.0
    recommended_action: str = ""
    priority: Literal["high", "medium", "low"] = "medium"


# ---- Conversation Models ----

class ChatMessage(BaseModel):
    """A single message in a conversation."""
    role: Literal["user", "assistant", "system"] = "user"
    content: str = ""
    timestamp: str = Field(default_factory=_utcnow_iso)
    metadata: dict = {}

class ConversationSession(BaseModel):
    """A procurement conversation session."""
    session_id: str = Field(default_factory=lambda: f"CHAT-{uuid4().hex[:8].upper()}")
    messages: list[ChatMessage] = []
    requester_name: str = ""
    department: str = ""
    pipeline_id: str | None = None
    status: str = "active"
    created_at: str = Field(default_factory=_utcnow_iso)


# ---- Pipeline State ----

class RequisitionPipeline(BaseModel):
    """Full state of a requisition flowing through the pipeline."""
    id: str = Field(default_factory=lambda: f"PIPE-{uuid4().hex[:8].upper()}")
    raw_text: str = ""
    source_channel: str = "portal"
    requester_name: str = ""
    department: str = ""
    status: str = "received"
    created_at: str = Field(default_factory=_utcnow_iso)

    # Agent outputs (filled as pipeline progresses)
    parsed: ParsedRequisition | None = None
    compliance: ComplianceResult | None = None
    aggregation: AggregationOpportunity | None = None
    pricing: PriceTrackingResult | None = None
    savings: SavingsRecord | None = None
    purchase_order: PurchaseOrder | None = None

    # Tracking
    total_llm_cost: float = 0.0
    agent_calls: list[dict] = []
    errors: list[str] = []


# ---- API Error Response ----

class ErrorResponse(BaseModel):
    """Standard error response for all API endpoints."""
    error: str
    detail: str = ""
    status_code: int = 400
