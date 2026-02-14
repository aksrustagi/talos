"""
Talos AI — Agent 14: Goods Receipt

Processes goods receipt records to confirm delivery of ordered items,
track partial shipments, and flag discrepancies against purchase orders.
Uses a cheap model tier since the task is primarily data extraction and comparison.
"""

import json
import logging
from typing import Optional

from llm.router import LLMRouter, ModelTier
from llm.prompts.agent_14_goods_receipt import AGENT_14_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


async def process_receipt(
    router: LLMRouter,
    input_data: dict,
    client_mode: str = "university",
) -> dict:
    """
    Process a goods receipt against an existing purchase order.

    Records received items, validates quantities and conditions against
    the PO, tracks partial deliveries, flags damaged or incorrect items,
    and updates the order fulfillment status.

    Args:
        router: LLM router instance
        input_data: Receipt details including PO reference, received items,
                    quantities, condition notes, delivery date, receiver
                    information, and any discrepancy observations.
        client_mode: Client type - "university", "nypa", or "northwell"

    Returns:
        Dict containing receipt record, match status against PO,
        fulfillment percentage, discrepancy flags, and next actions.
    """
    context = json.dumps({
        "client_mode": client_mode,
        "input": input_data,
    })

    result = await router.complete(
        tier=ModelTier.CHEAP,
        system_prompt=AGENT_14_SYSTEM_PROMPT,
        user_message=context,
        response_format=None,
    )

    return result
