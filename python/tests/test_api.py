"""
Tests for FastAPI Endpoints
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

# We'll import the app but mock the agent orchestrator
with patch("api.main.orchestrator") as mock_orchestrator:
    from api.main import app


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def mock_orchestrator():
    """Create mock orchestrator."""
    orchestrator = MagicMock()
    orchestrator.execute = AsyncMock(return_value={
        "response": "Test response",
        "tool_calls": [],
        "actions": [],
    })
    orchestrator.route_message = AsyncMock(return_value="requisition")
    orchestrator.get_agent_status = MagicMock(return_value={
        "price-watch": {"name": "PriceWatch", "tier": 1},
    })
    return orchestrator


class TestHealthEndpoint:
    """Tests for health endpoint."""

    def test_health_check(self, client):
        """Test health check returns healthy."""
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data


class TestAgentEndpoints:
    """Tests for agent listing endpoints."""

    def test_list_agents(self, client):
        """Test listing all agents."""
        response = client.get("/api/agents")
        assert response.status_code == 200
        data = response.json()
        assert "agents" in data
        assert "count" in data


class TestChatEndpoints:
    """Tests for chat endpoints."""

    @patch("api.main.orchestrator")
    def test_chat_basic(self, mock_orch, client):
        """Test basic chat endpoint."""
        mock_orch.route_message = AsyncMock(return_value="requisition")
        mock_orch.execute = AsyncMock(return_value={
            "response": "I can help you order supplies.",
            "tool_calls": [],
            "actions": [],
        })

        response = client.post(
            "/api/chat",
            json={"content": "I need to order some pipettes"},
            headers={
                "X-User-ID": "user-001",
                "X-University-ID": "univ-001",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        assert "agent_id" in data
        assert "timestamp" in data

    @patch("api.main.orchestrator")
    def test_chat_with_specific_agent(self, mock_orch, client):
        """Test chat with specific agent."""
        mock_orch.execute = AsyncMock(return_value={
            "response": "Price comparison results...",
            "tool_calls": [],
        })

        response = client.post(
            "/api/chat",
            json={
                "content": "Compare prices for product-123",
                "agent_id": "price-compare",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["agent_id"] == "price-compare"

    @patch("api.main.orchestrator")
    def test_chat_with_context(self, mock_orch, client):
        """Test chat with additional context."""
        mock_orch.execute = AsyncMock(return_value={
            "response": "Found within budget.",
            "tool_calls": [],
        })

        response = client.post(
            "/api/chat",
            json={
                "content": "Order supplies",
                "context": {
                    "budget_code": "CHEM-2024-001",
                    "department": "Chemistry",
                },
            },
        )

        assert response.status_code == 200


class TestRequisitionEndpoints:
    """Tests for requisition endpoints."""

    @patch("api.main.orchestrator")
    def test_create_requisition(self, mock_orch, client):
        """Test creating a requisition."""
        mock_orch.execute = AsyncMock(return_value={
            "response": "Created requisition REQ-12345",
            "actions": [{"type": "requisition_created", "id": "REQ-12345"}],
        })

        response = client.post(
            "/api/requisitions",
            json={
                "items": [
                    {"product_id": "prod-1", "quantity": 10, "unit_price": 50},
                ],
                "budget_code": "DEPT-001",
                "urgency": "standard",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "created"

    def test_get_requisition(self, client):
        """Test getting requisition details."""
        response = client.get("/api/requisitions/REQ-12345")
        assert response.status_code == 200
        data = response.json()
        assert "requisition_id" in data
        assert "status" in data


class TestPriceEndpoints:
    """Tests for price intelligence endpoints."""

    @patch("api.main.orchestrator")
    def test_compare_prices(self, mock_orch, client):
        """Test price comparison endpoint."""
        mock_orch.execute = AsyncMock(return_value={
            "response": "Best price: $50 at Vendor A",
            "tool_results": [{"vendor": "A", "price": 50}],
        })

        response = client.get("/api/prices/compare/prod-123?quantity=10")
        assert response.status_code == 200
        data = response.json()
        assert data["product_id"] == "prod-123"
        assert data["quantity"] == 10
        assert "comparison" in data

    @patch("api.main.orchestrator")
    def test_price_history(self, mock_orch, client):
        """Test price history endpoint."""
        mock_orch.execute = AsyncMock(return_value={
            "response": "Price has been stable for 6 months.",
        })

        response = client.get("/api/prices/history/prod-123?days=180")
        assert response.status_code == 200
        data = response.json()
        assert data["product_id"] == "prod-123"
        assert data["days"] == 180

    @patch("api.main.orchestrator")
    def test_create_price_alert(self, mock_orch, client):
        """Test creating price alert."""
        mock_orch.execute = AsyncMock(return_value={
            "response": "Alert created successfully.",
        })

        response = client.post(
            "/api/prices/alerts",
            params={
                "product_id": "prod-123",
                "alert_type": "price_drop",
                "threshold": 10.0,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "created"


class TestApprovalEndpoints:
    """Tests for approval endpoints."""

    @patch("api.main.orchestrator")
    def test_get_pending_approvals(self, mock_orch, client):
        """Test getting pending approvals."""
        mock_orch.execute = AsyncMock(return_value={
            "response": "You have 3 pending approvals.",
        })

        response = client.get(
            "/api/approvals/pending",
            headers={"X-User-ID": "approver-001"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "approver_id" in data

    @patch("api.main.orchestrator")
    def test_process_approval(self, mock_orch, client):
        """Test processing approval decision."""
        mock_orch.execute = AsyncMock(return_value={
            "response": "Approval processed.",
        })

        response = client.post(
            "/api/approvals/action",
            json={
                "approval_id": "APR-12345",
                "decision": "approve",
                "comments": "Looks good!",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "processed"
        assert data["decision"] == "approve"


class TestVendorEndpoints:
    """Tests for vendor endpoints."""

    @patch("api.main.orchestrator")
    def test_get_vendor_score(self, mock_orch, client):
        """Test getting vendor scorecard."""
        mock_orch.execute = AsyncMock(return_value={
            "response": "Vendor score: 4.5/5.0",
        })

        response = client.get("/api/vendors/vendor-123/score")
        assert response.status_code == 200
        data = response.json()
        assert data["vendor_id"] == "vendor-123"

    @patch("api.main.orchestrator")
    def test_find_diverse_vendors(self, mock_orch, client):
        """Test finding diverse vendors."""
        mock_orch.execute = AsyncMock(return_value={
            "response": "Found 5 MWBE vendors.",
        })

        response = client.get(
            "/api/vendors/diverse",
            params={"category": "lab-supplies", "diversity_type": "MWBE"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["category"] == "lab-supplies"


class TestWebhookEndpoints:
    """Tests for webhook endpoints."""

    def test_catalog_webhook(self, client):
        """Test catalog update webhook."""
        response = client.post(
            "/api/webhooks/catalog",
            json={
                "event_type": "catalog_updated",
                "data": {"vendor_id": "vendor-123"},
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "received"
        assert data["event_type"] == "catalog_updated"


class TestErrorHandling:
    """Tests for error handling."""

    @patch("api.main.orchestrator")
    def test_chat_error_handling(self, mock_orch, client):
        """Test error handling in chat endpoint."""
        mock_orch.route_message = AsyncMock(side_effect=Exception("Test error"))

        response = client.post(
            "/api/chat",
            json={"content": "test"},
        )

        assert response.status_code == 500

    def test_invalid_agent_id(self, client):
        """Test requesting invalid agent."""
        response = client.get("/api/agents/nonexistent-agent")
        assert response.status_code == 404
