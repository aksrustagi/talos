"""
Talos AI — Agent 4: Market Intelligence

Provides real-time market data, pricing benchmarks, and vendor intelligence
to support sourcing and negotiation decisions. Synthesizes data from multiple
market sources into actionable intelligence.
"""

import json
import logging
from typing import Optional

from llm.router import LLMRouter, ModelTier
from llm.prompts.agent_04_market_intel import AGENT_04_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


async def gather_market_intelligence(
    router: LLMRouter,
    input_data: dict,
    client_mode: str = "university",
) -> dict:
    """
    Gather market intelligence for a procurement category or specific items.

    Analyzes market conditions, pricing benchmarks, vendor landscape,
    commodity trends, and supply chain risks to inform sourcing strategy.

    Args:
        router: LLM router instance
        input_data: Category, item descriptions, current contract prices,
                    and any specific intelligence questions.
        client_mode: Client type - "university", "nypa", or "northwell"

    Returns:
        Dict containing market conditions, benchmark prices, vendor
        intelligence, supply chain alerts, and strategic recommendations.
    """
    context = json.dumps({
        "client_mode": client_mode,
        "input": input_data,
    })

    result = await router.complete(
        tier=ModelTier.SMART,
        system_prompt=AGENT_04_SYSTEM_PROMPT,
        user_message=context,
        response_format=None,
    )

    return result
