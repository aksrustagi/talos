"""
Talos AI — Core Pydantic Schemas

Universal data contracts for all inter-agent communication.
These models define the structured data that flows between agents,
workflows, connectors, and the API layer.

Uses float instead of Decimal for LLM-friendly JSON serialization.
"""

from datetime import datetime, date
from enum import Enum
from typing import Optional, Literal
from uuid import uuid4

from pydantic import BaseModel, Field


# ============================================
# Enums
# ============================================

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
    INSURANCE_FUNDED = "insurance_funded"


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    ESCALATED = "escalated"
    DELEGATED = "delegated"


class NegotiationStrategy(str, Enum):
    COMPETITIVE_BID = "competitive_bid"
    VOLUME_LEVERAGE = "volume_leverage"
    RELATIONSHIP = "relationship"
    BENCHMARK_PRESSURE = "benchmark_pressure"
    CONSORTIUM = "consortium"
    WALK_AWAY = "walk_away"


class SavingsMethod(str, Enum):
    MARKET_BENCHMARK = "market_benchmark"
    COMPETITIVE_BID = "competitive_bid"
    HISTORICAL = "historical"
    COOPERATIVE_PRICING = "cooperative_pricing"
    CATALOG_COMPARISON = "catalog_comparison"


# Alias for backwards compatibility
SavingsVerificationMethod = SavingsMethod


# ============================================
# Base / Shared Models
# ============================================

class Attachment(BaseModel):
    """File attachment metadata."""
    filename: str
    content_type: str = "application/octet-stream"
    url: str = ""
    size_bytes: int = 0


class LineItem(BaseModel):
    """Single item in a procurement requisition."""
    description: str
    quantity: int = 1
    unit: str = "each"
    estimated_unit_price: Optional[float] = None
    unspsc_code: Optional[str] = None
    preferred_vendor: Optional[str] = None
    specifications: Optional[str] = None

    @property
    def estimated_total(self) -> float:
        if self.estimated_unit_price:
            return self.quantity * self.estimated_unit_price
        return 0.0


class FundingSource(BaseModel):
    """Budget / funding source for a requisition."""
    funding_type: FundingType = FundingType.OPERATING
    grant_number: Optional[str] = None
    cost_center: Optional[str] = None
    gl_code: Optional[str] = None
    budget_remaining: Optional[float] = None
    restrictions: list[str] = []


class PolicyViolation(BaseModel):
    """A policy violation found during compliance check."""
    policy_id: str = ""
    policy_name: str = ""
    severity: Literal["warning", "block", "requires_justification"] = "warning"
    description: str = ""
    remediation: str = ""


class ApprovalStep(BaseModel):
    """A single step in an approval chain."""
    approver_id: str = ""
    approver_name: str = ""
    approver_role: str = ""
    threshold_reason: str = ""
    deadline: Optional[str] = None
    delegation_to: Optional[str] = None


class VendorMatch(BaseModel):
    """A vendor match from sourcing or contract lookup."""
    vendor_id: str = ""
    vendor_name: str = ""
    contract_number: Optional[str] = None
    contract_price: Optional[float] = None
    match_type: Literal["preferred", "cooperative", "gpo", "sole_source", "open_market"] = "open_market"
    match_confidence: float = 0.0


class NegotiationRound(BaseModel):
    """A single round in a vendor negotiation."""
    round_number: int = 1
    our_offer: float = 0.0
    vendor_counter: Optional[float] = None
    vendor_response: Optional[str] = None
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    channel: Literal["email", "portal", "phone", "api"] = "email"


class PricingDataPoint(BaseModel):
    """A single pricing observation from a market source."""
    source: str = ""
    vendor_name: str = ""
    unit_price: float = 0.0
    currency: str = "USD"
    quantity_break: Optional[int] = None
    contract_price: bool = False
    fetched_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    url: Optional[str] = None


# ============================================
# Agent Input/Output Models
# ============================================

class RequisitionInput(BaseModel):
    """Input to Agent 1: Intake Parser."""
    raw_text: str
    source_channel: Literal["email", "teams", "slack", "portal", "phone", "api"] = "portal"
    requester_id: str = "unknown"
    requester_name: str = "Unknown User"
    department: str = "General"
    facility: Optional[str] = None
    attachments: list[Attachment] = []
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class ParsedRequisition(BaseModel):
    """Output of Agent 1 / Input to Agents 2, 3."""
    req_id: str = Field(default_factory=lambda: f"REQ-{uuid4().hex[:8].upper()}")
    items: list[LineItem] = []
    estimated_total: float = 0.0
    category: str = "Uncategorized"
    subcategory: str = ""
    urgency: UrgencyLevel = UrgencyLevel.STANDARD
    funding_source: FundingSource = Field(default_factory=FundingSource)
    delivery_location: Optional[str] = None
    needed_by: Optional[str] = None
    confidence_score: float = 0.0
    requires_human_review: bool = False
    compliance_flags: list[str] = []


class ComplianceResult(BaseModel):
    """Output of Agent 2: Policy Compliance."""
    requisition_id: str = ""
    is_compliant: bool = True
    violations: list[PolicyViolation] = []
    required_approvals: list[ApprovalStep] = []
    preferred_vendors: list[VendorMatch] = []
    regulatory_requirements: list[str] = []
    sole_source_required: bool = False
    competitive_bid_required: bool = False
    competitive_bid_threshold: Optional[float] = None


class AggregationOpportunity(BaseModel):
    """Output of Agent 3: Demand Aggregation."""
    requisition_id: str = ""
    similar_recent_reqs: list[str] = []
    consolidation_savings_estimate: float = 0.0
    recommended_action: Literal["consolidate", "batch", "proceed_solo"] = "proceed_solo"
    batch_window_days: int = 0


class SourcingRecommendation(BaseModel):
    """Output of Agent 5: Sourcing."""
    requisition_id: str = ""
    recommended_vendors: list[VendorMatch] = []
    rfp_required: bool = False
    rfp_document: Optional[str] = None
    estimated_timeline_days: int = 7
    market_conditions: str = "balanced"


class NegotiationState(BaseModel):
    """State for Agent 6: Negotiation."""
    negotiation_id: str = Field(default_factory=lambda: f"NEG-{uuid4().hex[:8].upper()}")
    requisition_id: str = ""
    vendor_id: str = ""
    vendor_name: str = ""
    vendor_email: str = ""
    initial_quote: float = 0.0
    target_price: float = 0.0
    current_best_offer: float = 0.0
    rounds: list[NegotiationRound] = []
    strategy: NegotiationStrategy = NegotiationStrategy.COMPETITIVE_BID
    max_rounds: int = 5
    approved_floor: float = 0.0
    leverage_points: list[str] = []
    status: Literal["active", "accepted", "rejected", "escalated"] = "active"


class NegotiationResult(BaseModel):
    """Output of Agent 6: Negotiation."""
    negotiation_id: str = ""
    final_price: float = 0.0
    savings_vs_initial: float = 0.0
    savings_percentage: float = 0.0
    accepted_terms: dict = {}
    email_thread: list[dict] = []


class PurchaseOrder(BaseModel):
    """Output of Agent 10: Purchase Order generation."""
    po_number: str = Field(default_factory=lambda: f"PO-{uuid4().hex[:8].upper()}")
    requisition_id: str = ""
    vendor_id: str = ""
    vendor_name: str = ""
    items: list[LineItem] = []
    total: float = 0.0
    payment_terms: str = "Net 30"
    delivery_date: Optional[str] = None
    ship_to: str = ""
    bill_to: str = ""
    gl_code: str = ""
    status: str = "draft"
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class InvoiceMatchResult(BaseModel):
    """Output of Agent 12: 3-Way Match."""
    invoice_id: str = ""
    po_number: str = ""
    match_status: Literal[
        "matched", "exception_price", "exception_quantity",
        "exception_receipt", "no_po"
    ] = "matched"
    price_variance: Optional[float] = None
    quantity_variance: Optional[int] = None
    within_tolerance: bool = True
    auto_approved: bool = False
    exception_details: Optional[str] = None


class SavingsRecord(BaseModel):
    """Output of Agent 17: Savings Verification — THIS IS THE BILLING BASIS."""
    savings_id: str = Field(default_factory=lambda: f"SAV-{uuid4().hex[:8].upper()}")
    category: str = ""
    description: str = ""
    baseline_price: float = 0.0
    new_price: float = 0.0
    volume: int = 0
    period: str = ""
    total_savings: float = 0.0
    verification_method: SavingsMethod = SavingsMethod.MARKET_BENCHMARK
    evidence_links: list[str] = []
    confidence: float = 0.0
    talos_share: float = 0.0
    client_approved: bool = False

    def calculate(self) -> "SavingsRecord":
        """Calculate total savings and Talos share."""
        self.total_savings = (self.baseline_price - self.new_price) * self.volume
        self.talos_share = self.total_savings * 0.33
        return self


class PriceTrackingResult(BaseModel):
    """Output of Agent 23: Price Tracking."""
    item_description: str = ""
    unspsc_code: Optional[str] = None
    prices_found: list[PricingDataPoint] = []
    lowest_price: float = 0.0
    highest_price: float = 0.0
    median_price: float = 0.0
    recommended_vendor: str = ""
    recommended_price: float = 0.0
    savings_vs_current: Optional[float] = None
    sources_checked: list[str] = []


class OptimizationDiscovery(BaseModel):
    """Output of Agent 22: Proactive Optimization."""
    discovery_id: str = Field(default_factory=lambda: f"OPT-{uuid4().hex[:8].upper()}")
    discovery_type: Literal[
        "consolidation", "renegotiation", "substitute", "eliminate", "timing"
    ] = "consolidation"
    category: str = ""
    description: str = ""
    affected_departments: list[str] = []
    estimated_annual_savings: float = 0.0
    confidence: float = 0.0
    evidence: list[str] = []
    recommended_action: str = ""
    priority: Literal["high", "medium", "low"] = "medium"
