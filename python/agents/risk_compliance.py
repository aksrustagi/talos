"""
Talos AI — Agent 18: Risk & Compliance Monitoring

Continuously monitors procurement activities for risk indicators, compliance
violations, and regulatory changes. Uses the smart model tier for risk
assessment and pattern recognition.
"""

import json
import logging
from typing import Optional

from llm.router import LLMRouter, ModelTier
from llm.prompts.agent_18_risk_compliance import AGENT_18_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


async def monitor_risk(
    router: LLMRouter,
    input_data: dict,
    client_mode: str = "university",
) -> dict:
    """
    Monitor and assess procurement risk and compliance status.

    Evaluates vendor risk profiles, transaction patterns, regulatory
    compliance status, contract obligation adherence, and emerging
    risk indicators across the procurement portfolio.

    Args:
        router: LLM router instance
        input_data: Risk assessment inputs including vendor data, transaction
                    patterns, compliance checklist status, regulatory updates,
                    audit findings, and contract obligation tracker.
        client_mode: Client type - "university", "nypa", or "northwell"

    Returns:
        Dict containing risk scores, compliance status, violation alerts,
        mitigation recommendations, and regulatory update impacts.
    """
    context = json.dumps({
        "client_mode": client_mode,
        "input": input_data,
    })

    result = await router.complete(
        tier=ModelTier.SMART,
        system_prompt=AGENT_18_SYSTEM_PROMPT,
        user_message=context,
        response_format=None,
    )

    return result
