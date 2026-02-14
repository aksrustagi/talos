"""Tests for Talos API server."""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Create a test client with mocked dependencies."""
    # We need to mock lifespan to avoid real LLM/DB initialization
    from talos.api import server
    from talos.db import TalosDB
    from talos.schemas import ConversationSession

    # Set up test database and mocks
    test_db = TalosDB(":memory:")
    server.db = test_db
    server.notifier = MagicMock()
    server.notifier.notify_approval_needed = AsyncMock()
    server.notifier.notify_compliance_block = AsyncMock()
    server.notifier.notify_savings_found = AsyncMock()
    server.notifier.close = AsyncMock()

    # Mock agents
    server.agents = MagicMock()
    server.agents.router = MagicMock()
    server.agents.router.drain_history = MagicMock(return_value=[])

    # Mock chat engine
    server.chat_engine = MagicMock()
    server.chat_engine.sessions = {}
    server.chat_engine.load_session = MagicMock()
    server.chat_engine.message = AsyncMock(return_value={
        "message": "Test response",
        "session_id": "CHAT-TEST",
        "intent": "general",
    })

    # Mock pipeline runner
    server.pipeline_runner = MagicMock()
    server.savings_analyzer = MagicMock()

    with TestClient(server.app, raise_server_exceptions=False) as c:
        yield c

    test_db.close()


class TestHealthEndpoint:
    def test_health(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        assert "version" in data
        assert "timestamp" in data
        assert "auth_enabled" in data


class TestChatEndpoints:
    def test_chat_basic(self, client):
        resp = client.post("/chat", json={"message": "Hello"})
        assert resp.status_code == 200
        data = resp.json()
        assert "message" in data
        assert "session_id" in data

    def test_chat_message_too_long(self, client):
        resp = client.post("/chat", json={"message": "x" * 5001})
        assert resp.status_code == 422  # Validation error

    def test_chat_sessions_list(self, client):
        resp = client.get("/chat/sessions")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_chat_session_not_found(self, client):
        resp = client.get("/chat/sessions/CHAT-NONEXISTENT")
        assert resp.status_code == 404


class TestRequisitionEndpoints:
    def test_list_requisitions(self, client):
        resp = client.get("/requisitions")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_get_requisition_not_found(self, client):
        resp = client.get("/requisitions/PIPE-NONEXISTENT")
        assert resp.status_code == 404

    def test_list_with_pagination(self, client):
        resp = client.get("/requisitions?limit=10&offset=0")
        assert resp.status_code == 200


class TestSavingsEndpoints:
    def test_list_savings(self, client):
        resp = client.get("/savings")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_savings_summary(self, client):
        resp = client.get("/savings/summary")
        assert resp.status_code == 200

    def test_list_savings_with_period(self, client):
        resp = client.get("/savings?period=2025-01")
        assert resp.status_code == 200


class TestDashboardEndpoints:
    def test_dashboard(self, client):
        resp = client.get("/dashboard")
        assert resp.status_code == 200
        data = resp.json()
        assert "pipelines" in data
        assert "savings" in data

    def test_costs(self, client):
        resp = client.get("/costs")
        assert resp.status_code == 200


class TestVendorEndpoints:
    def test_get_vendor_prices(self, client):
        resp = client.get("/vendors/Lab%20Supplies")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


class TestInputValidation:
    def test_price_check_invalid_quantity(self, client):
        resp = client.post("/prices/check", json={
            "item_description": "Gloves",
            "quantity": -1,
        })
        assert resp.status_code == 422

    def test_savings_verify_negative_price(self, client):
        resp = client.post("/savings/verify", json={
            "description": "Test",
            "baseline_price": -10,
            "new_price": 5,
            "volume": 100,
        })
        assert resp.status_code == 422

    def test_requisition_empty_text(self, client):
        resp = client.post("/requisitions", json={})
        assert resp.status_code == 422


class TestSlackWebhook:
    def test_slack_webhook_missing_payload(self, client):
        resp = client.post("/webhooks/slack", data={})
        assert resp.status_code == 400

    def test_slack_webhook_invalid_json(self, client):
        resp = client.post("/webhooks/slack", data={"payload": "not json"})
        assert resp.status_code == 400

    def test_slack_webhook_no_actions(self, client):
        import json
        resp = client.post("/webhooks/slack", data={
            "payload": json.dumps({"actions": []})
        })
        assert resp.status_code == 200
        assert resp.json()["text"] == "No action received"

    def test_slack_webhook_approve(self, client):
        import json
        from talos.api import server

        # Save a pipeline first
        from talos.schemas import RequisitionPipeline
        pipe = RequisitionPipeline(id="PIPE-APPROVE-TEST", status="pending")
        server.db.save_pipeline(pipe, "university")

        resp = client.post("/webhooks/slack", data={
            "payload": json.dumps({
                "actions": [{"value": "approve_PIPE-APPROVE-TEST"}],
                "user": {"name": "testuser"},
            })
        })
        assert resp.status_code == 200
        assert "Approved" in resp.json()["text"]

        # Verify status changed
        updated = server.db.get_pipeline("PIPE-APPROVE-TEST")
        assert updated.status == "approved"

    def test_slack_webhook_reject(self, client):
        import json
        from talos.api import server
        from talos.schemas import RequisitionPipeline

        pipe = RequisitionPipeline(id="PIPE-REJECT-TEST", status="pending")
        server.db.save_pipeline(pipe, "university")

        resp = client.post("/webhooks/slack", data={
            "payload": json.dumps({
                "actions": [{"value": "reject_PIPE-REJECT-TEST"}],
                "user": {"name": "testuser"},
            })
        })
        assert resp.status_code == 200
        assert "Rejected" in resp.json()["text"]

    def test_slack_webhook_unknown_action(self, client):
        import json
        resp = client.post("/webhooks/slack", data={
            "payload": json.dumps({
                "actions": [{"value": "unknown_action"}],
                "user": {"name": "test"},
            })
        })
        assert resp.status_code == 200
        assert resp.json()["text"] == "Unknown action"
