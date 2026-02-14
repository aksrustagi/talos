"""
Tests for Pydantic data models.

Validates that all core schemas can be instantiated and serialized correctly.
"""

from datetime import datetime, date
from decimal import Decimal

import pytest

from models.core import (
    UrgencyLevel,
    FundingType,
    Attachment,
    LineItem,
    FundingSource,
    PolicyViolation,
    ApprovalStep,
    VendorMatch,
    NegotiationRound,
    PricingDataPoint,
    RequisitionInput,
    ParsedRequisition,
    ComplianceResult,
    AggregationOpportunity,
    SourcingRecommendation,
    NegotiationState,
    NegotiationResult,
    InvoiceMatchResult,
    SavingsRecord,
    PriceTrackingResult,
    OptimizationDiscovery,
    NegotiationStrategy,
    SavingsVerificationMethod,
)


def test_line_item_creation():
    item = LineItem(
        description="Ergonomic keyboard",
        quantity=20,
        unit="each",
        estimated_unit_price=Decimal("130.00"),
        unspsc_code="43211706",
    )
    assert item.quantity == 20
    assert item.estimated_unit_price == Decimal("130.00")


def test_funding_source_creation():
    fs = FundingSource(
        funding_type=FundingType.GRANT_FEDERAL,
        grant_number="NSF-2024-12345",
        cost_center="PHYS-OPS",
    )
    assert fs.funding_type == FundingType.GRANT_FEDERAL
    assert fs.grant_number == "NSF-2024-12345"


def test_requisition_input_creation():
    req = RequisitionInput(
        raw_text="Need 20 keyboards for CS lab",
        source_channel="email",
        requester_id="user_001",
        requester_name="John Doe",
        department="Computer Science",
    )
    assert req.source_channel == "email"
    assert req.timestamp is not None


def test_parsed_requisition_auto_id():
    req_input = RequisitionInput(
        raw_text="test",
        source_channel="portal",
        requester_id="u1",
        requester_name="Test User",
        department="IT",
    )
    parsed = ParsedRequisition(
        items=[LineItem(description="Test item", quantity=1)],
        estimated_total=Decimal("100.00"),
        category="IT Equipment",
        subcategory="Peripherals",
        urgency=UrgencyLevel.STANDARD,
        funding_source=FundingSource(funding_type=FundingType.OPERATING),
        confidence_score=0.95,
        raw_input=req_input,
    )
    assert parsed.req_id.startswith("REQ-")
    assert len(parsed.req_id) == 12  # REQ- + 8 hex chars


def test_compliance_result():
    result = ComplianceResult(
        requisition_id="REQ-12345678",
        is_compliant=True,
        violations=[],
        required_approvals=[],
        preferred_vendors=[],
        regulatory_requirements=["2_CFR_200"],
    )
    assert result.is_compliant is True
    assert result.sole_source_required is False


def test_invoice_match_result():
    result = InvoiceMatchResult(
        invoice_id="INV-001",
        po_number="PO-001",
        match_status="matched",
        within_tolerance=True,
        auto_approved=True,
    )
    assert result.auto_approved is True


def test_savings_record_auto_id():
    record = SavingsRecord(
        category="IT Equipment",
        description="Negotiated 15% reduction on Dell monitors",
        baseline_price=Decimal("350.00"),
        new_price=Decimal("297.50"),
        volume=500,
        period="2025-Q1",
        total_savings=Decimal("26250.00"),
        verification_method=SavingsVerificationMethod.COMPETITIVE_BID,
        evidence_links=["PO-001", "PO-002"],
        confidence=0.95,
        talos_share=Decimal("8662.50"),
    )
    assert record.savings_id.startswith("SAV-")
    assert record.talos_share == Decimal("8662.50")


def test_optimization_discovery():
    discovery = OptimizationDiscovery(
        discovery_type="consolidation",
        category="Lab Supplies",
        description="Consolidate glove purchases across departments",
        affected_departments=["Chemistry", "Biology", "Physics"],
        estimated_annual_savings=Decimal("170000.00"),
        confidence=0.85,
        evidence=["PO-100", "PO-200", "PO-300"],
        recommended_action="Consolidate to single vendor with volume discount",
        priority="high",
    )
    assert discovery.discovery_id.startswith("OPT-")
    assert discovery.priority == "high"


def test_model_serialization_roundtrip():
    """Test that models can be serialized to JSON and deserialized back."""
    item = LineItem(
        description="Test item",
        quantity=10,
        estimated_unit_price=Decimal("99.99"),
    )
    json_str = item.model_dump_json()
    restored = LineItem.model_validate_json(json_str)
    assert restored.description == "Test item"
    assert restored.quantity == 10
