"""Tests for Talos LLM router."""
import pytest
from talos.llm import LLMRouter, LLMCall
from talos.schemas import ParsedRequisition


class TestLLMCall:
    def test_default_values(self):
        call = LLMCall(agent="test", model="test-model")
        assert call.tokens_in == 0
        assert call.tokens_out == 0
        assert call.cost == 0.0
        assert call.success is True
        assert call.error is None

    def test_with_error(self):
        call = LLMCall(agent="test", model="test-model", success=False, error="timeout")
        assert call.success is False
        assert call.error == "timeout"


class TestLLMRouter:
    def test_init(self):
        router = LLMRouter()
        assert router.history == []
        assert router._client is None

    def test_drain_history(self):
        router = LLMRouter()
        router.history.append(LLMCall(agent="a", model="m", cost=0.01))
        router.history.append(LLMCall(agent="b", model="m", cost=0.02))
        drained = router.drain_history()
        assert len(drained) == 2
        assert router.history == []

    def test_drain_history_empty(self):
        router = LLMRouter()
        drained = router.drain_history()
        assert drained == []

    def test_total_cost(self):
        router = LLMRouter()
        router.history.append(LLMCall(agent="a", model="m", cost=0.01))
        router.history.append(LLMCall(agent="b", model="m", cost=0.02))
        assert router.total_cost() == pytest.approx(0.03)

    def test_cost_by_agent(self):
        router = LLMRouter()
        router.history.append(LLMCall(agent="parser", model="m", cost=0.01))
        router.history.append(LLMCall(agent="parser", model="m", cost=0.02))
        router.history.append(LLMCall(agent="compliance", model="m", cost=0.05))
        by_agent = router.cost_by_agent()
        assert by_agent["parser"] == pytest.approx(0.03)
        assert by_agent["compliance"] == pytest.approx(0.05)


class TestParseJson:
    def setup_method(self):
        self.router = LLMRouter()

    def test_parse_valid_json(self):
        content = '{"req_id": "REQ-001", "items": [], "estimated_total": 100}'
        result = self.router._parse_json(content, ParsedRequisition)
        assert result.req_id == "REQ-001"
        assert result.estimated_total == 100

    def test_parse_json_with_markdown_fences(self):
        content = '```json\n{"req_id": "REQ-002", "items": [], "estimated_total": 200}\n```'
        result = self.router._parse_json(content, ParsedRequisition)
        assert result.req_id == "REQ-002"

    def test_parse_json_with_surrounding_text(self):
        content = 'Here is the result:\n{"req_id": "REQ-003", "items": [], "estimated_total": 300}\nDone.'
        result = self.router._parse_json(content, ParsedRequisition)
        assert result.req_id == "REQ-003"

    def test_parse_invalid_json_returns_none(self):
        content = "This is not JSON at all"
        result = self.router._parse_json(content, ParsedRequisition)
        assert result is None
