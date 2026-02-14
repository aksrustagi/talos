"""
Talos AI — Agent 9: Approval Routing

Routes procurement requisitions through the appropriate approval chain based
on value thresholds, category, funding source, and organizational hierarchy.
Uses a cheap model tier since the task is primarily rule-based routing.
"""

import json
import logging
from typing import Optional

from llm.router import LLMRouter, ModelTier
from llm.prompts.agent_09_approval import AGENT_09_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


async def route_approval(
    router: LLMRouter,
    input_data: dict,
    client_mode: str = "university",
) -> dict:
    """
    Route a requisition through the appropriate approval workflow.

    Determines the required approval chain based on spend amount, category,
    funding source, policy requirements, and organizational hierarchy.
    Generates approval requests and tracks approval status.

    Args:
        router: LLM router instance
        input_data: Requisition details including estimated total, category,
                    funding source, compliance flags, department, and
                    any prior approval history.
        client_mode: Client type - "university", "nypa", or "northwell"

    Returns:
        Dict containing approval chain, current status, required approvers,
        escalation rules, and estimated completion timeline.
    """
    context = json.dumps({
        "client_mode": client_mode,
        "input": input_data,
    })

    result = await router.complete(
        tier=ModelTier.CHEAP,
        system_prompt=AGENT_09_SYSTEM_PROMPT,
        user_message=context,
        response_format=None,
    )

    return result
