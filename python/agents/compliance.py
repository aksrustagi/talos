"""
Talos AI — Agent 2: Policy Compliance

Validates every procurement requisition against the client's policies, spending
thresholds, preferred vendor requirements, and applicable regulations (2 CFR 200,
HIPAA BAA, state procurement law, etc.).
"""

import json
import logging
from typing import Optional

from llm.router import LLMRouter, ModelTier
from llm.prompts.agent_02_compliance import AGENT_02_SYSTEM_PROMPT
from models.core import ComplianceResult

logger = logging.getLogger(__name__)


async def check_compliance(
    router: LLMRouter,
    input_data: dict,
    client_mode: str = "university",
) -> ComplianceResult:
    """
    Check a parsed requisition against all applicable compliance policies.

    Evaluates policy violations, required approvals, preferred vendor matches,
    regulatory requirements, sole-source justification needs, and competitive
    bid thresholds.

    Args:
        router: LLM router instance
        input_data: Parsed requisition data including items, funding source,
                    estimated total, and category information.
        client_mode: Client type - "university", "nypa", or "northwell"

    Returns:
        ComplianceResult with violation list, required approval chain,
        preferred vendors, and regulatory flags.
    """
    context = json.dumps({
        "client_mode": client_mode,
        "input": input_data,
    })

    result = await router.complete(
        tier=ModelTier.SMART,
        system_prompt=AGENT_02_SYSTEM_PROMPT,
        user_message=context,
        response_format=ComplianceResult,
    )

    return result
