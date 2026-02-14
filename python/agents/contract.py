"""
Talos AI — Agent 8: Contract Lifecycle

Manages the complete lifecycle of procurement contracts including creation,
execution, monitoring, amendment, renewal, and termination. Tracks key dates,
milestones, and compliance obligations.
"""

import json
import logging
from typing import Optional

from llm.router import LLMRouter, ModelTier
from llm.prompts.agent_08_contract_lifecycle import AGENT_08_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


async def manage_contract(
    router: LLMRouter,
    input_data: dict,
    client_mode: str = "university",
) -> dict:
    """
    Manage a contract lifecycle action (create, review, amend, renew, etc.).

    Handles contract drafting from negotiation results, clause analysis,
    risk identification, renewal tracking, expiration alerts, and
    amendment processing.

    Args:
        router: LLM router instance
        input_data: Contract details including action type, negotiation
                    results, existing contract data, amendment requests,
                    renewal terms, and compliance requirements.
        client_mode: Client type - "university", "nypa", or "northwell"

    Returns:
        Dict containing contract status, generated/updated document,
        key dates, obligation tracker, risk flags, and recommended actions.
    """
    context = json.dumps({
        "client_mode": client_mode,
        "input": input_data,
    })

    result = await router.complete(
        tier=ModelTier.SMART,
        system_prompt=AGENT_08_SYSTEM_PROMPT,
        user_message=context,
        response_format=None,
    )

    return result
