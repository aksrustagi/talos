"""
Talos AI — LLM Routing Layer

Unified LLM router supporting OpenRouter (dev/testing) and AWS Bedrock (production).
"""

from llm.router import LLMRouter, LLMConfig, ModelTier, LLMProvider
from llm.cost_tracker import CostTracker, LLMCallRecord, get_cost_tracker
from llm.client_policies import CLIENT_POLICIES, build_agent_prompt

__all__ = [
    "LLMRouter",
    "LLMConfig",
    "ModelTier",
    "LLMProvider",
    "CostTracker",
    "LLMCallRecord",
    "get_cost_tracker",
    "CLIENT_POLICIES",
    "build_agent_prompt",
]
