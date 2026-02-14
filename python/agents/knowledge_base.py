"""
Talos AI — Agent 21: Knowledge Base

Answers procurement-related questions by querying institutional knowledge,
policy documents, historical decisions, and best practices. Uses the smart
model tier for accurate retrieval and contextual answer generation.
"""

import json
import logging
from typing import Optional

from llm.router import LLMRouter, ModelTier
from llm.prompts.agent_21_knowledge_base import AGENT_21_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


async def answer_question(
    router: LLMRouter,
    input_data: dict,
    client_mode: str = "university",
) -> dict:
    """
    Answer a procurement-related question from the knowledge base.

    Searches institutional policies, procurement guidelines, historical
    decisions, vendor records, and best practices to provide accurate,
    sourced answers to user questions.

    Args:
        router: LLM router instance
        input_data: Question details including the query text, context
                    (department, category, vendor), user role, and any
                    relevant document references or conversation history.
        client_mode: Client type - "university", "nypa", or "northwell"

    Returns:
        Dict containing the answer, confidence score, source references,
        related policies, and suggested follow-up actions.
    """
    context = json.dumps({
        "client_mode": client_mode,
        "input": input_data,
    })

    result = await router.complete(
        tier=ModelTier.SMART,
        system_prompt=AGENT_21_SYSTEM_PROMPT,
        user_message=context,
        response_format=None,
    )

    return result
