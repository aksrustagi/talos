"""
Talos AI — Agent 11: Order Confirmation

Tracks and chases vendor order confirmations to ensure purchase orders are
acknowledged and delivery commitments are secured. Uses a cheap model tier
since the task is primarily communication and status tracking.
"""

import json
import logging
from typing import Optional

from llm.router import LLMRouter, ModelTier
from llm.prompts.agent_11_order_confirmation import AGENT_11_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


async def chase_vendor_confirmation(
    router: LLMRouter,
    input_data: dict,
    client_mode: str = "university",
) -> dict:
    """
    Chase vendor confirmation for an outstanding purchase order.

    Monitors PO acknowledgment status, generates follow-up communications,
    escalates unresponsive vendors, and records confirmed delivery dates
    and any vendor-proposed changes to the order.

    Args:
        router: LLM router instance
        input_data: Purchase order details including PO number, vendor
                    contact info, submission date, follow-up history,
                    urgency level, and escalation thresholds.
        client_mode: Client type - "university", "nypa", or "northwell"

    Returns:
        Dict containing confirmation status, vendor response details,
        confirmed delivery date, any change requests, and next actions.
    """
    context = json.dumps({
        "client_mode": client_mode,
        "input": input_data,
    })

    result = await router.complete(
        tier=ModelTier.CHEAP,
        system_prompt=AGENT_11_SYSTEM_PROMPT,
        user_message=context,
        response_format=None,
    )

    return result
