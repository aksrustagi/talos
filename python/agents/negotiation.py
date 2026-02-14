"""
Talos AI — Agent 6: Negotiation

Expert procurement negotiator that conducts multi-round negotiations with
vendors via email, portal messages, and structured API communications.
Uses the genius model tier for complex strategic reasoning.
"""

import json
import logging
from typing import Optional

from llm.router import LLMRouter, ModelTier
from llm.prompts.agent_06_negotiation import AGENT_06_SYSTEM_PROMPT
from models.core import NegotiationResult

logger = logging.getLogger(__name__)


async def run_negotiation(
    router: LLMRouter,
    input_data: dict,
    client_mode: str = "university",
) -> NegotiationResult:
    """
    Conduct or advance a negotiation round with a vendor.

    Analyzes the current negotiation state, market intelligence, leverage
    points, and vendor history to craft the optimal counter-offer or
    acceptance strategy. Generates email/message content for the next round.

    Args:
        router: LLM router instance
        input_data: Negotiation state including vendor details, current
                    offers, target price, approved floor, leverage points,
                    round history, and market benchmarks.
        client_mode: Client type - "university", "nypa", or "northwell"

    Returns:
        NegotiationResult with final price, savings achieved, accepted
        terms, and full email thread for audit trail.
    """
    context = json.dumps({
        "client_mode": client_mode,
        "input": input_data,
    })

    result = await router.complete(
        tier=ModelTier.GENIUS,
        system_prompt=AGENT_06_SYSTEM_PROMPT,
        user_message=context,
        response_format=NegotiationResult,
    )

    return result
