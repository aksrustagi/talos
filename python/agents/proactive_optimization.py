"""
Talos AI — Agent 22: Proactive Optimization

Proactively discovers cost savings, process improvements, and optimization
opportunities across the procurement portfolio without being explicitly asked.
Uses the genius model tier for deep analytical reasoning and pattern discovery.
"""

import json
import logging
from typing import Optional

from llm.router import LLMRouter, ModelTier
from llm.prompts.agent_22_proactive_optimization import AGENT_22_SYSTEM_PROMPT
from models.core import OptimizationDiscovery

logger = logging.getLogger(__name__)


async def discover_savings(
    router: LLMRouter,
    input_data: dict,
    client_mode: str = "university",
) -> OptimizationDiscovery:
    """
    Proactively discover savings and optimization opportunities.

    Analyzes spend patterns, contract terms, market conditions, vendor
    portfolios, and process metrics to identify untapped savings,
    consolidation opportunities, and efficiency improvements.

    Args:
        router: LLM router instance
        input_data: Portfolio data including spend history, active contracts,
                    vendor performance scores, market benchmarks, process
                    metrics, and organizational priorities.
        client_mode: Client type - "university", "nypa", or "northwell"

    Returns:
        OptimizationDiscovery with identified opportunities, estimated
        savings, implementation effort, priority ranking, and recommended
        action plans.
    """
    context = json.dumps({
        "client_mode": client_mode,
        "input": input_data,
    })

    result = await router.complete(
        tier=ModelTier.GENIUS,
        system_prompt=AGENT_22_SYSTEM_PROMPT,
        user_message=context,
        response_format=OptimizationDiscovery,
    )

    return result
