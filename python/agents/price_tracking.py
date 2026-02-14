"""
Talos AI — Agent 23: Price Tracking

Tracks and monitors pricing trends for key procurement categories, flagging
significant changes, identifying optimal purchase timing, and maintaining
price benchmarks. Uses the smart model tier for trend analysis and alerting.
"""

import json
import logging
from typing import Optional

from llm.router import LLMRouter, ModelTier
from llm.prompts.agent_23_price_tracking import AGENT_23_SYSTEM_PROMPT
from models.core import PriceTrackingResult

logger = logging.getLogger(__name__)


async def track_prices(
    router: LLMRouter,
    input_data: dict,
    client_mode: str = "university",
) -> PriceTrackingResult:
    """
    Track and analyze pricing for procurement categories and items.

    Monitors price movements, compares vendor pricing against benchmarks,
    identifies seasonal patterns, flags anomalous price changes, and
    recommends optimal purchase timing.

    Args:
        router: LLM router instance
        input_data: Pricing data including current quotes, historical prices,
                    market indices, vendor price lists, contract rates,
                    and commodity benchmarks.
        client_mode: Client type - "university", "nypa", or "northwell"

    Returns:
        PriceTrackingResult with current price status, trend analysis,
        benchmark comparisons, alerts, and purchase timing recommendations.
    """
    context = json.dumps({
        "client_mode": client_mode,
        "input": input_data,
    })

    result = await router.complete(
        tier=ModelTier.SMART,
        system_prompt=AGENT_23_SYSTEM_PROMPT,
        user_message=context,
        response_format=PriceTrackingResult,
    )

    return result
