"""Tests for Talos chat engine."""
import pytest
from talos.chat.engine import ChatEngine, INTENT_RULES


class TestIntentDetection:
    def setup_method(self):
        self.engine = ChatEngine.__new__(ChatEngine)
        self.engine.sessions = {}

    def test_buy_intent(self):
        assert self.engine._detect_intent("I need 50 boxes of gloves") == "buy"
        assert self.engine._detect_intent("Can you purchase some supplies?") == "buy"
        assert self.engine._detect_intent("I want to order lab equipment") == "buy"

    def test_price_intent(self):
        assert self.engine._detect_intent("How much do gloves cost?") == "price"
        assert self.engine._detect_intent("What's the pricing for lab supplies?") == "price"
        assert self.engine._detect_intent("Compare prices for nitrile gloves") == "price"

    def test_policy_intent(self):
        assert self.engine._detect_intent("What is the policy for equipment?") == "policy"
        assert self.engine._detect_intent("What's the approval threshold?") == "policy"
        assert self.engine._detect_intent("Is this compliant with regulations?") == "policy"

    def test_savings_intent(self):
        assert self.engine._detect_intent("How can we save money on supplies?") == "savings"
        assert self.engine._detect_intent("Let's optimize spend across departments") == "savings"

    def test_status_intent(self):
        assert self.engine._detect_intent("What's the status of my gloves?") == "status"
        assert self.engine._detect_intent("Where is my shipment?") == "status"
        assert self.engine._detect_intent("Track my delivery") == "status"

    def test_help_intent(self):
        assert self.engine._detect_intent("Help me with something") == "help"
        assert self.engine._detect_intent("What is a fiscal year?") == "help"
        assert self.engine._detect_intent("Explain the process") == "help"

    def test_general_intent(self):
        assert self.engine._detect_intent("Hello there") == "general"
        assert self.engine._detect_intent("Thanks!") == "general"

    def test_priority_buy_over_price(self):
        # "I need to buy" has both "need" (buy) and could be confused
        # buy priority (6) > price priority (5)
        assert self.engine._detect_intent("I need to purchase something, what's the cost?") == "buy"

    def test_priority_buy_over_help(self):
        # "how do i buy" has "how do i" (help) and "buy" (buy)
        # buy priority (6) > help priority (1)
        assert self.engine._detect_intent("how do i buy gloves?") == "buy"


class TestIntentRulesStructure:
    def test_all_intents_have_required_fields(self):
        for rule in INTENT_RULES:
            assert "intent" in rule
            assert "keywords" in rule
            assert "priority" in rule
            assert isinstance(rule["keywords"], list)
            assert isinstance(rule["priority"], int)

    def test_priorities_are_unique(self):
        priorities = [r["priority"] for r in INTENT_RULES]
        assert len(priorities) == len(set(priorities))


class TestSessionManagement:
    def setup_method(self):
        self.engine = ChatEngine.__new__(ChatEngine)
        self.engine.sessions = {}

    def test_create_new_session(self):
        session = self.engine._get_or_create_session(requester="Dr. Chen", department="Chemistry")
        assert session.session_id.startswith("CHAT-")
        assert session.requester_name == "Dr. Chen"
        assert session.department == "Chemistry"

    def test_reuse_existing_session(self):
        session1 = self.engine._get_or_create_session(requester="Dr. Chen")
        session2 = self.engine._get_or_create_session(session_id=session1.session_id)
        assert session1 is session2

    def test_load_session(self):
        from talos.schemas import ConversationSession
        session = ConversationSession(session_id="CHAT-LOADED", requester_name="Test")
        self.engine.load_session(session)
        assert "CHAT-LOADED" in self.engine.sessions
