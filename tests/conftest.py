"""Shared test fixtures for Talos test suite."""
import os
import pytest

# Set test environment before any imports
os.environ["OPENROUTER_API_KEY"] = "test-key-for-testing"
os.environ["TALOS_CLIENT"] = "university"
os.environ["TALOS_DB"] = ":memory:"
os.environ["TALOS_LOG_LEVEL"] = "WARNING"

from talos.config import Config, reset_config
from talos.db import TalosDB
from talos.schemas import (
    ParsedRequisition, ComplianceResult, LineItem, FundingSource,
    PolicyViolation, ApprovalStep, VendorMatch, SavingsRecord,
    RequisitionPipeline, ConversationSession, ChatMessage,
    PriceTrackingResult, PricingDataPoint,
)


@pytest.fixture(autouse=True)
def reset_config_singleton():
    """Reset config singleton between tests."""
    reset_config()
    yield
    reset_config()


@pytest.fixture
def db():
    """In-memory database for testing."""
    database = TalosDB(":memory:")
    yield database
    database.close()


@pytest.fixture
def sample_parsed():
    """Sample parsed requisition."""
    return ParsedRequisition(
        req_id="REQ-TEST0001",
        items=[
            LineItem(
                description="Nitrile gloves, medium, powder-free",
                quantity=50,
                unit="box",
                estimated_unit_price=12.50,
            ),
            LineItem(
                description="Safety goggles",
                quantity=10,
                unit="each",
                estimated_unit_price=8.00,
            ),
        ],
        estimated_total=705.0,
        category="Lab Supplies",
        subcategory="Safety Equipment",
        urgency="standard",
        funding_source=FundingSource(
            funding_type="grant_federal",
            grant_number="NSF-2024-MCB-1234",
            cost_center="CHEM-001",
        ),
        delivery_location="Havemeyer Hall Room 302",
        needed_by="2025-06-15",
        confidence_score=0.95,
    )


@pytest.fixture
def sample_compliance():
    """Sample compliance result."""
    return ComplianceResult(
        requisition_id="REQ-TEST0001",
        is_compliant=True,
        violations=[
            PolicyViolation(
                policy_id="POL-001",
                policy_name="Grant Funding Compliance",
                severity="warning",
                description="Federal grant funded — ensure 2 CFR 200 compliance",
            ),
        ],
        required_approvals=[
            ApprovalStep(
                approver_name="Dr. Smith",
                approver_role="Department Head",
                threshold_reason="Amount exceeds $500 on federal grant",
            ),
        ],
        preferred_vendors=[
            VendorMatch(
                vendor_name="Fisher Scientific",
                match_type="cooperative",
                match_confidence=0.9,
            ),
        ],
    )


@pytest.fixture
def sample_pipeline(sample_parsed, sample_compliance):
    """Sample pipeline with parsed and compliance results."""
    return RequisitionPipeline(
        id="PIPE-TEST0001",
        raw_text="I need 50 boxes of gloves for the chem lab",
        requester_name="Dr. Chen",
        department="Chemistry",
        status="compliance_checked",
        parsed=sample_parsed,
        compliance=sample_compliance,
    )


@pytest.fixture
def sample_savings():
    """Sample savings record."""
    return SavingsRecord(
        savings_id="SAV-TEST0001",
        category="Lab Supplies",
        description="Consolidated glove purchasing",
        baseline_price=15.80,
        new_price=11.20,
        volume=5000,
        verification_method="competitive_bid",
        evidence=["PO-2024-1234", "New contract quote"],
        confidence=0.85,
    ).calculate()


@pytest.fixture
def sample_session():
    """Sample conversation session."""
    session = ConversationSession(
        session_id="CHAT-TEST0001",
        requester_name="Dr. Chen",
        department="Chemistry",
    )
    session.messages.append(ChatMessage(role="user", content="I need gloves"))
    session.messages.append(ChatMessage(role="assistant", content="I'll help with that."))
    return session
