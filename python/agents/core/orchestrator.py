"""
Swarm Orchestrator

Master orchestrator that coordinates swarm teams of AI agents.
Implements hierarchical delegation, triage routing, and
multi-channel communication across all 30 procurement agents.

Integrations:
- A2A Protocol: Agent-to-agent interoperability (https://github.com/a2aproject/A2A)
- Composio: 250+ managed tool integrations (https://github.com/ComposioHQ/composio)
- CrewAI: Role-based hierarchical coordination
- OpenAI Agents SDK: Triage + handoff patterns
- Letta (MemGPT): Persistent long-term agent memory
- Google ADK: Sequential/Parallel/Loop workflow primitives
- Sendblue: iMessage/SMS communication (https://docs.sendblue.com/)
- Vapi AI: Voice agent calls
- Resend: Outbound email delivery
- AgentMail: Two-way agent email inboxes (https://docs.agentmail.to/)
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

import httpx

from .base_agent import AgentFactory, AgentOrchestrator, AgentState


# ============================================
# Swarm Team Definitions
# ============================================

class TeamPattern(str, Enum):
    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"
    HIERARCHICAL = "hierarchical"
    TRIAGE = "triage"


@dataclass
class SwarmTeam:
    id: str
    name: str
    manager_id: str
    member_ids: list[str]
    pattern: TeamPattern
    description: str


@dataclass
class CommunicationResult:
    success: bool
    channel: str
    message_id: str | None = None
    error: str | None = None


SWARM_TEAMS: list[SwarmTeam] = [
    SwarmTeam(
        id="price-intelligence",
        name="Price Intelligence Swarm",
        manager_id="price-orchestrator",
        member_ids=[
            "price-watch", "price-compare", "historical-price",
            "knowledge-graph", "contract-validator", "catalog-sync",
        ],
        pattern=TeamPattern.PARALLEL,
        description=(
            "Parallel price analysis across vendors with sequential reporting. "
            "Members analyze prices concurrently, then results are aggregated."
        ),
    ),
    SwarmTeam(
        id="procurement-pipeline",
        name="Procurement Pipeline Team",
        manager_id="procurement-manager",
        member_ids=[
            "requisition", "approval-workflow", "vendor-selection",
            "rfq-rfp", "po-generation",
        ],
        pattern=TeamPattern.SEQUENTIAL,
        description=(
            "Sequential procurement chain from requisition to PO. "
            "Each agent hands off to the next with enriched context."
        ),
    ),
    SwarmTeam(
        id="invoice-payment",
        name="Invoice & Payment Team",
        manager_id="finance-manager",
        member_ids=[
            "invoice-matching", "receipt-delivery",
            "payment-optimizer", "contract-validator",
        ],
        pattern=TeamPattern.SEQUENTIAL,
        description=(
            "Three-way match pipeline: invoice -> receipt -> payment. "
            "Contract validator runs in parallel to verify pricing."
        ),
    ),
    SwarmTeam(
        id="category-specialists",
        name="Category Specialist Router",
        manager_id="category-router",
        member_ids=[
            "lab-supply", "it-equipment", "office-supply", "furniture",
            "facilities", "marketing", "travel", "professional-services",
            "medical-supply", "capital-projects", "food-service",
        ],
        pattern=TeamPattern.TRIAGE,
        description=(
            "Triage-based routing to domain specialists. The manager "
            "classifies the request category and hands off to the specialist."
        ),
    ),
    SwarmTeam(
        id="intelligence-compliance",
        name="Intelligence & Compliance Team",
        manager_id="compliance-director",
        member_ids=[
            "spend-analytics", "budget-guardian", "compliance-agent",
            "supplier-diversity", "sustainability-agent",
            "risk-vendor-health", "contract-lifecycle", "savings-tracker",
        ],
        pattern=TeamPattern.PARALLEL,
        description=(
            "Parallel monitoring and alert aggregation. All intelligence "
            "agents run concurrently, monitoring their domains."
        ),
    ),
]


# ============================================
# Communication Channel Mapping
# ============================================

AGENT_CHANNELS: dict[str, list[str]] = {
    # Tier 1
    "price-watch": ["sendblue", "resend", "slack"],
    "catalog-sync": ["agentmail", "slack"],
    "price-compare": ["resend", "slack"],
    "knowledge-graph": ["resend", "slack"],
    "historical-price": ["resend", "slack"],
    "contract-validator": ["sendblue", "agentmail", "slack"],
    # Tier 2
    "requisition": ["sendblue", "vapi", "agentmail", "slack"],
    "approval-workflow": ["sendblue", "vapi", "resend", "slack"],
    "vendor-selection": ["agentmail", "slack"],
    "rfq-rfp": ["agentmail", "resend", "slack"],
    "po-generation": ["agentmail", "slack"],
    "invoice-matching": ["agentmail", "slack"],
    "receipt-delivery": ["sendblue", "slack"],
    "payment-optimizer": ["resend", "slack"],
    # Tier 3
    "lab-supply": ["sendblue", "slack"],
    "it-equipment": ["slack", "agentmail"],
    "office-supply": ["slack"],
    "furniture": ["agentmail", "slack"],
    "facilities": ["sendblue", "vapi", "slack"],
    "marketing": ["resend", "agentmail", "slack"],
    "travel": ["sendblue", "resend", "slack"],
    "professional-services": ["agentmail", "resend", "slack"],
    "medical-supply": ["sendblue", "vapi", "slack"],
    "capital-projects": ["agentmail", "resend", "slack"],
    "food-service": ["vapi", "slack"],
    # Intelligence & Compliance
    "spend-analytics": ["resend", "slack"],
    "budget-guardian": ["sendblue", "resend", "slack"],
    "compliance-agent": ["agentmail", "resend", "slack"],
    "supplier-diversity": ["resend", "slack"],
    "sustainability-agent": ["resend", "slack"],
    "risk-vendor-health": ["sendblue", "resend", "slack"],
    "contract-lifecycle": ["sendblue", "resend", "agentmail", "slack"],
    "savings-tracker": ["resend", "slack"],
}


# ============================================
# Communication Channels
# ============================================

class SendblueClient:
    """iMessage/SMS/RCS via Sendblue (https://docs.sendblue.com/)"""

    def __init__(self, api_key: str, api_secret: str = ""):
        self.api_key = api_key
        self.api_secret = api_secret
        self.base_url = "https://api.sendblue.co/api"

    async def send_sms(self, to: str, content: str) -> CommunicationResult:
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(
                    f"{self.base_url}/send-message",
                    json={"number": to, "content": content},
                    headers={
                        "sb-api-key-id": self.api_key,
                        "sb-api-secret-key": self.api_secret,
                    },
                )
                if resp.is_success:
                    data = resp.json()
                    return CommunicationResult(
                        success=True, channel="sendblue",
                        message_id=data.get("message_id"),
                    )
                return CommunicationResult(
                    success=False, channel="sendblue", error=resp.text,
                )
            except Exception as e:
                return CommunicationResult(
                    success=False, channel="sendblue", error=str(e),
                )

    async def send_approval_request(
        self, to: str, req_id: str, summary: str, amount: float
    ) -> CommunicationResult:
        message = (
            f"APPROVAL REQUEST [{req_id}]\n\n"
            f"{summary}\n\n"
            f"Amount: ${amount:,.2f}\n\n"
            f"Reply APPROVE or DENY"
        )
        return await self.send_sms(to, message)


class VapiClient:
    """Voice AI via Vapi (https://vapi.ai/)"""

    def __init__(self, api_key: str, assistant_id: str = ""):
        self.api_key = api_key
        self.assistant_id = assistant_id
        self.base_url = "https://api.vapi.ai"

    async def make_call(
        self, to: str, first_message: str, context: dict[str, Any] | None = None,
    ) -> CommunicationResult:
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(
                    f"{self.base_url}/call",
                    json={
                        "assistantId": self.assistant_id,
                        "customer": {"number": to},
                        "firstMessage": first_message,
                        "assistantOverrides": {
                            "variableValues": context or {},
                        },
                    },
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
                if resp.is_success:
                    data = resp.json()
                    return CommunicationResult(
                        success=True, channel="vapi", message_id=data.get("id"),
                    )
                return CommunicationResult(
                    success=False, channel="vapi", error=resp.text,
                )
            except Exception as e:
                return CommunicationResult(
                    success=False, channel="vapi", error=str(e),
                )


class ResendClient:
    """Outbound email via Resend (https://resend.com/)"""

    def __init__(self, api_key: str, from_email: str = "talos@procurement.columbia.edu"):
        self.api_key = api_key
        self.from_email = from_email
        self.base_url = "https://api.resend.com"

    async def send_email(
        self, to: str | list[str], subject: str, content: str, html: str | None = None,
    ) -> CommunicationResult:
        recipients = [to] if isinstance(to, str) else to
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(
                    f"{self.base_url}/emails",
                    json={
                        "from": f"Talos Procurement AI <{self.from_email}>",
                        "to": recipients,
                        "subject": subject,
                        "text": content,
                        "html": html or content,
                    },
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
                if resp.is_success:
                    data = resp.json()
                    return CommunicationResult(
                        success=True, channel="resend", message_id=data.get("id"),
                    )
                return CommunicationResult(
                    success=False, channel="resend", error=resp.text,
                )
            except Exception as e:
                return CommunicationResult(
                    success=False, channel="resend", error=str(e),
                )

    async def send_report(
        self, to: str | list[str], report_type: str, content: str,
    ) -> CommunicationResult:
        subject = f"Talos Procurement Report: {report_type}"
        return await self.send_email(to, subject, content)


class AgentMailClient:
    """Two-way agent email via AgentMail (https://docs.agentmail.to/)"""

    def __init__(self, api_key: str, base_url: str = "https://api.agentmail.to/v1"):
        self.api_key = api_key
        self.base_url = base_url
        self._inbox_cache: dict[str, dict] = {}

    async def create_inbox(self, agent_id: str, display_name: str) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.base_url}/inboxes",
                json={
                    "displayName": f"{display_name} (Talos)",
                    "metadata": {"agentId": agent_id, "platform": "talos"},
                },
                headers={"Authorization": f"Bearer {self.api_key}"},
            )
            data = resp.json()
            self._inbox_cache[agent_id] = data
            return data

    async def get_inbox(self, agent_id: str) -> dict:
        if agent_id in self._inbox_cache:
            return self._inbox_cache[agent_id]
        return await self.create_inbox(agent_id, agent_id)

    async def send_email(
        self, inbox_id: str, to: str | list[str], subject: str, body: str,
        thread_id: str | None = None,
    ) -> CommunicationResult:
        recipients = [to] if isinstance(to, str) else to
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(
                    f"{self.base_url}/inboxes/{inbox_id}/messages",
                    json={
                        "to": recipients,
                        "subject": subject,
                        "body": body,
                        "threadId": thread_id,
                    },
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
                if resp.is_success:
                    data = resp.json()
                    return CommunicationResult(
                        success=True, channel="agentmail",
                        message_id=data.get("messageId"),
                    )
                return CommunicationResult(
                    success=False, channel="agentmail", error=resp.text,
                )
            except Exception as e:
                return CommunicationResult(
                    success=False, channel="agentmail", error=str(e),
                )

    async def send_rfq(
        self, agent_id: str, vendor_emails: list[str],
        rfq_id: str, title: str, items: list[dict], deadline: str,
    ) -> dict[str, CommunicationResult]:
        inbox = await self.get_inbox(agent_id)
        inbox_id = inbox.get("id", "")
        results: dict[str, CommunicationResult] = {}

        items_text = "\n".join(
            f"  {i+1}. {item['description']} - Qty: {item['quantity']} {item.get('unit', 'ea')}"
            for i, item in enumerate(items)
        )
        body = (
            f"Request for Quotation\n\n"
            f"RFQ ID: {rfq_id}\n"
            f"Title: {title}\n"
            f"Response Deadline: {deadline}\n\n"
            f"Items Requested:\n{items_text}\n\n"
            f"Please reply to this email with your quotation.\n\n"
            f"Talos Procurement AI\nColumbia University"
        )

        for email in vendor_emails:
            result = await self.send_email(
                inbox_id, email, f"RFQ {rfq_id}: {title}", body,
            )
            results[email] = result

        return results


# ============================================
# Letta (MemGPT) Memory Provider
# ============================================

class LettaMemoryProvider:
    """Persistent long-term memory via Letta (https://www.letta.com/)"""

    def __init__(self, base_url: str = "http://localhost:8283", token: str = ""):
        self.base_url = base_url
        self.token = token
        self._local_store: dict[str, list[dict]] = {}

    async def recall(
        self, user_id: str, query: str, limit: int = 10,
    ) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{self.base_url}/v1/agents/memory/recall",
                    json={"userId": user_id, "query": query, "limit": limit},
                    headers={"Authorization": f"Bearer {self.token}"},
                )
                if resp.is_success:
                    return resp.json()
        except Exception:
            pass

        # Fallback to local store
        entries = self._local_store.get(user_id, [])
        return {
            "preferences": {},
            "recentDecisions": entries[-5:],
            "vendorRelationships": {},
        }

    async def archive(self, user_id: str, data: dict[str, Any]) -> None:
        entry = {
            "content": data,
            "timestamp": time.time(),
            "user_id": user_id,
        }
        self._local_store.setdefault(user_id, []).append(entry)

        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{self.base_url}/v1/agents/memory/archival",
                    json={"userId": user_id, "entry": entry},
                    headers={"Authorization": f"Bearer {self.token}"},
                )
        except Exception:
            pass  # Best-effort persistence


# ============================================
# A2A Protocol Client
# ============================================

class A2AProtocolClient:
    """Client for A2A agent-to-agent communication."""

    def __init__(self):
        pass

    async def discover_agent(self, base_url: str) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{base_url}/.well-known/agent.json")
            resp.raise_for_status()
            return resp.json()

    async def send_task(
        self, agent_url: str, message: str, blocking: bool = True,
    ) -> dict:
        request = {
            "jsonrpc": "2.0",
            "id": f"req_{int(time.time())}",
            "method": "message/send",
            "params": {
                "blocking": blocking,
                "message": {"role": "user", "parts": [{"text": message}]},
            },
        }
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{agent_url}/a2a",
                json=request,
                headers={"Content-Type": "application/json"},
            )
            return resp.json()

    async def get_task(self, agent_url: str, task_id: str) -> dict:
        request = {
            "jsonrpc": "2.0",
            "id": f"req_{int(time.time())}",
            "method": "tasks/get",
            "params": {"taskId": task_id},
        }
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{agent_url}/a2a", json=request,
                headers={"Content-Type": "application/json"},
            )
            return resp.json()


# ============================================
# Composio Tool Provider
# ============================================

class ComposioToolProvider:
    """250+ managed tool integrations via Composio."""

    AGENT_TOOLKITS: dict[str, list[str]] = {
        "vendor-selection": ["HUBSPOT", "SALESFORCE"],
        "rfq-rfp": ["GMAIL", "GOOGLE_DOCS"],
        "it-equipment": ["JIRA", "SERVICENOW"],
        "spend-analytics": ["GOOGLE_SHEETS", "NOTION"],
        "marketing": ["MAILCHIMP", "CANVA"],
        "travel": ["GOOGLE_CALENDAR"],
        "compliance-agent": ["GOOGLE_DRIVE", "GOOGLE_DOCS"],
        "risk-vendor-health": ["GOOGLE_SEARCH", "PERPLEXITY"],
    }

    def __init__(self, api_key: str, base_url: str = "https://backend.composio.dev/api/v2"):
        self.api_key = api_key
        self.base_url = base_url

    async def get_tools(self, user_id: str, toolkits: list[str]) -> list[dict]:
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(
                    f"{self.base_url}/tools",
                    json={"userId": user_id, "toolkits": toolkits},
                    headers={"X-API-Key": self.api_key},
                )
                if resp.is_success:
                    data = resp.json()
                    return data.get("tools", [])
            except Exception:
                pass
        return []

    async def get_tools_for_agent(self, agent_id: str, user_id: str) -> list[dict]:
        toolkits = self.AGENT_TOOLKITS.get(agent_id, [])
        if not toolkits:
            return []
        return await self.get_tools(user_id, toolkits)

    async def execute_tool(
        self, tool_name: str, args: dict, user_id: str,
    ) -> dict:
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(
                    f"{self.base_url}/tools/execute",
                    json={"toolName": tool_name, "args": args, "userId": user_id},
                    headers={"X-API-Key": self.api_key},
                )
                if resp.is_success:
                    return {"success": True, "data": resp.json()}
            except Exception as e:
                return {"success": False, "error": str(e)}
        return {"success": False, "error": "Tool execution failed"}


# ============================================
# Master Swarm Orchestrator
# ============================================

class SwarmOrchestrator:
    """
    Top-level orchestrator coordinating 5 swarm teams of 30 agents.

    Implements:
    - Intent-based triage routing (OpenAI Agents SDK pattern)
    - Hierarchical delegation (CrewAI pattern)
    - Sequential/Parallel/Loop execution (Google ADK pattern)
    - Persistent memory (Letta/MemGPT pattern)
    - A2A protocol for external agent communication
    - Multi-channel notifications (Sendblue, Vapi, Resend, AgentMail)
    - Composio for 250+ SaaS tool access
    """

    def __init__(
        self,
        agent_orchestrator: AgentOrchestrator,
        *,
        sendblue_key: str = "",
        sendblue_secret: str = "",
        vapi_key: str = "",
        vapi_assistant_id: str = "",
        resend_key: str = "",
        agentmail_key: str = "",
        composio_key: str = "",
        letta_url: str = "http://localhost:8283",
    ):
        self.agent_orchestrator = agent_orchestrator

        # Swarm teams
        self.teams: dict[str, SwarmTeam] = {t.id: t for t in SWARM_TEAMS}

        # Communication channels
        self.sendblue = SendblueClient(sendblue_key, sendblue_secret)
        self.vapi = VapiClient(vapi_key, vapi_assistant_id)
        self.resend = ResendClient(resend_key)
        self.agentmail = AgentMailClient(agentmail_key)

        # Framework integrations
        self.a2a = A2AProtocolClient()
        self.composio = ComposioToolProvider(composio_key)
        self.memory = LettaMemoryProvider(letta_url)

    # ---- Intent Classification & Routing ----

    INTENT_MAP: dict[str, str] = {
        "price": "price-intelligence",
        "cost": "price-intelligence",
        "compare": "price-intelligence",
        "monitor": "price-intelligence",
        "trend": "price-intelligence",
        "buy": "procurement-pipeline",
        "purchase": "procurement-pipeline",
        "order": "procurement-pipeline",
        "requisition": "procurement-pipeline",
        "approve": "procurement-pipeline",
        "invoice": "invoice-payment",
        "payment": "invoice-payment",
        "receipt": "invoice-payment",
        "lab": "category-specialists",
        "chemical": "category-specialists",
        "equipment": "category-specialists",
        "furniture": "category-specialists",
        "facilities": "category-specialists",
        "travel": "category-specialists",
        "medical": "category-specialists",
        "construction": "category-specialists",
        "food": "category-specialists",
        "budget": "intelligence-compliance",
        "compliance": "intelligence-compliance",
        "audit": "intelligence-compliance",
        "diversity": "intelligence-compliance",
        "sustainability": "intelligence-compliance",
        "risk": "intelligence-compliance",
        "savings": "intelligence-compliance",
        "spend": "intelligence-compliance",
        "report": "intelligence-compliance",
    }

    def classify_intent(self, message: str) -> str:
        message_lower = message.lower()
        for keyword, team_id in self.INTENT_MAP.items():
            if keyword in message_lower:
                return team_id
        return "procurement-pipeline"  # default

    # ---- Triage (OpenAI Agents SDK Pattern) ----

    CATEGORY_KEYWORDS: dict[str, list[str]] = {
        "lab-supply": ["lab", "chemical", "reagent", "pipette", "scientific", "research"],
        "it-equipment": ["computer", "laptop", "software", "network", "server", "license"],
        "office-supply": ["paper", "toner", "pen", "office", "desk supply"],
        "furniture": ["desk", "chair", "table", "cabinet", "furniture"],
        "facilities": ["hvac", "plumbing", "electrical", "cleaning", "maintenance", "repair"],
        "marketing": ["promotional", "event", "catering", "print", "swag"],
        "travel": ["flight", "hotel", "conference", "travel", "airfare"],
        "professional-services": ["consulting", "legal", "audit", "staffing"],
        "medical-supply": ["medical", "clinical", "pharmaceutical", "ppe"],
        "capital-projects": ["construction", "renovation", "contractor", "building"],
        "food-service": ["food", "dining", "catering", "kitchen"],
    }

    def triage_to_specialist(self, message: str, available: list[str]) -> str:
        message_lower = message.lower()
        best_agent = available[0] if available else "requisition"
        best_score = 0

        for agent_id, keywords in self.CATEGORY_KEYWORDS.items():
            if agent_id not in available:
                continue
            score = sum(1 for kw in keywords if kw in message_lower)
            if score > best_score:
                best_score = score
                best_agent = agent_id

        return best_agent

    # ---- Guardrails (OpenAI Agents SDK Pattern) ----

    @staticmethod
    def check_guardrails(message: str) -> tuple[bool, list[str]]:
        violations: list[str] = []
        import re

        if re.search(r"delete.*transaction|modify.*invoice.*amount", message, re.I):
            violations.append("Direct financial data modification not allowed")
        if re.search(r"social.*security|ssn|credit.*card.*number", message, re.I):
            violations.append("PII requests are not permitted")
        if re.search(r"override.*approval|bypass.*policy|skip.*compliance", message, re.I):
            violations.append("Policy override requests require manual authorization")

        return len(violations) == 0, violations

    # ---- Execution Patterns ----

    async def execute_parallel(
        self, agent_ids: list[str], message: str,
        user_id: str, university_id: str, context: dict | None = None,
    ) -> list[dict]:
        """Google ADK ParallelAgent pattern."""
        return await self.agent_orchestrator.execute_parallel(
            agent_ids, message, user_id, university_id, context,
        )

    async def execute_sequential(
        self, agent_ids: list[str], message: str,
        user_id: str, university_id: str, context: dict | None = None,
    ) -> list[dict]:
        """Google ADK SequentialAgent pattern."""
        return await self.agent_orchestrator.execute_chain(
            agent_ids, message, user_id, university_id, context,
        )

    async def execute_triage(
        self, message: str, team: SwarmTeam,
        user_id: str, university_id: str, context: dict | None = None,
    ) -> dict:
        """OpenAI Agents SDK triage + handoff pattern."""
        specialist = self.triage_to_specialist(message, team.member_ids)
        return await self.agent_orchestrator.execute(
            specialist, message, user_id, university_id, context,
        )

    # ---- Main Processing Pipeline ----

    async def process(
        self,
        message: str,
        user_id: str,
        university_id: str,
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Process a request through the full orchestration pipeline:
        1. Load memory (Letta)
        2. Check guardrails (OpenAI Agents SDK)
        3. Classify intent & select team
        4. Execute via team pattern (CrewAI/Google ADK)
        5. Communicate results (Sendblue/Vapi/Resend/AgentMail)
        6. Save memory (Letta)
        """
        ctx = context or {}

        # 1. Load memory
        memory = await self.memory.recall(user_id, message)
        ctx["memory"] = memory

        # 2. Check guardrails
        passed, violations = self.check_guardrails(message)
        if not passed:
            return {
                "success": False,
                "error": "Guardrail violation",
                "violations": violations,
                "team": None,
                "agents": [],
            }

        # 3. Classify intent and select team
        team_id = self.classify_intent(message)
        team = self.teams.get(team_id)
        if not team:
            return {"success": False, "error": f"Unknown team: {team_id}"}

        # 4. Execute via team pattern
        results: Any = None
        agents_used: list[str] = team.member_ids

        if team.pattern == TeamPattern.PARALLEL:
            results = await self.execute_parallel(
                team.member_ids, message, user_id, university_id, ctx,
            )
        elif team.pattern == TeamPattern.SEQUENTIAL:
            results = await self.execute_sequential(
                team.member_ids, message, user_id, university_id, ctx,
            )
        elif team.pattern == TeamPattern.TRIAGE:
            result = await self.execute_triage(
                message, team, user_id, university_id, ctx,
            )
            results = [result]
            agents_used = [result.get("agent_id", team.member_ids[0])]
        else:
            # Hierarchical -- use sequential with manager
            results = await self.execute_sequential(
                team.member_ids, message, user_id, university_id, ctx,
            )

        # 5. Communicate results
        comm_results = await self._send_notifications(
            agents_used, results, ctx,
        )

        # 6. Save memory
        await self.memory.archive(user_id, {
            "team": team_id,
            "agents": agents_used,
            "message_preview": message[:200],
            "timestamp": time.time(),
        })

        return {
            "success": True,
            "team": team_id,
            "team_name": team.name,
            "pattern": team.pattern.value,
            "agents": agents_used,
            "results": results,
            "communication": comm_results,
        }

    async def _send_notifications(
        self, agent_ids: list[str], results: Any, context: dict,
    ) -> list[CommunicationResult]:
        """Route notifications through appropriate channels."""
        notifications: list[CommunicationResult] = []
        user_phone = context.get("user_phone")
        user_email = context.get("user_email")

        # Determine if urgent
        result_str = str(results)
        is_urgent = "CRITICAL" in result_str or "emergency" in result_str.lower()

        # Collect unique channels for all involved agents
        channels: set[str] = set()
        for agent_id in agent_ids:
            for ch in AGENT_CHANNELS.get(agent_id, ["slack"]):
                channels.add(ch)

        summary = result_str[:500] if isinstance(results, str) else str(results)[:500]

        if is_urgent and "sendblue" in channels and user_phone:
            result = await self.sendblue.send_sms(user_phone, summary)
            notifications.append(result)

        if "resend" in channels and user_email:
            result = await self.resend.send_email(
                user_email,
                f"Talos Procurement Update",
                summary,
            )
            notifications.append(result)

        return notifications

    # ---- A2A Protocol ----

    async def handle_a2a_task(self, task_payload: dict) -> dict:
        """Handle an inbound A2A task from an external agent."""
        message = ""
        for msg in task_payload.get("messages", []):
            for part in msg.get("parts", []):
                if "text" in part:
                    message += part["text"]

        result = await self.process(
            message, user_id="a2a_external",
            university_id="columbia",
            context={"source": "a2a"},
        )
        return {
            "status": "completed" if result["success"] else "failed",
            "artifacts": [{"parts": [{"text": str(result)}]}],
        }

    async def discover_external_agents(self, urls: list[str]) -> list[dict]:
        """Discover external A2A agents."""
        cards = []
        for url in urls:
            try:
                card = await self.a2a.discover_agent(url)
                cards.append(card)
            except Exception:
                pass
        return cards

    # ---- Composio Tools ----

    async def get_composio_tools(self, agent_id: str, user_id: str) -> list[dict]:
        """Get Composio-managed SaaS tools for an agent."""
        return await self.composio.get_tools_for_agent(agent_id, user_id)

    # ---- Status ----

    def get_team_status(self) -> list[dict]:
        return [
            {
                "id": team.id,
                "name": team.name,
                "pattern": team.pattern.value,
                "member_count": len(team.member_ids),
                "members": team.member_ids,
            }
            for team in SWARM_TEAMS
        ]
