"""
Talos AI — Agent 20: Supplier Performance

Scores and evaluates supplier performance across delivery, quality, pricing,
responsiveness, and compliance dimensions. Uses the smart model tier for
multi-factor scoring and trend analysis.
"""

import json
import logging
from typing import Optional

from llm.router import LLMRouter, ModelTier
from llm.prompts.agent_20_supplier_performance import AGENT_20_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


async def score_supplier(
    router: LLMRouter,
    input_data: dict,
    client_mode: str = "university",
) -> dict:
    """
    Score and evaluate a supplier's performance.

    Calculates a composite supplier scorecard based on on-time delivery,
    quality metrics, pricing competitiveness, responsiveness, compliance
    adherence, and innovation contribution.

    Args:
        router: LLM router instance
        input_data: Supplier performance data including delivery records,
                    quality incidents, pricing history, communication logs,
                    compliance audit results, and contract adherence metrics.
        client_mode: Client type - "university", "nypa", or "northwell"

    Returns:
        Dict containing overall score, dimension scores, trend analysis,
        performance alerts, and improvement recommendations.
    """
    context = json.dumps({
        "client_mode": client_mode,
        "input": input_data,
    })

    result = await router.complete(
        tier=ModelTier.SMART,
        system_prompt=AGENT_20_SYSTEM_PROMPT,
        user_message=context,
        response_format=None,
    )

    return result
