"""Tests for Talos notification service."""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from talos.notifications import NotificationService
from talos.schemas import RequisitionPipeline, ParsedRequisition, ComplianceResult, PolicyViolation, ApprovalStep


class TestNotificationService:
    def test_init(self):
        svc = NotificationService()
        assert svc._client is None

    @pytest.mark.asyncio
    async def test_notify_approval_no_compliance(self):
        svc = NotificationService()
        pipe = RequisitionPipeline()
        # Should not raise when no compliance data
        await svc.notify_approval_needed(pipe)

    @pytest.mark.asyncio
    async def test_notify_compliance_block_no_blocking(self):
        svc = NotificationService()
        pipe = RequisitionPipeline(
            compliance=ComplianceResult(
                violations=[PolicyViolation(severity="warning", description="Test")]
            )
        )
        # Should not send notification for non-blocking violations
        await svc.notify_compliance_block(pipe)

    def test_build_approval_message(self):
        svc = NotificationService()
        pipe = RequisitionPipeline(
            id="PIPE-TEST",
            requester_name="Dr. Chen",
            department="Chemistry",
            parsed=ParsedRequisition(
                category="Lab Supplies",
                estimated_total=500.0,
            ),
            compliance=ComplianceResult(
                required_approvals=[
                    ApprovalStep(approver_role="Dept Head", threshold_reason="Over $100")
                ]
            ),
        )
        step = pipe.compliance.required_approvals[0]
        msg = svc._build_approval_message(pipe, step)
        assert "Approval Request" in str(msg)
        assert "PIPE-TEST" in str(msg)
        assert "Dr. Chen" in str(msg)

    def test_build_email_body(self):
        svc = NotificationService()
        pipe = RequisitionPipeline(
            id="PIPE-TEST",
            requester_name="Dr. Chen",
            department="Chemistry",
            parsed=ParsedRequisition(category="Lab Supplies"),
        )
        step = ApprovalStep(approver_role="Dept Head", threshold_reason="Over $100")
        body = svc._build_email_body(pipe, step)
        assert "PIPE-TEST" in body
        assert "Dr. Chen" in body
        assert "Dept Head" in body

    @pytest.mark.asyncio
    async def test_close(self):
        svc = NotificationService()
        await svc.close()  # Should not raise even without client
