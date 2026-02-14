"""
Talos AI — Agent 3: Demand Aggregation

Analyzes incoming requisitions against recent and pending orders to find
consolidation opportunities that drive volume discounts. Recommends whether
to consolidate, batch, or proceed solo.
"""

import json
import logging
from typing import Optional

from llm.router import LLMRouter, ModelTier
from llm.prompts.agent_03_aggregation import AGENT_03_SYSTEM_PROMPT
from models.core import AggregationOpportunity

logger = logging.getLogger(__name__)


async def check_aggregation(
    router: LLMRouter,
    input_data: dict,
    client_mode: str = "university",
) -> AggregationOpportunity:
    """
    Check for demand aggregation opportunities across recent requisitions.

    Compares the current requisition against pending and recent orders in the
    same category to identify consolidation savings through volume leverage.

    Args:
        router: LLM router instance
        input_data: Parsed requisition data along with recent order history
                    for the same category/subcategory.
        client_mode: Client type - "university", "nypa", or "northwell"

    Returns:
        AggregationOpportunity with similar requisition IDs, estimated
        consolidation savings, and recommended action (consolidate/batch/solo).
    """
    context = json.dumps({
        "client_mode": client_mode,
        "input": input_data,
    })

    result = await router.complete(
        tier=ModelTier.CHEAP,
        system_prompt=AGENT_03_SYSTEM_PROMPT,
        user_message=context,
        response_format=AggregationOpportunity,
    )

    return result
