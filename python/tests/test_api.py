"""Tests for FastAPI endpoints.

Uses TestClient (synchronous) to validate request/response shapes,
validation, and error handling. These tests do NOT require a running
Temporal server — they exercise the fallback (direct agent call) path
and the audit endpoints.
"""

import os
import sys
import json
from unittest.mock import patch, AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient


# ============================================
# Fixtures
# ============================================


@pytest.fixture(autouse=True)
def _patch_temporal_client():
    """Ensure temporal_client is None for all API tests (fallback mode)."""
    with patch("api.main.temporal_client", None):
        yield


@pytest.fixture
def client():
    from api.main import app
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def auth_headers():
    return {
        "X-User-ID": "test_user",
        "X-University-ID": "test_univ",
        "X-User-Email": "test@university.edu",
        "X-Department": "Testing",
        "X-Role": "requester",
    }


# ============================================
# Health & system endpoints
# ============================================


class TestHealthEndpoints:
    def test_health_check(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data
        assert "temporal_connected" in data

    def test_list_agents(self, client, auth_headers):
        resp = client.get("/api/agents", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "agents" in data
        assert "count" in data
        assert data["count"] > 0

    def test_get_agent_info(self, client, auth_headers):
        resp = client.get("/api/agents/requisition", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["agent_id"] == "requisition"
        assert "name" in data

    def test_get_unknown_agent(self, client, auth_headers):
        resp = client.get("/api/agents/nonexistent-agent", headers=auth_headers)
        assert resp.status_code == 404

    def test_metrics_endpoint(self, client, auth_headers):
        resp = client.get("/api/metrics", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "requests_total" in data
        assert "avg_latency_ms" in data


# ============================================
# Auth middleware
# ============================================


class TestAuthMiddleware:
    def test_public_path_no_auth_needed(self, client):
        """Health endpoint is public — no auth headers required."""
        resp = client.get("/api/health")
        assert resp.status_code == 200

    def test_protected_path_requires_auth(self, client):
        """Non-public endpoints return 401 without auth headers."""
        resp = client.get("/api/agents")
        assert resp.status_code == 401
        assert "detail" in resp.json()

    def test_auth_headers_accepted(self, client, auth_headers):
        """Header-based auth works in development mode."""
        resp = client.get("/api/agents", headers=auth_headers)
        assert resp.status_code == 200


# ============================================
# Workflow endpoints (Temporal unavailable / fallback)
# ============================================


class TestWorkflowEndpointsFallback:
    def test_start_workflow_falls_back_to_direct(self, client, auth_headers):
        """When Temporal is unavailable, the endpoint falls back to direct agent call."""
        with patch("api.main.orchestrator") as mock_orch:
            mock_orch.execute = AsyncMock(return_value={
                "response": "Requisition created",
                "agent_id": "requisition",
            })

            resp = client.post(
                "/api/workflows/requisition",
                json={
                    "items": [{"description": "Test item", "quantity": 1, "unit_price": 100}],
                    "budget_code": "TEST-001",
                    "urgency": "standard",
                },
                headers=auth_headers,
            )

            assert resp.status_code == 200
            data = resp.json()
            assert data["mode"] == "direct"
            assert data["status"] == "created"

    def test_workflow_status_returns_503(self, client, auth_headers):
        """Status endpoint returns 503 when Temporal is unavailable."""
        resp = client.get(
            "/api/workflows/wf-123/status",
            headers=auth_headers,
        )
        assert resp.status_code == 503

    def test_workflow_approve_returns_503(self, client, auth_headers):
        resp = client.post(
            "/api/workflows/wf-123/approve",
            json={"decision": "approve"},
            headers=auth_headers,
        )
        assert resp.status_code == 503

    def test_workflow_result_returns_503(self, client, auth_headers):
        resp = client.get(
            "/api/workflows/wf-123/result",
            headers=auth_headers,
        )
        assert resp.status_code == 503


# ============================================
# Request validation
# ============================================


class TestRequestValidation:
    def test_workflow_missing_items(self, client, auth_headers):
        resp = client.post(
            "/api/workflows/requisition",
            json={"budget_code": "TEST-001"},
            headers=auth_headers,
        )
        assert resp.status_code == 422  # Pydantic validation error

    def test_workflow_missing_budget_code(self, client, auth_headers):
        resp = client.post(
            "/api/workflows/requisition",
            json={"items": [{"description": "Test"}]},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    def test_approval_signal_missing_decision(self, client, auth_headers):
        resp = client.post(
            "/api/workflows/wf-123/approve",
            json={},
            headers=auth_headers,
        )
        # Should fail validation before hitting 503
        assert resp.status_code in (422, 503)


# ============================================
# Audit endpoints
# ============================================


class TestAuditEndpoints:
    def test_audit_trail_not_found(self, client, auth_headers):
        resp = client.get(
            "/api/audit/NONEXISTENT-REQ",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    def test_audit_export_not_found(self, client, auth_headers):
        resp = client.get(
            "/api/audit/export/NONEXISTENT-REQ",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    def test_audit_by_po_not_found(self, client, auth_headers):
        resp = client.get(
            "/api/audit/po/NONEXISTENT-PO",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    def test_audit_by_contract_not_found(self, client, auth_headers):
        resp = client.get(
            "/api/audit/contract/NONEXISTENT-CON",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    def test_audit_trail_with_data(self, client, auth_headers, tmp_audit_db):
        """Insert audit data and retrieve it via the API."""
        from audit.audit_log import AuditLogger

        with patch("api.main.get_audit_logger") as mock_get:
            logger = AuditLogger(tmp_audit_db)
            logger.log_agent_call(
                agent_name="TestAgent",
                agent_id="test",
                input_message="test",
                output_response="test",
                model_used="test",
                triggered_by="system",
                requisition_id="REQ-API-TEST",
                duration_ms=100,
            )
            mock_get.return_value = logger

            resp = client.get(
                "/api/audit/REQ-API-TEST",
                headers=auth_headers,
            )

            assert resp.status_code == 200
            data = resp.json()
            assert data["requisition_id"] == "REQ-API-TEST"
            assert len(data["decision_chain"]) == 1
            assert data["summary"]["total_entries"] == 1


# ============================================
# User context extraction
# ============================================


class TestUserContext:
    def test_default_headers(self, client):
        """Without auth headers, public endpoints still work."""
        resp = client.get("/api/health")
        assert resp.status_code == 200

    def test_custom_headers(self, client, auth_headers):
        with patch("api.main.orchestrator") as mock_orch:
            mock_orch.execute = AsyncMock(return_value={
                "response": "ok",
                "agent_id": "requisition",
            })

            resp = client.post(
                "/api/workflows/requisition",
                json={
                    "items": [{"description": "X", "quantity": 1, "unit_price": 10}],
                    "budget_code": "T-001",
                },
                headers=auth_headers,
            )
            assert resp.status_code == 200
