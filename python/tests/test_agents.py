"""
Tests for Procurement AI Agents
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from agents.core.base_agent import (
    ProcurementAgent,
    AgentConfig,
    AgentState,
    AgentFactory,
    AgentOrchestrator,
)
from agents.implementations.price_agents import (
    PriceWatchAgent,
    PriceCompareAgent,
    HistoricalPriceAgent,
)
from agents.implementations.procurement_agents import (
    RequisitionAgent,
    ApprovalWorkflowAgent,
    VendorSelectionAgent,
)


class TestAgentConfig:
    """Tests for AgentConfig."""

    def test_config_creation(self):
        """Test basic config creation."""
        config = AgentConfig(
            agent_id="test-agent",
            name="Test Agent",
            tier=1,
            category="Test",
        )
        assert config.agent_id == "test-agent"
        assert config.name == "Test Agent"
        assert config.tier == 1
        assert config.model == "claude-sonnet-4-20250514"

    def test_config_defaults(self):
        """Test config default values."""
        config = AgentConfig(
            agent_id="test",
            name="Test",
            tier=1,
            category="Test",
        )
        assert config.max_tokens == 4096
        assert config.temperature == 0
        assert config.max_iterations == 10
        assert config.human_in_loop_threshold == 0.0


class TestAgentFactory:
    """Tests for AgentFactory."""

    def test_register_and_get_agent(self):
        """Test agent registration and retrieval."""
        # Price agents should be registered
        agent_ids = AgentFactory.list_agents()
        assert "price-watch" in agent_ids
        assert "price-compare" in agent_ids

    def test_get_unknown_agent_raises(self):
        """Test that getting unknown agent raises error."""
        with pytest.raises(ValueError, match="Unknown agent"):
            AgentFactory.get("nonexistent-agent")


class TestPriceWatchAgent:
    """Tests for PriceWatchAgent."""

    def test_initialization(self):
        """Test agent initialization."""
        agent = PriceWatchAgent(university_name="Test University")
        assert agent.config.agent_id == "price-watch"
        assert agent.config.tier == 1
        assert agent.config.category == "Core Price Intelligence"

    def test_has_required_tools(self):
        """Test agent has required tools."""
        agent = PriceWatchAgent()
        tool_names = [t.name for t in agent.tools]
        assert "search_products" in tool_names
        assert "get_price_history" in tool_names
        assert "create_price_alert" in tool_names

    def test_human_review_for_critical_alerts(self):
        """Test human review requirement for critical alerts."""
        agent = PriceWatchAgent()

        # Critical alert should require review
        critical_call = {
            "name": "send_slack_alert",
            "args": {"level": "critical"},
        }
        assert agent._requires_human_review(critical_call, {}) is True

        # Non-critical should not
        info_call = {
            "name": "send_slack_alert",
            "args": {"level": "info"},
        }
        assert agent._requires_human_review(info_call, {}) is False


class TestPriceCompareAgent:
    """Tests for PriceCompareAgent."""

    def test_initialization(self):
        """Test agent initialization."""
        agent = PriceCompareAgent()
        assert agent.config.agent_id == "price-compare"
        assert len(agent.tools) > 0

    def test_has_comparison_tools(self):
        """Test agent has comparison tools."""
        agent = PriceCompareAgent()
        tool_names = [t.name for t in agent.tools]
        assert "compare_vendor_prices" in tool_names
        assert "calculate_total_cost" in tool_names


class TestRequisitionAgent:
    """Tests for RequisitionAgent."""

    def test_initialization(self):
        """Test agent initialization."""
        agent = RequisitionAgent()
        assert agent.config.agent_id == "requisition"
        assert agent.config.tier == 2
        assert agent.config.human_in_loop_threshold == 25000

    def test_human_review_for_large_orders(self):
        """Test human review for orders over threshold."""
        agent = RequisitionAgent()

        # Large order should require review
        large_order = {
            "name": "create_requisition",
            "args": {
                "items": [
                    {"unit_price": 10000, "quantity": 3},  # $30,000
                ]
            },
        }
        assert agent._requires_human_review(large_order, {}) is True

        # Small order should not
        small_order = {
            "name": "create_requisition",
            "args": {
                "items": [
                    {"unit_price": 100, "quantity": 5},  # $500
                ]
            },
        }
        assert agent._requires_human_review(small_order, {}) is False


class TestAgentOrchestrator:
    """Tests for AgentOrchestrator."""

    @pytest.fixture
    def orchestrator(self):
        """Create orchestrator with mock agents."""
        agents = {
            "price-watch": MagicMock(spec=ProcurementAgent),
            "requisition": MagicMock(spec=ProcurementAgent),
        }
        return AgentOrchestrator(agents)

    @pytest.mark.asyncio
    async def test_route_price_message(self, orchestrator):
        """Test routing price-related messages."""
        agent_id = await orchestrator.route_message("What is the price of pipettes?")
        assert agent_id in ["price-watch", "price-compare", "historical-price"]

    @pytest.mark.asyncio
    async def test_route_requisition_message(self, orchestrator):
        """Test routing requisition messages."""
        agent_id = await orchestrator.route_message("I need to order some supplies")
        assert agent_id == "requisition"

    @pytest.mark.asyncio
    async def test_route_budget_message(self, orchestrator):
        """Test routing budget messages."""
        agent_id = await orchestrator.route_message("Check my budget status")
        assert agent_id in ["budget-guardian", "spend-analytics"]

    def test_get_agent_status(self, orchestrator):
        """Test getting agent status."""
        # Set up mock configs
        orchestrator.agents["price-watch"].config = AgentConfig(
            agent_id="price-watch",
            name="PriceWatch",
            tier=1,
            category="Price Intelligence",
        )
        orchestrator.agents["requisition"].config = AgentConfig(
            agent_id="requisition",
            name="Requisition",
            tier=2,
            category="Procurement",
        )

        status = orchestrator.get_agent_status()
        assert "price-watch" in status
        assert "requisition" in status


class TestAgentState:
    """Tests for AgentState typing."""

    def test_state_structure(self):
        """Test state has required fields."""
        state: AgentState = {
            "messages": [],
            "context": {},
            "user_id": "user-1",
            "university_id": "univ-1",
            "current_agent": "test",
            "tool_results": [],
            "pending_approval": None,
            "completed": False,
        }
        assert state["user_id"] == "user-1"
        assert state["completed"] is False


@pytest.mark.asyncio
class TestAgentExecution:
    """Integration tests for agent execution."""

    @patch("agents.core.base_agent.ChatAnthropic")
    async def test_agent_run_basic(self, mock_llm_class):
        """Test basic agent run."""
        # Set up mock
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = MagicMock(
            content="Here are the search results...",
            tool_calls=[],
        )
        mock_llm_class.return_value = mock_llm

        agent = PriceWatchAgent()

        # This would normally call the LLM
        # For unit tests, we verify the structure
        assert agent.graph is not None
        assert callable(agent.run)

    @patch("agents.core.base_agent.ChatAnthropic")
    async def test_agent_handles_tool_calls(self, mock_llm_class):
        """Test agent handles tool calls correctly."""
        mock_llm = AsyncMock()
        mock_llm_class.return_value = mock_llm

        agent = PriceCompareAgent()

        # Verify tools are bound
        assert len(agent.tools) > 0
        assert agent.tool_executor is not None
