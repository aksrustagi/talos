"""
Talos AI — Agent 19: Category Strategy

Develops and maintains procurement category strategies based on spend analysis,
market conditions, supplier landscape, and organizational priorities. Uses the
smart model tier for strategic analysis and recommendation generation.
"""

import json
import logging
from typing import Optional

from llm.router import LLMRouter, ModelTier
from llm.prompts.agent_19_category_strategy import AGENT_19_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


async def develop_strategy(
    router: LLMRouter,
    input_data: dict,
    client_mode: str = "university",
) -> dict:
    """
    Develop or update a procurement category strategy.

    Analyzes category spend, supplier market dynamics, risk factors,
    innovation opportunities, and organizational requirements to produce
    a comprehensive category management strategy.

    Args:
        router: LLM router instance
        input_data: Category data including spend history, supplier landscape,
                    market trends, stakeholder requirements, risk assessment,
                    and current contract portfolio.
        client_mode: Client type - "university", "nypa", or "northwell"

    Returns:
        Dict containing category strategy, recommended sourcing approach,
        supplier rationalization plan, savings targets, and implementation
        roadmap.
    """
    context = json.dumps({
        "client_mode": client_mode,
        "input": input_data,
    })

    result = await router.complete(
        tier=ModelTier.SMART,
        system_prompt=AGENT_19_SYSTEM_PROMPT,
        user_message=context,
        response_format=None,
    )

    return result
