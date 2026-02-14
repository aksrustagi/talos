"""
Talos LLM Router — Calls OpenRouter, returns Pydantic models.
"""
from __future__ import annotations

import json
import logging
import time
from typing import TypeVar, Type
from pydantic import BaseModel
import httpx

from .config import get_config

log = logging.getLogger("talos.llm")
T = TypeVar("T", bound=BaseModel)


class LLMCall(BaseModel):
    """Record of a single LLM call for cost tracking."""
    agent: str
    model: str
    tokens_in: int = 0
    tokens_out: int = 0
    cost: float = 0.0
    latency_ms: float = 0.0
    success: bool = True
    error: str | None = None


class LLMRouter:
    def __init__(self):
        self.config = get_config()
        self._client: httpx.AsyncClient | None = None
        self.history: list[LLMCall] = []

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=120.0)
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def call(
        self,
        agent: str,
        tier: str,
        system_prompt: str,
        user_message: str,
        response_model: Type[T] | None = None,
        temperature: float = 0.1,
        max_tokens: int = 4096,
        retries: int = 2,
    ) -> T | str:
        model = self.config.get_model(tier)
        last_error = None

        for attempt in range(retries + 1):
            try:
                result, call_record = await self._do_call(
                    agent, model, system_prompt, user_message,
                    response_model, temperature, max_tokens,
                )
                self.history.append(call_record)
                return result
            except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as e:
                last_error = e
                log.warning(
                    f"[{agent}] attempt {attempt+1}/{retries+1} failed due to network error: "
                    f"{type(e).__name__}: {e}"
                )
                if attempt < retries:
                    import asyncio
                    await asyncio.sleep(2 ** attempt)
            except Exception as e:
                last_error = e
                log.warning(f"[{agent}] attempt {attempt+1} failed: {e}")
                if attempt < retries:
                    import asyncio
                    await asyncio.sleep(2 ** attempt)

        self.history.append(LLMCall(agent=agent, model=model, success=False, error=str(last_error)))
        
        if response_model:
            log.error(f"[{agent}] all retries failed, returning default {response_model.__name__}")
            return response_model()
        return f"ERROR: {last_error}"

    async def _do_call(
        self, agent, model, system_prompt, user_message,
        response_model, temperature, max_tokens,
    ) -> tuple:
        if not self.config.openrouter_api_key:
            raise ValueError(
                "OPENROUTER_API_KEY is not set or empty. "
                "Set the OPENROUTER_API_KEY environment variable or run 'python -m talos setup' to configure."
            )

        client = await self._get_client()
        start = time.time()

        json_instruction = ""
        if response_model:
            schema_str = json.dumps(response_model.model_json_schema(), indent=2)
            json_instruction = (
                "\n\n--- OUTPUT FORMAT ---\n"
                "Respond with ONLY valid JSON. No markdown fences, no explanation.\n"
                f"JSON Schema:\n{schema_str}"
            )

        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt + json_instruction},
                {"role": "user", "content": user_message},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "provider": {"allow_fallbacks": True},
        }

        headers = {
            "Authorization": f"Bearer {self.config.openrouter_api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://talos.ai",
            "X-Title": "Talos AI",
        }

        resp = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=payload,
        )

        if resp.status_code != 200:
            raise Exception(f"OpenRouter {resp.status_code}: {resp.text[:300]}")

        data = resp.json()

        if "error" in data:
            raise Exception(f"OpenRouter error: {data['error']}")

        usage = data.get("usage", {})
        latency = (time.time() - start) * 1000

        cost = usage.get("total_cost", 0.0)
        if not cost:
            cost = (usage.get("prompt_tokens", 0) * 0.000003 +
                    usage.get("completion_tokens", 0) * 0.000015)

        call_record = LLMCall(
            agent=agent, model=model,
            tokens_in=usage.get("prompt_tokens", 0),
            tokens_out=usage.get("completion_tokens", 0),
            cost=cost, latency_ms=latency,
        )

        content = data["choices"][0]["message"]["content"]
        log.info(f"[{agent}] {model} | {call_record.tokens_in}+{call_record.tokens_out} tok | ${cost:.4f} | {latency:.0f}ms")

        if response_model:
            parsed = self._parse_json(content, response_model)
            return parsed, call_record

        return content, call_record

    def _parse_json(self, content: str, model: Type[T]) -> T:
        cleaned = content.strip()

        try:
            return model.model_validate_json(cleaned)
        except Exception:
            pass

        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            inner = "\n".join(lines[1:])
            if inner.rstrip().endswith("```"):
                inner = inner.rstrip()[:-3]
            try:
                return model.model_validate_json(inner.strip())
            except Exception:
                pass

        try:
            start = cleaned.index("{")
            depth = 0
            for i in range(start, len(cleaned)):
                if cleaned[i] == "{": depth += 1
                elif cleaned[i] == "}": depth -= 1
                if depth == 0:
                    json_str = cleaned[start:i+1]
                    return model.model_validate_json(json_str)
        except (ValueError, Exception):
            pass

        try:
            obj = json.loads(cleaned)
            return model.model_validate(obj)
        except Exception:
            pass

        log.error(f"Could not parse into {model.__name__}. Content: {cleaned[:500]}")
        return model()

    def drain_history(self) -> list[LLMCall]:
        """Return current history and clear it. Prevents unbounded accumulation."""
        calls = self.history.copy()
        self.history.clear()
        return calls

    def total_cost(self) -> float:
        return sum(c.cost for c in self.history)

    def cost_by_agent(self) -> dict[str, float]:
        costs: dict[str, float] = {}
        for c in self.history:
            costs[c.agent] = costs.get(c.agent, 0) + c.cost
        return costs

    def print_costs(self):
        print(f"\n{'='*60}")
        print(f"LLM COSTS — {len(self.history)} calls, ${self.total_cost():.4f} total")
        print(f"{'='*60}")
        by_agent: dict[str, list[LLMCall]] = {}
        for c in self.history:
            by_agent.setdefault(c.agent, []).append(c)
        for agent, calls in sorted(by_agent.items()):
            total = sum(c.cost for c in calls)
            avg_lat = sum(c.latency_ms for c in calls) / len(calls)
            print(f"  {agent:30s} | {len(calls):2d} calls | ${total:.4f} | {avg_lat:.0f}ms avg")
