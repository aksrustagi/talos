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
import time
from enum import Enum
from typing import Optional, Union

import httpx
from pydantic import BaseModel

from llm.cost_tracker import get_cost_tracker, LLMCallRecord

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


def _strip_markdown_fences(text: str) -> str:
    """Remove markdown code fences from LLM output."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()
    return cleaned


def _extract_json(text: str) -> str:
    """Try to extract a JSON object from mixed text."""
    try:
        start_idx = text.index("{")
        end_idx = text.rindex("}") + 1
        return text[start_idx:end_idx]
    except ValueError:
        return text


class LLMRouter:
    """
    Unified LLM router. OpenRouter for testing costs across models.
    Bedrock for production with HIPAA/SOC2 compliance.

    Usage:
        router = LLMRouter(LLMConfig(provider="openrouter"))
        result, usage = await router.complete(
            tier="smart",
            system_prompt=COMPLIANCE_AGENT_PROMPT,
            user_message="Check this PO for policy violations...",
            response_model=ComplianceResult,
        )
    """

    def __init__(self, config: LLMConfig):
        self.config = config
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Reuse a persistent HTTP client for connection pooling."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=float(self.config.timeout))
        return self._client

    async def close(self):
        """Close the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def complete(
        self,
        tier: str,
        system_prompt: str,
        user_message: str,
        response_model: Optional[type] = None,
        temperature: float = 0.1,
        max_tokens: int = 4096,
        agent_name: str = "unknown",
    ) -> tuple[Union[BaseModel, dict, str], dict]:
        """
        Route an LLM call to the appropriate provider and model tier.

        Returns:
            Tuple of (result, usage_dict). Result is a Pydantic model instance
            if response_model provided, else dict or string.
        """
        model = self.config.tier_models[tier][self.config.provider.value]
        start = time.time()

        if self.config.provider == LLMProvider.OPENROUTER:
            result, usage = await self._openrouter_call(
                model, system_prompt, user_message,
                response_model, temperature, max_tokens,
            )
        else:
            result, usage = await self._bedrock_call(
                model, system_prompt, user_message,
                response_model, temperature, max_tokens,
            )

        latency_ms = (time.time() - start) * 1000

        # Record cost
        cost_tracker = get_cost_tracker()
        cost_tracker.record(LLMCallRecord(
            agent_name=agent_name,
            model=model,
            tier=tier,
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            cost_usd=usage.get("total_cost", 0.0),
            latency_ms=latency_ms,
        ))

        logger.info(
            f"[{agent_name}] model={model} "
            f"tokens={usage.get('prompt_tokens', 0)}+{usage.get('completion_tokens', 0)} "
            f"cost=${usage.get('total_cost', 0):.4f} latency={latency_ms:.0f}ms"
        )

        return result, usage

    async def _openrouter_call(
        self, model: str, system: str, user: str,
        response_model: Optional[type], temp: float, max_tokens: int,
    ) -> tuple[Union[BaseModel, dict, str], dict]:
        """OpenRouter — OpenAI-compatible API, 400+ models, no markup on pricing."""
        client = await self._get_client()

        # Build structured output instruction
        json_instruction = ""
        if response_model:
            schema = response_model.model_json_schema()
            json_instruction = (
                f"\n\nYou MUST respond with ONLY valid JSON matching this schema. "
                f"No markdown, no explanation, just the JSON object.\n"
                f"Schema:\n{json.dumps(schema, indent=2)}"
            )

        messages = [
            {"role": "system", "content": system + json_instruction},
            {"role": "user", "content": user},
        ]

        payload = {
            "model": model,
            "messages": messages,
            "temperature": temp,
            "max_tokens": max_tokens,
            "provider": {
                "allow_fallbacks": True,
                "require_parameters": False,
            },
        }

        headers = {
            "Authorization": f"Bearer {self.config.openrouter_api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://talos.ai",
            "X-Title": "Talos AI Procurement",
        }

        resp = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=payload,
        )

        if resp.status_code != 200:
            logger.error(f"OpenRouter error {resp.status_code}: {resp.text[:500]}")
            raise Exception(f"OpenRouter API error: {resp.status_code} — {resp.text[:200]}")

        data = resp.json()
        usage = data.get("usage", {})

        # Extract cost — OpenRouter includes it in usage or we estimate
        total_cost = usage.get("total_cost", 0.0)
        if not total_cost:
            total_cost = (
                usage.get("prompt_tokens", 0) * 0.000003
                + usage.get("completion_tokens", 0) * 0.000015
            )
        usage["total_cost"] = total_cost

        content = data["choices"][0]["message"]["content"]

        if response_model:
            cleaned = _strip_markdown_fences(content)
            try:
                return response_model.model_validate_json(cleaned), usage
            except Exception as e:
                logger.warning(f"JSON parse failed for {response_model.__name__}: {e}")
                logger.warning(f"Raw content: {cleaned[:500]}")
                try:
                    json_str = _extract_json(cleaned)
                    return response_model.model_validate_json(json_str), usage
                except Exception:
                    logger.error(
                        f"Could not parse response into {response_model.__name__}, returning default"
                    )
                    return response_model(), usage

        return content, usage

    async def _bedrock_call(
        self, model: str, system: str, user: str,
        response_model: Optional[type], temp: float, max_tokens: int,
    ) -> tuple[Union[BaseModel, dict, str], dict]:
        """AWS Bedrock — production deployment, HIPAA eligible, VPC."""
        try:
            import boto3
        except ImportError:
            raise ImportError("boto3 required for Bedrock. Run: pip install boto3")

        json_instruction = ""
        if response_model:
            schema = response_model.model_json_schema()
            json_instruction = (
                f"\n\nRespond with ONLY valid JSON matching this schema:\n"
                f"{json.dumps(schema, indent=2)}"
            )

        bedrock_client = boto3.client("bedrock-runtime", region_name=self.config.aws_region)

        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "system": system + json_instruction,
            "messages": [{"role": "user", "content": user}],
            "temperature": temp,
            "max_tokens": max_tokens,
        })

        response = bedrock_client.invoke_model(
            modelId=model,
            contentType="application/json",
            accept="application/json",
            body=body,
        )

        result = json.loads(response["body"].read())
        content = result["content"][0]["text"]

        usage = result.get("usage", {})
        usage["prompt_tokens"] = usage.get("input_tokens", 0)
        usage["completion_tokens"] = usage.get("output_tokens", 0)
        usage["total_cost"] = (
            usage.get("input_tokens", 0) * 0.000003
            + usage.get("output_tokens", 0) * 0.000015
        )

        if response_model:
            cleaned = _strip_markdown_fences(content)
            try:
                return response_model.model_validate_json(cleaned), usage
            except Exception:
                try:
                    json_str = _extract_json(cleaned)
                    return response_model.model_validate_json(json_str), usage
                except Exception:
                    return response_model(), usage

        return content, usage


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

    router = LLMRouter(config)
    for model_id, model_name in test_models:
        try:
            old_model = config.tier_models["cheap"]["openrouter"]
            config.tier_models["cheap"]["openrouter"] = model_id

            for msg in test_messages:
                result, usage = await router.complete(
                    tier="cheap",
                    system_prompt=system_prompt,
                    user_message=msg,
                    agent_name=f"benchmark_{agent_name}",
                )
                cost = usage.get("total_cost", "N/A")
                print(
                    f"  {model_name:30s} | ${cost:>8} | "
                    f"in={usage.get('prompt_tokens', 0):>6} "
                    f"out={usage.get('completion_tokens', 0):>6}"
                )

            config.tier_models["cheap"]["openrouter"] = old_model
        except Exception as e:
            print(f"  {model_name:30s} | ERROR: {e}")

    await router.close()
