"""
Talos AI — Agent 10: Purchase Order Generation

Generates structured purchase orders from approved requisitions, incorporating
negotiated terms, vendor details, delivery schedules, and compliance requirements.
Uses a cheap model tier since the task is primarily document generation.
"""

import json
import logging
from typing import Optional

from llm.router import LLMRouter, ModelTier
from llm.prompts.agent_10_purchase_order import AGENT_10_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


async def generate_purchase_order(
    router: LLMRouter,
    input_data: dict,
    client_mode: str = "university",
) -> dict:
    """
    Generate a purchase order from an approved requisition.

    Creates a complete PO document with line items, negotiated pricing,
    payment terms, delivery schedule, and all required compliance clauses
    based on the contract and vendor onboarding data.

    Args:
        router: LLM router instance
        input_data: Approved requisition data including line items, vendor
                    details, negotiated terms, delivery requirements,
                    budget codes, and compliance obligations.
        client_mode: Client type - "university", "nypa", or "northwell"

    Returns:
        Dict containing the generated PO document, PO number, line items,
        total amount, payment terms, and delivery schedule.
    """
    context = json.dumps({
        "client_mode": client_mode,
        "input": input_data,
    })

    result = await router.complete(
        tier=ModelTier.CHEAP,
        system_prompt=AGENT_10_SYSTEM_PROMPT,
        user_message=context,
        response_format=None,
    )

    return result
