"""
Talos AI — LLM Routing Layer

Unified LLM router supporting OpenRouter (dev/testing) and AWS Bedrock (production).
"""

from llm.router import LLMRouter, LLMConfig, ModelTier, LLMProvider

__all__ = ["LLMRouter", "LLMConfig", "ModelTier", "LLMProvider"]
