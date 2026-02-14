"""
Talos AI — Agent 13: Payment Optimization

Optimizes payment timing and methods to maximize early-payment discounts,
manage cash flow, and reduce transaction costs. Uses the smart model tier
for financial analysis and optimization reasoning.
"""

import json
import logging
from typing import Optional

from llm.router import LLMRouter, ModelTier
from llm.prompts.agent_13_payment_optimization import AGENT_13_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


async def optimize_payment(
    router: LLMRouter,
    input_data: dict,
    client_mode: str = "university",
) -> dict:
    """
    Optimize payment strategy for approved invoices.

    Analyzes early-payment discount opportunities, cash flow constraints,
    payment method costs, vendor payment preferences, and batch payment
    efficiency to recommend the optimal payment schedule and method.

    Args:
        router: LLM router instance
        input_data: Approved invoices, payment terms, available discounts,
                    cash flow projections, payment method options, and
                    vendor payment history.
        client_mode: Client type - "university", "nypa", or "northwell"

    Returns:
        Dict containing payment schedule, recommended payment methods,
        projected savings from early payment, and cash flow impact.
    """
    context = json.dumps({
        "client_mode": client_mode,
        "input": input_data,
    })

    result = await router.complete(
        tier=ModelTier.SMART,
        system_prompt=AGENT_13_SYSTEM_PROMPT,
        user_message=context,
        response_format=None,
    )

    return result
