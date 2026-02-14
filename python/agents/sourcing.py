"""
Talos AI — Agent 5: Sourcing

Manages the complete sourcing process from vendor identification through
award recommendation. Generates RFP documents and evaluates vendor responses
to produce ranked sourcing recommendations.
"""

import json
import logging
from typing import Optional

from llm.router import LLMRouter, ModelTier
from llm.prompts.agent_05_sourcing import AGENT_05_SYSTEM_PROMPT
from models.core import SourcingRecommendation

logger = logging.getLogger(__name__)


async def generate_rfp(
    router: LLMRouter,
    input_data: dict,
    client_mode: str = "university",
) -> dict:
    """
    Generate an RFP document for a procurement requirement.

    Creates a structured RFP based on requisition details, compliance
    requirements, market intelligence, and client-specific templates.

    Args:
        router: LLM router instance
        input_data: Requisition details, compliance requirements, market
                    intelligence, evaluation criteria, and timeline.
        client_mode: Client type - "university", "nypa", or "northwell"

    Returns:
        Dict containing the generated RFP document, evaluation criteria,
        vendor shortlist, and distribution plan.
    """
    context = json.dumps({
        "client_mode": client_mode,
        "input": input_data,
    })

    result = await router.complete(
        tier=ModelTier.SMART,
        system_prompt=AGENT_05_SYSTEM_PROMPT,
        user_message=context,
        response_format=None,
    )

    return result


async def evaluate_vendor_responses(
    router: LLMRouter,
    input_data: dict,
    client_mode: str = "university",
) -> SourcingRecommendation:
    """
    Evaluate vendor responses to an RFP and produce a sourcing recommendation.

    Scores vendor proposals against evaluation criteria, analyzes pricing,
    checks references, and ranks vendors for award recommendation.

    Args:
        router: LLM router instance
        input_data: Vendor responses, evaluation criteria, pricing data,
                    diversity requirements, and risk assessments.
        client_mode: Client type - "university", "nypa", or "northwell"

    Returns:
        SourcingRecommendation with ranked vendor list, RFP status,
        estimated timeline, and market condition assessment.
    """
    context = json.dumps({
        "client_mode": client_mode,
        "input": input_data,
    })

    result = await router.complete(
        tier=ModelTier.SMART,
        system_prompt=AGENT_05_SYSTEM_PROMPT,
        user_message=context,
        response_format=SourcingRecommendation,
    )

    return result
