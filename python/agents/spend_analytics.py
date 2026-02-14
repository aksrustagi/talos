"""
Talos AI — Agent 16: Spend Analytics

Analyzes procurement spending patterns to identify trends, anomalies,
consolidation opportunities, and cost reduction targets. Uses the smart
model tier for statistical analysis and insight generation.
"""

import json
import logging
from typing import Optional

from llm.router import LLMRouter, ModelTier
from llm.prompts.agent_16_spend_analytics import AGENT_16_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


async def analyze_spend(
    router: LLMRouter,
    input_data: dict,
    client_mode: str = "university",
) -> dict:
    """
    Analyze procurement spend data to generate actionable insights.

    Examines spending patterns by category, vendor, department, and time
    period to identify consolidation opportunities, maverick spend,
    contract leakage, and cost reduction targets.

    Args:
        router: LLM router instance
        input_data: Spend data including transaction history, category
                    breakdowns, vendor summaries, department allocations,
                    contract values, and benchmark comparisons.
        client_mode: Client type - "university", "nypa", or "northwell"

    Returns:
        Dict containing spend analysis, trend identification, anomaly
        flags, consolidation opportunities, and savings recommendations.
    """
    context = json.dumps({
        "client_mode": client_mode,
        "input": input_data,
    })

    result = await router.complete(
        tier=ModelTier.SMART,
        system_prompt=AGENT_16_SYSTEM_PROMPT,
        user_message=context,
        response_format=None,
    )

    return result
