"""
Base Agent Framework

Provides the foundational class for all procurement AI agents using LangGraph.
"""

import time
from typing import TypedDict, Annotated, Sequence, Literal, Optional, Callable, Any
from dataclasses import dataclass, field
from abc import ABC, abstractmethod
import operator

from langgraph.graph import StateGraph, END
from langgraph.graph.state import CompiledStateGraph
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage
from langchain_core.tools import BaseTool
import structlog

from audit.audit_log import get_audit_logger

_audit_log = structlog.get_logger("audit")


# ============================================
# State Types
# ============================================

class AgentState(TypedDict):
    """State maintained throughout agent execution."""
    messages: Annotated[Sequence[BaseMessage], operator.add]
    context: dict
    user_id: str
    university_id: str
    current_agent: str
    tool_results: list
    pending_approval: Optional[dict]
    completed: bool


@dataclass
class AgentConfig:
    """Configuration for agent instances."""
    agent_id: str
    name: str
    tier: int
    category: str
    model: str = "claude-sonnet-4-20250514"
    max_tokens: int = 4096
    temperature: float = 0
    max_iterations: int = 10
    human_in_loop_threshold: float = 0.0  # Amount threshold for human review


# ============================================
# Base Agent Class
# ============================================

class ProcurementAgent(ABC):
    """
    Base class for all procurement AI agents.

    Implements the core agent loop with:
    - LangGraph state management
    - Tool execution
    - Human-in-the-loop checkpoints
    - Context enrichment
    """

    def __init__(
        self,
        config: AgentConfig,
        system_prompt: str,
        tools: list[BaseTool],
    ):
        self.config = config
        self.system_prompt = system_prompt
        self.tools = tools

        # Initialize LLM
        self.llm = ChatAnthropic(
            model=config.model,
            max_tokens=config.max_tokens,
            temperature=config.temperature,
        )

        # Bind tools to LLM
        if tools:
            self.llm_with_tools = self.llm.bind_tools(tools)
        else:
            self.llm_with_tools = self.llm

        # Tool map for execution
        self.tool_map = {t.name: t for t in tools} if tools else {}

        # Build the graph
        self.graph = self._build_graph()

    def _build_graph(self) -> CompiledStateGraph:
        """Build the LangGraph execution graph."""
        workflow = StateGraph(AgentState)

        # Add nodes
        workflow.add_node("agent", self._call_agent)
        workflow.add_node("tools", self._call_tools)
        workflow.add_node("human_review", self._human_review)

        # Set entry point
        workflow.set_entry_point("agent")

        # Add conditional edges
        workflow.add_conditional_edges(
            "agent",
            self._should_continue,
            {
                "tools": "tools",
                "human_review": "human_review",
                "end": END,
            }
        )

        # Tools always return to agent
        workflow.add_edge("tools", "agent")

        # Human review returns to agent
        workflow.add_edge("human_review", "agent")

        return workflow.compile()

    async def _call_agent(self, state: AgentState) -> dict:
        """Call the LLM with current state."""
        # Build messages with system prompt
        messages = [
            {"role": "system", "content": self._build_system_prompt(state)},
        ]

        # Add conversation history
        for msg in state["messages"]:
            if isinstance(msg, HumanMessage):
                messages.append({"role": "user", "content": msg.content})
            elif isinstance(msg, AIMessage):
                messages.append({"role": "assistant", "content": msg.content})
            elif isinstance(msg, ToolMessage):
                messages.append({
                    "role": "tool",
                    "tool_call_id": msg.tool_call_id,
                    "content": msg.content,
                })

        # Call LLM
        response = await self.llm_with_tools.ainvoke(messages)

        return {"messages": [response]}

    async def _call_tools(self, state: AgentState) -> dict:
        """Execute tool calls from the last message."""
        last_message = state["messages"][-1]

        if not hasattr(last_message, "tool_calls") or not last_message.tool_calls:
            return {"tool_results": []}

        results = []
        for tool_call in last_message.tool_calls:
            tool_name = tool_call["name"]
            tool = self.tool_map.get(tool_name)
            if tool is None:
                result = f"Error: unknown tool '{tool_name}'"
            else:
                result = await tool.ainvoke(tool_call["args"])

            tool_message = ToolMessage(
                content=str(result),
                tool_call_id=tool_call["id"],
            )
            results.append(tool_message)

        return {"messages": results, "tool_results": results}

    def _should_continue(self, state: AgentState) -> Literal["tools", "human_review", "end"]:
        """Determine next step in the graph."""
        last_message = state["messages"][-1]

        # Check if we have tool calls
        if hasattr(last_message, "tool_calls") and last_message.tool_calls:
            # Check if any require human review
            for tool_call in last_message.tool_calls:
                if self._requires_human_review(tool_call, state):
                    return "human_review"
            return "tools"

        # No tool calls, we're done
        return "end"

    def _requires_human_review(self, tool_call: dict, state: AgentState) -> bool:
        """
        Check if a tool call requires human review.
        Override in subclasses for custom logic.
        """
        # Default: check against threshold
        if self.config.human_in_loop_threshold <= 0:
            return False

        # Check if this is a high-value action
        if "amount" in tool_call.get("args", {}):
            amount = tool_call["args"]["amount"]
            if amount > self.config.human_in_loop_threshold:
                return True

        return False

    async def _human_review(self, state: AgentState) -> dict:
        """
        Handle human review checkpoint.

        This is a placeholder - actual implementation depends on
        your human-in-the-loop system (Slack, email, web UI, etc.)
        """
        # Mark as pending approval
        last_message = state["messages"][-1]
        tool_calls = last_message.tool_calls if hasattr(last_message, "tool_calls") else []

        return {
            "pending_approval": {
                "agent_id": self.config.agent_id,
                "tool_calls": tool_calls,
                "state": state,
            }
        }

    def _build_system_prompt(self, state: AgentState) -> str:
        """Build the full system prompt with context."""
        context = state.get("context", {})

        # Replace placeholders in system prompt
        prompt = self.system_prompt
        for key, value in context.items():
            placeholder = f"{{{key}}}"
            if placeholder in prompt:
                prompt = prompt.replace(placeholder, str(value))

        return prompt

    async def run(
        self,
        message: str,
        user_id: str,
        university_id: str,
        context: Optional[dict] = None,
    ) -> dict:
        """
        Run the agent with a user message.

        Args:
            message: User's input message
            user_id: ID of the user making the request
            university_id: University context
            context: Additional context for the agent

        Returns:
            Dict with response and any actions taken
        """
        start_time = time.monotonic()

        # Initialize state
        initial_state: AgentState = {
            "messages": [HumanMessage(content=message)],
            "context": context or {},
            "user_id": user_id,
            "university_id": university_id,
            "current_agent": self.config.agent_id,
            "tool_results": [],
            "pending_approval": None,
            "completed": False,
        }

        # Run the graph
        final_state = await self.graph.ainvoke(initial_state)

        duration_ms = int((time.monotonic() - start_time) * 1000)

        # Extract response
        last_message = final_state["messages"][-1]
        response_text = last_message.content if hasattr(last_message, "content") else str(last_message)

        tool_calls = [
            tc for msg in final_state["messages"]
            if hasattr(msg, "tool_calls")
            for tc in msg.tool_calls
        ]

        result = {
            "response": response_text,
            "agent_id": self.config.agent_id,
            "tool_calls": tool_calls,
            "tool_results": final_state.get("tool_results", []),
            "pending_approval": final_state.get("pending_approval"),
        }

        # ---- Audit logging ----
        # Extract procurement IDs from context for linking
        ctx = context or {}
        requisition_id = ctx.get("requisition_id")
        po_id = ctx.get("po_id")
        contract_id = ctx.get("contract_id")
        triggered_by = ctx.get("triggered_by", "user")
        workflow_run_id = ctx.get("workflow_run_id")
        workflow_step = ctx.get("workflow_step")
        parent_audit_id = ctx.get("parent_audit_id")

        # Derive decision info from tool calls
        decision_made = None
        decision_reasoning = None
        if tool_calls:
            actions = [tc.get("name", "unknown") for tc in tool_calls]
            decision_made = f"Invoked tools: {', '.join(actions)}"
        if final_state.get("pending_approval"):
            decision_made = "Flagged for human approval"
            decision_reasoning = (
                f"Amount exceeds threshold of ${self.config.human_in_loop_threshold:,.2f}"
            )

        try:
            audit_logger = get_audit_logger()
            serializable_tool_calls = []
            for tc in tool_calls:
                serializable_tool_calls.append({
                    "name": tc.get("name"),
                    "args": tc.get("args"),
                    "id": tc.get("id"),
                })

            audit_entry_id = audit_logger.log_agent_call(
                agent_name=self.config.name,
                agent_id=self.config.agent_id,
                input_message=message,
                input_context=ctx,
                output_response=response_text,
                output_tool_calls=serializable_tool_calls if serializable_tool_calls else None,
                model_used=self.config.model,
                triggered_by=triggered_by,
                decision_made=decision_made,
                decision_reasoning=decision_reasoning,
                requisition_id=requisition_id,
                po_id=po_id,
                contract_id=contract_id,
                user_id=user_id,
                user_email=ctx.get("user_email"),
                university_id=university_id,
                workflow_run_id=workflow_run_id,
                workflow_step=workflow_step,
                parent_audit_id=parent_audit_id,
                duration_ms=duration_ms,
            )
            result["audit_entry_id"] = audit_entry_id
        except Exception as exc:
            # Audit logging must not break the agent pipeline
            _audit_log.warning(
                "audit_logging_failed",
                agent_id=self.config.agent_id,
                error=str(exc),
                exc_info=True,
            )

        return result


# ============================================
# Agent Factory
# ============================================

class AgentFactory:
    """Factory for creating and managing agent instances."""

    _agents: dict[str, type[ProcurementAgent]] = {}
    _instances: dict[str, ProcurementAgent] = {}

    @classmethod
    def register(cls, agent_id: str) -> Callable:
        """Decorator to register an agent class."""
        def decorator(agent_class: type[ProcurementAgent]) -> type[ProcurementAgent]:
            cls._agents[agent_id] = agent_class
            return agent_class
        return decorator

    @classmethod
    def get(cls, agent_id: str, **kwargs) -> ProcurementAgent:
        """Get or create an agent instance."""
        if agent_id not in cls._instances:
            if agent_id not in cls._agents:
                raise ValueError(f"Unknown agent: {agent_id}")
            cls._instances[agent_id] = cls._agents[agent_id](**kwargs)
        return cls._instances[agent_id]

    @classmethod
    def list_agents(cls) -> list[str]:
        """List all registered agent IDs."""
        return list(cls._agents.keys())


# ============================================
# Multi-Agent Orchestration
# ============================================

class AgentOrchestrator:
    """
    Orchestrates multiple agents for complex tasks.

    Supports:
    - Sequential agent chains
    - Parallel agent execution
    - Dynamic routing based on intent
    """

    def __init__(self, agents: dict[str, ProcurementAgent]):
        self.agents = agents

        # Intent routing patterns
        self.intent_patterns = {
            "price": ["price-watch", "price-compare", "historical-price"],
            "requisition": ["requisition", "approval-workflow"],
            "invoice": ["invoice-matching", "contract-validator"],
            "vendor": ["vendor-selection", "risk-vendor-health"],
            "budget": ["budget-guardian", "spend-analytics"],
            "compliance": ["compliance-agent", "supplier-diversity"],
        }

    async def route_message(self, message: str) -> str:
        """Determine which agent should handle a message."""
        message_lower = message.lower()

        # Simple keyword-based routing
        for intent, agents in self.intent_patterns.items():
            if intent in message_lower:
                return agents[0]

        # Default to requisition agent
        return "requisition"

    async def execute(
        self,
        agent_id: str,
        message: str,
        user_id: str,
        university_id: str,
        context: Optional[dict] = None,
    ) -> dict:
        """Execute a single agent."""
        if agent_id not in self.agents:
            raise ValueError(f"Unknown agent: {agent_id}")

        agent = self.agents[agent_id]
        return await agent.run(message, user_id, university_id, context)

    async def execute_chain(
        self,
        agent_ids: list[str],
        message: str,
        user_id: str,
        university_id: str,
        context: Optional[dict] = None,
    ) -> list[dict]:
        """Execute a chain of agents sequentially."""
        results = []
        current_context = context or {}
        current_message = message

        for agent_id in agent_ids:
            result = await self.execute(
                agent_id,
                current_message,
                user_id,
                university_id,
                current_context,
            )
            results.append(result)

            # Pass output to next agent
            current_message = result["response"]
            current_context["previous_agent"] = agent_id
            current_context["previous_result"] = result

        return results

    async def execute_parallel(
        self,
        agent_ids: list[str],
        message: str,
        user_id: str,
        university_id: str,
        context: Optional[dict] = None,
    ) -> list[dict]:
        """Execute multiple agents in parallel."""
        import asyncio

        tasks = [
            self.execute(agent_id, message, user_id, university_id, context)
            for agent_id in agent_ids
        ]

        return await asyncio.gather(*tasks)

    def get_agent_status(self) -> dict:
        """Get status of all agents."""
        return {
            agent_id: {
                "name": agent.config.name,
                "tier": agent.config.tier,
                "category": agent.config.category,
            }
            for agent_id, agent in self.agents.items()
        }
