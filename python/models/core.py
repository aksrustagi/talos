"""
Talos AI — Core Pydantic Schemas

Universal data contracts for all inter-agent communication.
These models define the structured data that flows between agents,
workflows, connectors, and the API layer.
"""

from datetime import datetime, date
from decimal import Decimal
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


class SavingsVerificationMethod(str, Enum):
    MARKET_BENCHMARK = "market_benchmark"
    COMPETITIVE_BID = "competitive_bid"
    HISTORICAL_COMPARISON = "historical_comparison"
    COOPERATIVE_PRICING = "cooperative_pricing"
    CATALOG_COMPARISON = "catalog_comparison"


# ============================================
# Base / Shared Models
# ============================================

class Attachment(BaseModel):
    """File attachment metadata."""
    filename: str
    content_type: str
    url: str
    size_bytes: int


class LineItem(BaseModel):
    """Single item in a procurement requisition."""
    description: str
    quantity: int
    unit: str = "each"
    estimated_unit_price: Optional[Decimal] = None
    unspsc_code: Optional[str] = None
    preferred_vendor: Optional[str] = None
    specifications: Optional[str] = None


class FundingSource(BaseModel):
    """Budget / funding source for a requisition."""
    funding_type: FundingType
    grant_number: Optional[str] = None         # e.g., NSF-2024-12345
    cost_center: Optional[str] = None
    gl_code: Optional[str] = None
    budget_remaining: Optional[Decimal] = None
    restrictions: list[str] = []                # e.g., ["no_food", "domestic_travel_only"]


class PolicyViolation(BaseModel):
    """A policy violation found during compliance check."""
    policy_id: str
    policy_name: str
    severity: Literal["warning", "block", "requires_justification"]
    description: str
    remediation: str


class ApprovalStep(BaseModel):
    """A single step in an approval chain."""
    approver_id: str
    approver_name: str
    approver_role: str
    threshold_reason: str                       # e.g., ">$100K requires VP Finance"
    deadline: Optional[datetime] = None
    delegation_to: Optional[str] = None


class VendorMatch(BaseModel):
    """A vendor match from sourcing or contract lookup."""
    vendor_id: str
    vendor_name: str
    contract_number: Optional[str] = None
    contract_price: Optional[Decimal] = None
    match_type: Literal["preferred", "cooperative", "gpo", "sole_source", "open_market"]
    match_confidence: float


class NegotiationRound(BaseModel):
    """A single round in a vendor negotiation."""
    round_number: int
    our_offer: Decimal
    vendor_counter: Optional[Decimal] = None
    vendor_response: Optional[str] = None
    timestamp: datetime
    channel: Literal["email", "portal", "phone", "api"]


class PricingDataPoint(BaseModel):
    """A single pricing observation from a market source."""
    source: str                                 # "amazon_business", "gsa_advantage", "gpo_vizient"
    vendor_name: str
    unit_price: Decimal
    currency: str = "USD"
    quantity_break: Optional[int] = None
    contract_price: bool = False
    fetched_at: datetime
    url: Optional[str] = None


# ============================================
# Agent Input/Output Models
# ============================================

class RequisitionInput(BaseModel):
    """Input to Agent 1: Intake Parser."""
    raw_text: str
    source_channel: Literal["email", "teams", "slack", "portal", "phone", "api"]
    requester_id: str
    requester_name: str
    department: str
    facility: Optional[str] = None              # For multi-site (Northwell, NYPA)
    attachments: list[Attachment] = []
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ParsedRequisition(BaseModel):
    """Output of Agent 1 / Input to Agents 2, 3."""
    req_id: str = Field(default_factory=lambda: f"REQ-{uuid4().hex[:8].upper()}")
    items: list[LineItem]
    estimated_total: Decimal
    category: str                               # UNSPSC top-level
    subcategory: str                            # UNSPSC detailed
    urgency: UrgencyLevel
    funding_source: FundingSource
    delivery_location: Optional[str] = None
    needed_by: Optional[date] = None
    confidence_score: float                     # Parser confidence 0.0-1.0
    raw_input: RequisitionInput
    requires_human_review: bool = False         # If confidence < 0.85


class ComplianceResult(BaseModel):
    """Output of Agent 2: Policy Compliance."""
    requisition_id: str
    is_compliant: bool
    violations: list[PolicyViolation]
    required_approvals: list[ApprovalStep]
    preferred_vendors: list[VendorMatch]
    regulatory_requirements: list[str]          # ["2_CFR_200", "HIPAA_BAA", "FERC_filing"]
    sole_source_required: bool = False
    competitive_bid_required: bool = False
    competitive_bid_threshold: Optional[Decimal] = None


class AggregationOpportunity(BaseModel):
    """Output of Agent 3: Demand Aggregation."""
    requisition_id: str
    similar_recent_reqs: list[str]              # Other req IDs for same category
    consolidation_savings_estimate: Decimal
    recommended_action: Literal["consolidate", "batch", "proceed_solo"]
    batch_window: Optional[str] = None          # "wait_7_days" for more volume


class SourcingRecommendation(BaseModel):
    """Output of Agent 5: Sourcing."""
    requisition_id: str
    recommended_vendors: list[VendorMatch]
    rfp_required: bool
    rfp_document_url: Optional[str] = None
    estimated_timeline_days: int
    market_conditions: str                      # "buyer_favorable", "seller_favorable", "balanced"


class NegotiationState(BaseModel):
    """State for Agent 6: Negotiation."""
    negotiation_id: str = Field(default_factory=lambda: f"NEG-{uuid4().hex[:8].upper()}")
    requisition_id: str
    vendor_id: str
    vendor_name: str
    vendor_email: str
    initial_quote: Decimal
    target_price: Decimal
    current_best_offer: Decimal
    rounds: list[NegotiationRound] = []
    strategy: NegotiationStrategy
    max_rounds: int = 5
    approved_floor: Decimal
    leverage_points: list[str]                  # ["volume_commitment", "multi_year", "competitor_quote"]
    status: Literal["active", "accepted", "rejected", "escalated"] = "active"


class NegotiationResult(BaseModel):
    """Output of Agent 6: Negotiation."""
    negotiation_id: str
    final_price: Decimal
    savings_vs_initial: Decimal
    savings_percentage: float
    accepted_terms: dict
    email_thread: list[dict]                    # Full email correspondence for audit


class InvoiceMatchResult(BaseModel):
    """Output of Agent 12: 3-Way Match."""
    invoice_id: str
    po_number: str
    match_status: Literal["matched", "exception_price", "exception_quantity", "exception_receipt", "no_po"]
    price_variance: Optional[Decimal] = None
    quantity_variance: Optional[int] = None
    within_tolerance: bool
    auto_approved: bool
    exception_details: Optional[str] = None


class SavingsRecord(BaseModel):
    """Output of Agent 17: Savings Verification — THIS IS THE BILLING BASIS."""
    savings_id: str = Field(default_factory=lambda: f"SAV-{uuid4().hex[:8].upper()}")
    category: str
    description: str
    baseline_price: Decimal
    new_price: Decimal
    volume: int
    period: str                                 # "2025-Q1"
    total_savings: Decimal
    verification_method: SavingsVerificationMethod
    evidence_links: list[str]                   # PO IDs, invoice IDs, benchmark URLs
    confidence: float                           # 0.0-1.0
    talos_share: Decimal                        # 33% of total_savings
    client_approved: bool = False


class PriceTrackingResult(BaseModel):
    """Output of Agent 23: Price Tracking."""
    item_description: str
    unspsc_code: Optional[str] = None
    prices_found: list[PricingDataPoint]
    lowest_price: Decimal
    highest_price: Decimal
    median_price: Decimal
    recommended_vendor: str
    recommended_price: Decimal
    savings_vs_current_contract: Optional[Decimal] = None
    catalog_sources_checked: list[str]
    last_updated: datetime


class OptimizationDiscovery(BaseModel):
    """Output of Agent 22: Proactive Optimization."""
    discovery_id: str = Field(default_factory=lambda: f"OPT-{uuid4().hex[:8].upper()}")
    discovery_type: Literal["consolidation", "renegotiation", "substitute", "eliminate", "timing"]
    category: str
    description: str
    affected_departments: list[str]
    estimated_annual_savings: Decimal
    confidence: float
    evidence: list[str]
    recommended_action: str
    priority: Literal["high", "medium", "low"]
