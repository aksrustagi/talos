"""
Talos AI — Agent 15: Budget Guardian

Monitors budget utilization, enforces spending limits, and provides real-time
budget impact analysis for procurement decisions. Uses the smart model tier
for financial analysis and threshold evaluation.
"""

import json
import logging
from typing import Optional

from llm.router import LLMRouter, ModelTier
from llm.prompts.agent_15_budget_guardian import AGENT_15_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


async def check_budget(
    router: LLMRouter,
    input_data: dict,
    client_mode: str = "university",
) -> dict:
    """
    Check budget availability and impact for a procurement request.

    Validates spend against budget allocations, tracks committed and
    actual expenditure, forecasts budget utilization, and flags potential
    overruns or policy threshold breaches.

    Args:
        router: LLM router instance
        input_data: Requisition amount, budget code, current budget status,
                    committed spend, fiscal year details, department
                    allocations, and any transfer or reallocation requests.
        client_mode: Client type - "university", "nypa", or "northwell"

    Returns:
        Dict containing budget check result, available balance, utilization
        percentage, forecast impact, and any warnings or required actions.
    """
    context = json.dumps({
        "client_mode": client_mode,
        "input": input_data,
    })

    result = await router.complete(
        tier=ModelTier.SMART,
        system_prompt=AGENT_15_SYSTEM_PROMPT,
        user_message=context,
        response_format=None,
    )

    return result
