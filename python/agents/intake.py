"""
Talos AI — Agent 1: Intake Parser

Converts unstructured procurement requests from any channel (email, Slack,
Teams, portal, phone transcript) into structured ParsedRequisition objects.
Uses a cheap model tier since the task is primarily extraction/classification.
"""

import json
import logging
from typing import Optional

from llm.router import LLMRouter, ModelTier
from llm.prompts.agent_01_intake import AGENT_01_SYSTEM_PROMPT
from models.core import ParsedRequisition

logger = logging.getLogger(__name__)


async def parse_requisition(
    router: LLMRouter,
    input_data: dict,
    client_mode: str = "university",
) -> ParsedRequisition:
    """
    Parse an unstructured procurement request into a structured requisition.

    Takes raw text from any input channel and extracts line items, quantities,
    budget codes, urgency, delivery details, and UNSPSC classification.

    Args:
        router: LLM router instance
        input_data: Raw requisition input containing fields like raw_text,
                    source_channel, requester_id, department, attachments, etc.
        client_mode: Client type - "university", "nypa", or "northwell"

    Returns:
        ParsedRequisition with structured items, funding source, urgency,
        category classification, and confidence score.
    """
    context = json.dumps({
        "client_mode": client_mode,
        "input": input_data,
    })

    result = await router.complete(
        tier=ModelTier.CHEAP,
        system_prompt=AGENT_01_SYSTEM_PROMPT,
        user_message=context,
        response_format=ParsedRequisition,
    )

    return result
