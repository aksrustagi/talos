"""Tests for the RequisitionToOrderWorkflow and helper functions.

These tests validate workflow logic without requiring a running Temporal server.
They test the signal validation, vendor extraction, dataclass construction, and
the workflow class initialization directly.

Note: We import directly from workflows.requisition (not via the package
__init__) to avoid the circular import through worker.py.
"""

import importlib
import sys
import uuid
from unittest.mock import MagicMock

import pytest

# Prevent the circular import chain (workflows.requisition -> worker -> agents -> langgraph)
# by pre-populating worker in sys.modules with a mock before importing the module.
if "worker" not in sys.modules:
    sys.modules["worker"] = MagicMock()

import workflows.requisition as req_mod

RequisitionInput = req_mod.RequisitionInput
RequisitionToOrderWorkflow = req_mod.RequisitionToOrderWorkflow
_extract_vendor_id = req_mod._extract_vendor_id
AGENT_RETRY = req_mod.AGENT_RETRY


# ============================================
# RequisitionInput dataclass
# ============================================


class TestRequisitionInput:
    def test_required_fields(self):
        inp = RequisitionInput(
            items=[{"description": "Pipette tips", "quantity": 10, "unit_price": 25.0}],
            budget_code="BIO-2024",
            urgency="standard",
            user_id="user_001",
            university_id="univ_001",
            user_email="user@university.edu",
            department="Biology",
        )
        assert inp.urgency == "standard"
        assert inp.needed_by is None
        assert inp.notes is None

    def test_optional_fields(self):
        inp = RequisitionInput(
            items=[],
            budget_code="ENG-2024",
            urgency="rush",
            user_id="user_002",
            university_id="univ_001",
            user_email="eng@university.edu",
            department="Engineering",
            needed_by="2024-06-01",
            notes="Urgent lab equipment",
        )
        assert inp.needed_by == "2024-06-01"
        assert inp.notes == "Urgent lab equipment"


# ============================================
# Signal validation logic
# ============================================


class TestSignalValidation:
    def test_valid_approve(self):
        wf = RequisitionToOrderWorkflow()
        assert wf.approval_decision is None

        # Simulate calling the signal handler directly (bypassing Temporal runtime)
        import asyncio
        asyncio.get_event_loop().run_until_complete(
            wf.human_approval("approve", "approver_001", "Looks good")
        )

        assert wf.approval_decision == "approve"
        assert wf.approver_id == "approver_001"
        assert wf.approval_comments == "Looks good"

    def test_valid_reject(self):
        wf = RequisitionToOrderWorkflow()
        import asyncio
        asyncio.get_event_loop().run_until_complete(
            wf.human_approval("reject", "approver_002", "Too expensive")
        )

        assert wf.approval_decision == "reject"
        assert wf.approver_id == "approver_002"

    def test_invalid_decision_ignored(self):
        wf = RequisitionToOrderWorkflow()
        import asyncio
        asyncio.get_event_loop().run_until_complete(
            wf.human_approval("maybe", "approver_003")
        )

        # Should remain None — invalid decisions are silently ignored
        assert wf.approval_decision is None
        assert wf.approver_id is None

    def test_empty_decision_ignored(self):
        wf = RequisitionToOrderWorkflow()
        import asyncio
        asyncio.get_event_loop().run_until_complete(
            wf.human_approval("", "approver_004")
        )
        assert wf.approval_decision is None


# ============================================
# Duplicate signal guard
# ============================================


class TestDuplicateSignalGuard:
    def test_second_signal_ignored(self):
        wf = RequisitionToOrderWorkflow()
        import asyncio
        loop = asyncio.get_event_loop()

        # First signal: approve
        loop.run_until_complete(
            wf.human_approval("approve", "approver_001", "Approved")
        )
        assert wf.approval_decision == "approve"
        assert wf.approver_id == "approver_001"

        # Second signal: reject — should be ignored
        loop.run_until_complete(
            wf.human_approval("reject", "approver_002", "Changed my mind")
        )

        # Decision should still be the first one
        assert wf.approval_decision == "approve"
        assert wf.approver_id == "approver_001"
        assert wf.approval_comments == "Approved"

    def test_invalid_then_valid(self):
        wf = RequisitionToOrderWorkflow()
        import asyncio
        loop = asyncio.get_event_loop()

        # Invalid signal — ignored
        loop.run_until_complete(wf.human_approval("maybe", "user1"))
        assert wf.approval_decision is None

        # Valid signal — accepted
        loop.run_until_complete(wf.human_approval("reject", "user2", "No budget"))
        assert wf.approval_decision == "reject"
        assert wf.approver_id == "user2"


# ============================================
# Vendor ID extraction
# ============================================


class TestExtractVendorId:
    def test_from_tool_calls(self):
        result = {
            "response": "Selected vendor X",
            "tool_calls": [
                {"name": "select_vendor", "args": {"vendor_id": "V-123", "score": 95}},
            ],
        }
        assert _extract_vendor_id(result) == "V-123"

    def test_from_top_level(self):
        result = {
            "response": "Selected vendor Y",
            "vendor_id": "V-456",
            "tool_calls": [],
        }
        assert _extract_vendor_id(result) == "V-456"

    def test_from_tool_results(self):
        result = {
            "response": "Selected vendor Z",
            "tool_calls": [],
            "tool_results": [
                {"vendor_id": "V-789", "vendor_name": "Acme Corp"},
            ],
        }
        assert _extract_vendor_id(result) == "V-789"

    def test_fallback_when_no_vendor_id(self):
        result = {
            "response": "I recommend considering Fisher Scientific for this order.",
            "tool_calls": [],
        }
        assert _extract_vendor_id(result) == "pending_vendor_assignment"

    def test_empty_result(self):
        assert _extract_vendor_id({}) == "pending_vendor_assignment"

    def test_tool_call_without_vendor_id(self):
        result = {
            "response": "Evaluated vendors",
            "tool_calls": [
                {"name": "compare", "args": {"category": "lab"}},
            ],
        }
        assert _extract_vendor_id(result) == "pending_vendor_assignment"


# ============================================
# Workflow query
# ============================================


class TestWorkflowQuery:
    def test_initial_status(self):
        wf = RequisitionToOrderWorkflow()
        status = wf.get_status()
        assert status["current_step"] == "initialized"
        assert status["requisition_id"] is None
        assert status["approval_decision"] is None
        assert status["approver_id"] is None


# ============================================
# Retry policy
# ============================================


class TestRetryPolicy:
    def test_agent_retry_config(self):
        assert AGENT_RETRY.maximum_attempts == 3
        assert AGENT_RETRY.backoff_coefficient == 2.0
