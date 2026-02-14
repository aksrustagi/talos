"""
Talos AI — Agent 17: Savings Verification

Validates and quantifies procurement savings claims against baseline prices,
market benchmarks, and historical spend. Uses the genius model tier for
rigorous financial verification and audit-grade documentation.
"""

import json
import logging
from typing import Optional

from llm.router import LLMRouter, ModelTier
from llm.prompts.agent_17_savings_verification import AGENT_17_SYSTEM_PROMPT
from models.core import SavingsRecord

logger = logging.getLogger(__name__)


async def verify_savings(
    router: LLMRouter,
    input_data: dict,
    client_mode: str = "university",
) -> SavingsRecord:
    """
    Verify and document procurement savings for a completed transaction.

    Calculates hard and soft savings against baseline pricing, validates
    savings methodology, compares to market benchmarks, and produces
    audit-ready savings documentation.

    Args:
        router: LLM router instance
        input_data: Transaction details including negotiated price, baseline
                    price, market benchmarks, historical spend, savings
                    methodology, and supporting evidence.
        client_mode: Client type - "university", "nypa", or "northwell"

    Returns:
        SavingsRecord with verified savings amount, savings type breakdown,
        calculation methodology, confidence level, and audit trail.
    """
    context = json.dumps({
        "client_mode": client_mode,
        "input": input_data,
    })

    result = await router.complete(
        tier=ModelTier.GENIUS,
        system_prompt=AGENT_17_SYSTEM_PROMPT,
        user_message=context,
        response_format=SavingsRecord,
    )

    return result
