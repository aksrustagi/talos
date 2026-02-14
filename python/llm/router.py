"""
Talos AI — LLM Router

Unified LLM router for OpenRouter (dev/testing) and AWS Bedrock (production).

OpenRouter for dev/testing (400+ models, instant cost comparison)
AWS Bedrock for production (SLA, VPC, HIPAA eligible)

Model tiers by agent complexity:
- TIER 1 (cheap): DeepSeek V3, Llama 3.3 70B, Mistral Large
  Cost: $0.10-0.30/M tokens — Use for Agents 1, 3, 9, 10, 11, 14
- TIER 2 (smart): Claude Sonnet 4, GPT-4o
  Cost: $3-5/M tokens — Use for Agents 2, 4, 5, 8, 12, 15, 16, 18, 20, 21
- TIER 3 (genius): Claude Opus, o3
  Cost: $15-60/M tokens — Use for Agents 6, 17, 22
"""

import json
import logging
import os
from enum import Enum
from typing import Optional

import httpx
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class ModelTier(str, Enum):
    CHEAP = "cheap"      # Simple extraction, routing, classification
    SMART = "smart"      # Analysis, compliance, matching
    GENIUS = "genius"    # Negotiation, strategy, complex reasoning


class LLMProvider(str, Enum):
    OPENROUTER = "openrouter"
    BEDROCK = "bedrock"


class LLMConfig(BaseModel):
    provider: LLMProvider = LLMProvider.OPENROUTER
    tier_models: dict = {
        "cheap": {
            "openrouter": "deepseek/deepseek-chat-v3-0324:floor",
            "bedrock": "amazon.nova-micro-v1:0",
        },
        "smart": {
            "openrouter": "anthropic/claude-sonnet-4",
            "bedrock": "anthropic.claude-sonnet-4-20250514-v1:0",
        },
        "genius": {
            "openrouter": "anthropic/claude-opus-4",
            "bedrock": "anthropic.claude-opus-4-20250514-v1:0",
        },
    }
    openrouter_api_key: str = ""
    aws_region: str = "us-east-1"
    max_retries: int = 3
    timeout: int = 120


class LLMRouter:
    """
    Unified LLM router. OpenRouter for testing costs across models.
    Bedrock for production with HIPAA/SOC2 compliance.

    Usage:
        router = LLMRouter(LLMConfig(provider="openrouter"))
        result = await router.complete(
            tier="smart",
            system_prompt=COMPLIANCE_AGENT_PROMPT,
            user_message="Check this PO for policy violations...",
            response_format=ComplianceResult,  # Pydantic model
        )
    """

    def __init__(self, config: LLMConfig):
        self.config = config

    async def complete(
        self,
        tier: ModelTier,
        system_prompt: str,
        user_message: str,
        response_format: Optional[type] = None,
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> dict:
        """Route an LLM call to the appropriate provider and model tier."""
        model = self.config.tier_models[tier][self.config.provider]

        if self.config.provider == LLMProvider.OPENROUTER:
            return await self._openrouter_call(
                model, system_prompt, user_message,
                response_format, temperature, max_tokens,
            )
        else:
            return await self._bedrock_call(
                model, system_prompt, user_message,
                response_format, temperature, max_tokens,
            )

    async def _openrouter_call(
        self, model: str, system: str, user: str,
        response_format: Optional[type], temp: float, max_tokens: int,
    ):
        """OpenRouter — OpenAI-compatible API, 400+ models, no markup on pricing."""
        headers = {
            "Authorization": f"Bearer {self.config.openrouter_api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://talos.ai",
            "X-Title": "Talos AI Procurement",
        }

        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": temp,
            "max_tokens": max_tokens,
            "provider": {
                "order": ["DeepInfra", "Together", "Fireworks", "Lambda"],
                "allow_fallbacks": True,
                "require_parameters": True,
            },
        }

        if response_format:
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": response_format.__name__,
                    "schema": response_format.model_json_schema(),
                    "strict": True,
                },
            }

        async with httpx.AsyncClient(timeout=self.config.timeout) as client:
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload,
            )
            data = resp.json()

            usage = data.get("usage", {})
            logger.info(
                "LLM call completed",
                extra={
                    "model": model,
                    "tokens_in": usage.get("prompt_tokens", 0),
                    "tokens_out": usage.get("completion_tokens", 0),
                    "cost": data.get("usage", {}).get("total_cost", "N/A"),
                },
            )

            content = data["choices"][0]["message"]["content"]

            if response_format:
                return response_format.model_validate_json(content)
            return {"content": content}

    async def _bedrock_call(
        self, model: str, system: str, user: str,
        response_format: Optional[type], temp: float, max_tokens: int,
    ):
        """AWS Bedrock — production deployment, HIPAA eligible, VPC."""
        import boto3

        client = boto3.client("bedrock-runtime", region_name=self.config.aws_region)

        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "system": system,
            "messages": [{"role": "user", "content": user}],
            "temperature": temp,
            "max_tokens": max_tokens,
        }

        response = client.invoke_model(
            modelId=model,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(body),
        )

        result = json.loads(response["body"].read())
        content = result["content"][0]["text"]

        if response_format:
            return response_format.model_validate_json(content)
        return {"content": content}


async def test_agent_costs(
    agent_name: str,
    system_prompt: str,
    test_messages: list[str],
):
    """
    Run the same prompt across all model tiers on OpenRouter to compare costs.
    Use this during development to find the cheapest model that meets quality bar.
    """
    config = LLMConfig(
        provider=LLMProvider.OPENROUTER,
        openrouter_api_key=os.getenv("OPENROUTER_API_KEY", ""),
    )

    test_models = [
        ("deepseek/deepseek-chat-v3-0324:floor", "DeepSeek V3 (cheapest)"),
        ("meta-llama/llama-3.3-70b-instruct:floor", "Llama 3.3 70B"),
        ("mistralai/mistral-large-2411:floor", "Mistral Large"),
        ("anthropic/claude-sonnet-4:floor", "Claude Sonnet 4"),
        ("anthropic/claude-opus-4:floor", "Claude Opus 4"),
        ("amazon.nova-pro-v1:0", "Amazon Nova Pro"),
        ("amazon.nova-micro-v1:0", "Amazon Nova Micro"),
    ]

    print(f"\n{'=' * 60}")
    print(f"COST TEST: {agent_name}")
    print(f"{'=' * 60}")

    for model_id, model_name in test_models:
        try:
            headers = {
                "Authorization": f"Bearer {config.openrouter_api_key}",
                "Content-Type": "application/json",
            }
            for msg in test_messages:
                payload = {
                    "model": model_id,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": msg},
                    ],
                    "temperature": 0.1,
                    "max_tokens": 2048,
                }
                async with httpx.AsyncClient(timeout=120) as client:
                    resp = await client.post(
                        "https://openrouter.ai/api/v1/chat/completions",
                        headers=headers,
                        json=payload,
                    )
                    data = resp.json()
                    usage = data.get("usage", {})
                    cost = usage.get("total_cost", "N/A")
                    print(
                        f"  {model_name:30s} | ${cost:>8} | "
                        f"in={usage.get('prompt_tokens', 0):>6} "
                        f"out={usage.get('completion_tokens', 0):>6}"
                    )
        except Exception as e:
            print(f"  {model_name:30s} | ERROR: {e}")
