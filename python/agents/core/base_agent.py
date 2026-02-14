"""
Base Agent Framework

Provides the foundational class for all procurement AI agents using LangGraph.
"""

from typing import TypedDict, Annotated, Sequence, Literal, Optional, Callable, Any
from dataclasses import dataclass, field
from abc import ABC, abstractmethod
import json
import operator
import time

from langgraph.graph import Graph, StateGraph, END
from langgraph.prebuilt import ToolExecutor, ToolInvocation
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage
from langchain_core.tools import BaseTool

from audit.logger import AuditLogger


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

        # Tool executor
        self.tool_executor = ToolExecutor(tools) if tools else None

        # Build the graph
        self.graph = self._build_graph()

    def _build_graph(self) -> Graph:
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
            # Create tool invocation
            invocation = ToolInvocation(
                tool=tool_call["name"],
                tool_input=tool_call["args"],
            )

            # Execute tool
            result = await self.tool_executor.ainvoke(invocation)

            # Create tool message
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
        audit_logger: Optional[AuditLogger] = None,
        execution_id: Optional[str] = None,
    ) -> dict:
        """
        Run the agent with a user message.

        Args:
            message: User's input message
            user_id: ID of the user making the request
            university_id: University context
            context: Additional context for the agent
            audit_logger: Optional AuditLogger for recording the interaction
            execution_id: Optional execution ID to group related audit entries

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

        # Build the full input text for audit (system prompt + user message)
        full_input = self._build_system_prompt(initial_state) + "\n\n---\nUser: " + message

        # Run the graph
        final_state = await self.graph.ainvoke(initial_state)

        duration_ms = int((time.monotonic() - start_time) * 1000)

        # Extract response
        last_message = final_state["messages"][-1]
        response_text = last_message.content if hasattr(last_message, "content") else str(last_message)

        # Collect all tool calls and results
        all_tool_calls = [
            tc for msg in final_state["messages"]
            if hasattr(msg, "tool_calls")
            for tc in msg.tool_calls
        ]
        all_tool_results = final_state.get("tool_results", [])

        # Extract decision and reasoning from the response
        decision, reasoning = self._extract_decision(response_text, all_tool_calls)

        # Extract procurement IDs from context
        requisition_id = (context or {}).get("requisition_id")
        purchase_order_id = (context or {}).get("purchase_order_id")
        contract_id = (context or {}).get("contract_id")

        # Log to audit trail
        if audit_logger:
            # Serialize tool results for audit
            serialized_tool_results = []
            for tr in all_tool_results:
                if hasattr(tr, "content"):
                    serialized_tool_results.append({
                        "tool_call_id": getattr(tr, "tool_call_id", None),
                        "content": tr.content,
                    })
                else:
                    serialized_tool_results.append(str(tr))

            audit_logger.log_agent_call(
                agent_name=self.config.agent_id,
                agent_tier=self.config.tier,
                input_text=full_input,
                output_text=response_text,
                model_used=self.config.model,
                triggered_by=user_id,
                trigger_type=(context or {}).get("trigger_type", "user"),
                decision=decision,
                reasoning=reasoning,
                tool_calls=all_tool_calls if all_tool_calls else None,
                tool_results=serialized_tool_results if serialized_tool_results else None,
                requisition_id=requisition_id,
                purchase_order_id=purchase_order_id,
                contract_id=contract_id,
                user_email=(context or {}).get("user_email"),
                user_department=(context or {}).get("department"),
                university_id=university_id,
                execution_id=execution_id,
                execution_duration_ms=duration_ms,
            )

        return {
            "response": response_text,
            "agent_id": self.config.agent_id,
            "tool_calls": all_tool_calls,
            "tool_results": all_tool_results,
            "pending_approval": final_state.get("pending_approval"),
        }

    def _extract_decision(
        self, response_text: str, tool_calls: list
    ) -> tuple[Optional[str], Optional[str]]:
        """
        Extract the decision and reasoning from agent output.

        Looks for common decision patterns in tool calls and response text.
        Returns (decision, reasoning) tuple.
        """
        decision = None
        reasoning = None

        # Check tool calls for decision indicators
        for tc in tool_calls:
            name = tc.get("name", "")
            args = tc.get("args", {})

            if name == "create_requisition":
                decision = "requisition_created"
                reasoning = f"Created requisition with {len(args.get('items', []))} items"
            elif name == "process_approval":
                decision = args.get("decision", "approval_processed")
                reasoning = args.get("comments", "Approval processed")
            elif name == "route_approval":
                decision = "routed_for_approval"
                reasoning = f"Routed for approval (amount: ${args.get('total_amount', 'N/A')})"
            elif name == "score_vendor":
                decision = "vendor_evaluated"
                reasoning = f"Evaluated vendor {args.get('vendor_id', 'N/A')}"
            elif name == "create_price_alert":
                decision = "price_alert_created"
            elif name == "escalate_approval":
                decision = "approval_escalated"
                reasoning = args.get("reason", "SLA breach")

        # If no decision from tools, try to infer from response
        if not decision and response_text:
            lower = response_text.lower()
            if "approved" in lower:
                decision = "approved"
            elif "rejected" in lower:
                decision = "rejected"
            elif "recommend" in lower:
                decision = "recommendation_made"

        # Use first 500 chars of response as reasoning fallback
        if not reasoning and response_text:
            reasoning = response_text[:500]

        return decision, reasoning


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
    - Audit logging for all agent interactions
    """

    def __init__(
        self,
        agents: dict[str, ProcurementAgent],
        audit_logger: Optional[AuditLogger] = None,
    ):
        self.agents = agents
        self.audit_logger = audit_logger

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
        """Execute a single agent with audit logging."""
        if agent_id not in self.agents:
            raise ValueError(f"Unknown agent: {agent_id}")

        # Generate execution ID for grouping audit entries
        execution_id = None
        if self.audit_logger:
            execution_id = self.audit_logger.start_execution()

        agent = self.agents[agent_id]
        return await agent.run(
            message,
            user_id,
            university_id,
            context,
            audit_logger=self.audit_logger,
            execution_id=execution_id,
        )

    async def execute_chain(
        self,
        agent_ids: list[str],
        message: str,
        user_id: str,
        university_id: str,
        context: Optional[dict] = None,
    ) -> list[dict]:
        """Execute a chain of agents sequentially with shared audit execution ID."""
        results = []
        current_context = context or {}
        current_message = message

        # All agents in a chain share one execution ID for traceability
        execution_id = None
        if self.audit_logger:
            execution_id = self.audit_logger.start_execution()

        for agent_id in agent_ids:
            if agent_id not in self.agents:
                raise ValueError(f"Unknown agent: {agent_id}")

            agent = self.agents[agent_id]
            result = await agent.run(
                current_message,
                user_id,
                university_id,
                current_context,
                audit_logger=self.audit_logger,
                execution_id=execution_id,
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
        """Execute multiple agents in parallel with shared audit execution ID."""
        import asyncio

        # Shared execution ID so parallel calls are grouped in audit
        execution_id = None
        if self.audit_logger:
            execution_id = self.audit_logger.start_execution()

        tasks = []
        for agent_id in agent_ids:
            if agent_id not in self.agents:
                raise ValueError(f"Unknown agent: {agent_id}")
            agent = self.agents[agent_id]
            tasks.append(
                agent.run(
                    message,
                    user_id,
                    university_id,
                    context,
                    audit_logger=self.audit_logger,
                    execution_id=execution_id,
                )
            )

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
