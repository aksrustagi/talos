"""
Talos AI — Agent 7: Vendor Onboarding

Manages the complete process of registering, qualifying, and activating new
vendors in the procurement system. Handles W-9 collection, insurance
verification, diversity certification, and system setup.
"""

import json
import logging
from typing import Optional

from llm.router import LLMRouter, ModelTier
from llm.prompts.agent_07_vendor_onboarding import AGENT_07_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


async def onboard_vendor(
    router: LLMRouter,
    input_data: dict,
    client_mode: str = "university",
) -> dict:
    """
    Process a vendor onboarding request or advance an in-progress onboarding.

    Validates vendor documentation (W-9, insurance, certifications),
    performs risk screening, sets up vendor records, and tracks the
    onboarding checklist to completion.

    Args:
        router: LLM router instance
        input_data: Vendor information including company details, tax
                    documents, insurance certificates, diversity
                    certifications, and banking information.
        client_mode: Client type - "university", "nypa", or "northwell"

    Returns:
        Dict containing onboarding status, completed/pending checklist
        items, validation results, risk flags, and next steps.
    """
    context = json.dumps({
        "client_mode": client_mode,
        "input": input_data,
    })

    result = await router.complete(
        tier=ModelTier.SMART,
        system_prompt=AGENT_07_SYSTEM_PROMPT,
        user_message=context,
        response_format=None,
    )

    return result
