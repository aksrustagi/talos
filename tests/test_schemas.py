"""Tests for Talos schemas and data models."""
import pytest
from talos.schemas import (
    LineItem, FundingSource, PolicyViolation, ApprovalStep, VendorMatch,
    ParsedRequisition, ComplianceResult, AggregationOpportunity,
    PurchaseOrder, SavingsRecord, PriceTrackingResult, PricingDataPoint,
    OptimizationDiscovery, ChatMessage, ConversationSession,
    RequisitionPipeline, ErrorResponse, FundingType, UrgencyLevel,
)


class TestSavingsRecord:
    def test_calculate_savings(self):
        s = SavingsRecord(
            baseline_price=15.80,
            new_price=11.20,
            volume=5000,
        ).calculate()
        assert s.total_savings == (15.80 - 11.20) * 5000
        assert s.talos_share == s.total_savings * 0.33

    def test_calculate_no_savings(self):
        s = SavingsRecord(
            baseline_price=10.0,
            new_price=10.0,
            volume=100,
        ).calculate()
        assert s.total_savings == 0.0
        assert s.talos_share == 0.0

    def test_negative_savings(self):
        s = SavingsRecord(
            baseline_price=10.0,
            new_price=15.0,
            volume=100,
        ).calculate()
        assert s.total_savings == -500.0


class TestParsedRequisition:
    def test_default_values(self):
        p = ParsedRequisition()
        assert p.req_id.startswith("REQ-")
        assert p.items == []
        assert p.estimated_total == 0.0
        assert p.category == "Uncategorized"
        assert p.urgency == UrgencyLevel.STANDARD

    def test_with_items(self, sample_parsed):
        assert len(sample_parsed.items) == 2
        assert sample_parsed.estimated_total == 705.0
        assert sample_parsed.funding_source.funding_type == FundingType.GRANT_FEDERAL

    def test_json_roundtrip(self, sample_parsed):
        json_str = sample_parsed.model_dump_json()
        restored = ParsedRequisition.model_validate_json(json_str)
        assert restored.req_id == sample_parsed.req_id
        assert len(restored.items) == len(sample_parsed.items)
        assert restored.estimated_total == sample_parsed.estimated_total


class TestComplianceResult:
    def test_default_compliant(self):
        c = ComplianceResult()
        assert c.is_compliant is True
        assert c.violations == []

    def test_with_violations(self, sample_compliance):
        assert len(sample_compliance.violations) == 1
        assert sample_compliance.violations[0].severity == "warning"

    def test_json_roundtrip(self, sample_compliance):
        json_str = sample_compliance.model_dump_json()
        restored = ComplianceResult.model_validate_json(json_str)
        assert len(restored.violations) == len(sample_compliance.violations)


class TestRequisitionPipeline:
    def test_default_values(self):
        p = RequisitionPipeline()
        assert p.id.startswith("PIPE-")
        assert p.status == "received"
        assert p.parsed is None

    def test_with_full_data(self, sample_pipeline):
        assert sample_pipeline.parsed is not None
        assert sample_pipeline.compliance is not None
        assert sample_pipeline.status == "compliance_checked"

    def test_json_roundtrip(self, sample_pipeline):
        json_str = sample_pipeline.model_dump_json()
        restored = RequisitionPipeline.model_validate_json(json_str)
        assert restored.id == sample_pipeline.id
        assert restored.parsed is not None
        assert restored.parsed.req_id == sample_pipeline.parsed.req_id


class TestConversationSession:
    def test_default_values(self):
        s = ConversationSession()
        assert s.session_id.startswith("CHAT-")
        assert s.messages == []
        assert s.status == "active"

    def test_with_messages(self, sample_session):
        assert len(sample_session.messages) == 2
        assert sample_session.messages[0].role == "user"
        assert sample_session.messages[1].role == "assistant"


class TestErrorResponse:
    def test_error_response(self):
        e = ErrorResponse(error="Not found", detail="Pipeline not found", status_code=404)
        assert e.error == "Not found"
        assert e.status_code == 404


class TestTimestamps:
    def test_utcnow_iso_format(self):
        msg = ChatMessage(role="user", content="test")
        assert "+" in msg.timestamp or "Z" in msg.timestamp  # timezone-aware
