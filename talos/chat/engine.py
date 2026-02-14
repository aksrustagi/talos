"""
Talos Chat Engine — The "doanything.com for procurement" conversational interface.

Game-changing decision #2: CONVERSATIONAL UX
- Users describe what they need in plain English
- Talos figures out the "how" — routes to correct agents autonomously
- No forms, no dropdowns, no training required
- Remembers context within a session
- Asks smart clarifying questions only when needed

This is the core differentiator vs Coupa/Zip/Procurify's form-heavy UX.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from ..schemas import ChatMessage, ConversationSession
from ..agents.core import TalosAgents
from ..agents.pipeline import RequisitionPipelineRunner
from ..config import get_config

log = logging.getLogger("talos.chat")


# Intent categories with priority order (higher index = higher priority for disambiguation)
# Each intent has keywords and a priority score; when multiple intents match,
# the one with the highest score wins.
INTENT_RULES = [
    {
        "intent": "help",
        "keywords": ["help", "how do i", "what is", "explain", "guide", "tutorial"],
        "priority": 1,
    },
    {
        "intent": "status",
        "keywords": ["status", "where is", "track", "update on", "what happened to", "my order"],
        "priority": 2,
    },
    {
        "intent": "policy",
        "keywords": ["can i", "allowed", "policy", "threshold", "approval needed",
                      "compliant", "regulation", "rules for"],
        "priority": 3,
    },
    {
        "intent": "savings",
        "keywords": ["savings", "save money", "optimize spend", "reduce cost",
                      "negotiate", "renegotiate", "consolidate spend"],
        "priority": 4,
    },
    {
        "intent": "price",
        "keywords": ["price", "cost", "how much", "quote", "pricing", "compare prices",
                      "cheapest", "what does .* cost"],
        "priority": 5,
    },
    {
        "intent": "buy",
        "keywords": ["need", "purchase", "order", "buy", "request", "get me",
                      "procure", "acquire", "requisition", "i want"],
        "priority": 6,
    },
]


class ChatEngine:
    """
    Conversational procurement assistant. Takes natural language, routes to agents.

    Usage:
        engine = ChatEngine("university")
        response = await engine.message("I need 50 boxes of gloves for the chem lab")
        # Returns: "I'll process that requisition for you. Here's what I found..."
    """

    def __init__(self, client_type: str = "university",
                 agents: TalosAgents | None = None,
                 pipeline_runner: RequisitionPipelineRunner | None = None):
        self.client_type = client_type
        self.agents = agents or TalosAgents(client_type)
        self.pipeline_runner = pipeline_runner or RequisitionPipelineRunner(client_type)
        self.sessions: dict[str, ConversationSession] = {}

    def _get_or_create_session(self, session_id: str | None = None,
                                requester: str = "", department: str = "") -> ConversationSession:
        if session_id and session_id in self.sessions:
            return self.sessions[session_id]
        session = ConversationSession(requester_name=requester, department=department)
        self.sessions[session.session_id] = session
        return session

    def load_session(self, session: ConversationSession):
        """Load a session from DB into memory."""
        self.sessions[session.session_id] = session

    def _detect_intent(self, message: str) -> str:
        """Detect what the user wants using scored keyword matching.
        Higher-priority intents win when multiple match.
        """
        lower = message.lower()
        best_intent = "general"
        best_priority = 0

        for rule in INTENT_RULES:
            if any(kw in lower for kw in rule["keywords"]):
                if rule["priority"] > best_priority:
                    best_priority = rule["priority"]
                    best_intent = rule["intent"]

        return best_intent

    async def message(
        self,
        text: str,
        session_id: str | None = None,
        requester: str = "",
        department: str = "",
    ) -> dict:
        """
        Process a user message. Returns response with any pipeline results.

        This is the main entry point. Users just talk naturally:
        - "I need 50 boxes of gloves" -> triggers full pipeline
        - "How much do nitrile gloves cost?" -> triggers price check
        - "Can I buy a $50K instrument on my NSF grant?" -> triggers policy lookup
        - "What's the status of my glove order?" -> status check
        """
        config = get_config()
        if not config.enable_chat:
            return {
                "message": "Chat mode is currently disabled. Please use the API endpoints directly.",
                "session_id": session_id,
                "intent": "disabled",
            }

        text = text[:5000]  # Cap input length

        session = self._get_or_create_session(session_id, requester, department)

        # Record user message
        session.messages.append(ChatMessage(role="user", content=text))

        intent = self._detect_intent(text)
        log.info(f"[{session.session_id}] Intent: {intent} | Message: {text[:80]}")

        try:
            if intent == "buy":
                response = await self._handle_buy(session, text)
            elif intent == "price":
                response = await self._handle_price(session, text)
            elif intent == "policy":
                response = await self._handle_policy(session, text)
            elif intent == "savings":
                response = await self._handle_savings(session, text)
            else:
                response = await self._handle_knowledge(session, text)
        except Exception as e:
            log.error(f"[{session.session_id}] Error: {e}", exc_info=True)
            response = {
                "message": "I ran into an issue processing your request. Please try again or rephrase.",
                "intent": intent,
                "error": str(e)[:200],
            }

        # Record assistant response
        session.messages.append(ChatMessage(
            role="assistant",
            content=response.get("message", ""),
            metadata={"intent": intent},
        ))

        response["session_id"] = session.session_id
        response["intent"] = intent
        return response

    async def _handle_buy(self, session: ConversationSession, text: str) -> dict:
        """Handle a purchase request — runs the full pipeline."""
        result = await self.pipeline_runner.process(
            raw_text=text,
            requester_name=session.requester_name,
            department=session.department,
            channel="chat",
        )
        session.pipeline_id = result.id

        # Build a human-readable response
        parts = [f"I've processed your request (#{result.id})."]

        if result.parsed:
            parts.append(f"\n**Items identified:** {len(result.parsed.items)}")
            for item in result.parsed.items[:5]:
                price_str = f" @ ${item.estimated_unit_price:.2f}/ea" if item.estimated_unit_price else ""
                parts.append(f"  - {item.description} x {item.quantity}{price_str}")
            parts.append(f"\n**Estimated total:** ${result.parsed.estimated_total:,.2f}")
            parts.append(f"**Category:** {result.parsed.category}")

        if result.compliance:
            if result.compliance.is_compliant:
                parts.append("\n**Compliance:** Passed")
            else:
                parts.append(f"\n**Compliance:** {len(result.compliance.violations)} issue(s) found")
                for v in result.compliance.violations[:3]:
                    parts.append(f"  - [{v.severity}] {v.description[:100]}")

            if result.compliance.required_approvals:
                parts.append(f"\n**Approvals needed:** {len(result.compliance.required_approvals)}")
                for a in result.compliance.required_approvals[:3]:
                    parts.append(f"  - {a.approver_role}: {a.threshold_reason}")

        if result.pricing:
            parts.append(f"\n**Best price found:** ${result.pricing.recommended_price:,.2f} from {result.pricing.recommended_vendor}")
            if result.pricing.savings_vs_current and result.pricing.savings_vs_current > 0:
                parts.append(f"**Potential savings:** ${result.pricing.savings_vs_current:,.2f}/unit")

        if result.savings:
            parts.append(f"\n**Total savings identified:** ${result.savings.total_savings:,.2f}")

        parts.append(f"\n**Processing cost:** ${result.total_llm_cost:.4f}")
        parts.append(f"**Status:** {result.status}")

        if result.errors:
            parts.append(f"\n**Warnings:** {', '.join(result.errors)}")

        return {
            "message": "\n".join(parts),
            "pipeline_id": result.id,
            "pipeline": result.model_dump(),
        }

    async def _handle_price(self, session: ConversationSession, text: str) -> dict:
        """Handle a price check request."""
        result = await self.agents.price_tracker(item_description=text)

        parts = [f"**Price check for:** {result.item_description or text[:60]}"]
        parts.append(f"\n**Price range:** ${result.lowest_price:,.2f} - ${result.highest_price:,.2f}")
        parts.append(f"**Recommended:** {result.recommended_vendor} @ ${result.recommended_price:,.2f}")

        if result.prices_found:
            parts.append("\n**Sources found:**")
            for p in result.prices_found[:6]:
                contract = " [CONTRACT]" if p.contract_price else ""
                parts.append(f"  - {p.vendor_name}: ${p.unit_price:,.2f}{contract} ({p.source})")

        if result.savings_vs_current and result.savings_vs_current > 0:
            parts.append(f"\n**Savings vs current:** ${result.savings_vs_current:,.2f}/unit")

        return {
            "message": "\n".join(parts),
            "pricing": result.model_dump(),
        }

    async def _handle_policy(self, session: ConversationSession, text: str) -> dict:
        """Handle a policy/compliance question."""
        answer = await self.agents.knowledge_base(text)
        return {"message": answer}

    async def _handle_savings(self, session: ConversationSession, text: str) -> dict:
        """Handle savings/optimization questions using knowledge base for general queries."""
        # Use knowledge base (smart tier) for conversational savings questions
        # rather than the proactive optimization agent (genius tier) which expects
        # structured spend data
        answer = await self.agents.knowledge_base(
            f"The user is asking about procurement savings and cost optimization. "
            f"Answer their question helpfully: {text}"
        )
        return {"message": answer}

    async def _handle_knowledge(self, session: ConversationSession, text: str) -> dict:
        """Handle general questions via the knowledge base."""
        answer = await self.agents.knowledge_base(text)
        return {"message": answer}

    async def close(self):
        await self.agents.close()
        await self.pipeline_runner.close()
