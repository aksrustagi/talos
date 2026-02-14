"""
Base Agent Framework

Provides the foundational class for all procurement AI agents using LangGraph.
"""

from typing import TypedDict, Annotated, Sequence, Literal, Optional, Callable, Any
from dataclasses import dataclass, field
from abc import ABC, abstractmethod
import json
import operator
import re
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

        # Extract token usage from LangChain response metadata
        input_tokens, output_tokens = self._extract_token_usage(final_state["messages"])

        # Collect all tool calls and results
        all_tool_calls = [
            tc for msg in final_state["messages"]
            if hasattr(msg, "tool_calls")
            for tc in msg.tool_calls
        ]
        all_tool_results = final_state.get("tool_results", [])

        # Extract decision and reasoning from the response
        decision, reasoning = self._extract_decision(response_text, all_tool_calls)

        # Extract procurement IDs - from context first, then auto-detect from content
        requisition_id = (context or {}).get("requisition_id")
        purchase_order_id = (context or {}).get("purchase_order_id")
        contract_id = (context or {}).get("contract_id")

        # Auto-detect procurement IDs from message, response, and tool calls
        all_text = message + " " + response_text
        for tc in all_tool_calls:
            args = tc.get("args", {})
            all_text += " " + json.dumps(args, default=str)

        if not requisition_id:
            requisition_id = self._extract_id(all_text, r"REQ-\d{4}-\d+")
            if not requisition_id:
                # Also check tool call args for requisition_id fields
                for tc in all_tool_calls:
                    rid = tc.get("args", {}).get("requisition_id")
                    if rid:
                        requisition_id = rid
                        break

        if not purchase_order_id:
            purchase_order_id = self._extract_id(all_text, r"PO-\d{4}-\d+")

        if not contract_id:
            contract_id = self._extract_id(all_text, r"CON-\d{4}-\d+")

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
                input_tokens=input_tokens,
                output_tokens=output_tokens,
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

    @staticmethod
    def _extract_token_usage(messages: list) -> tuple[Optional[int], Optional[int]]:
        """
        Extract token usage from LangChain AIMessage response_metadata.

        LangChain's ChatAnthropic populates response_metadata with usage info:
          {"usage": {"input_tokens": N, "output_tokens": N}}
        Accumulates across all AI messages (multi-turn tool use).
        """
        total_input = 0
        total_output = 0
        found_any = False

        for msg in messages:
            if not isinstance(msg, AIMessage):
                continue

            metadata = getattr(msg, "response_metadata", None) or {}
            usage = metadata.get("usage", {})

            if usage.get("input_tokens") is not None:
                total_input += usage["input_tokens"]
                found_any = True
            if usage.get("output_tokens") is not None:
                total_output += usage["output_tokens"]
                found_any = True

            # Also check usage_metadata (newer LangChain versions)
            usage_meta = getattr(msg, "usage_metadata", None) or {}
            if usage_meta.get("input_tokens") is not None:
                if not found_any:
                    total_input += usage_meta["input_tokens"]
                    found_any = True
            if usage_meta.get("output_tokens") is not None:
                if not found_any:
                    total_output += usage_meta["output_tokens"]

        if not found_any:
            return None, None
        return total_input, total_output

    @staticmethod
    def _extract_id(text: str, pattern: str) -> Optional[str]:
        """Extract a procurement ID matching a regex pattern from text."""
        match = re.search(pattern, text)
        return match.group(0) if match else None

    # Maps tool names to (decision_type, reasoning_template) for structured extraction.
    # Subclasses can override or extend via class attribute.
    DECISION_TOOL_MAP: dict[str, dict] = {
        "create_requisition": {
            "decision": "requisition_created",
            "reasoning_template": "Created requisition with {item_count} items",
            "reasoning_args": lambda args: {"item_count": len(args.get("items", []))},
        },
        "process_approval": {
            "decision_from_args": "decision",
            "decision_fallback": "approval_processed",
            "reasoning_from_args": "comments",
            "reasoning_fallback": "Approval processed",
        },
        "route_approval": {
            "decision": "routed_for_approval",
            "reasoning_template": "Routed for approval (amount: ${total_amount})",
            "reasoning_args": lambda args: {"total_amount": args.get("total_amount", "N/A")},
        },
        "score_vendor": {
            "decision": "vendor_evaluated",
            "reasoning_template": "Evaluated vendor {vendor_id}",
            "reasoning_args": lambda args: {"vendor_id": args.get("vendor_id", "N/A")},
        },
        "find_diverse_suppliers": {
            "decision": "diverse_suppliers_searched",
            "reasoning_template": "Searched diverse suppliers for category {category}",
            "reasoning_args": lambda args: {"category": args.get("category", "N/A")},
        },
        "assess_vendor_risk": {
            "decision": "vendor_risk_assessed",
            "reasoning_template": "Assessed risk for vendor {vendor_id}",
            "reasoning_args": lambda args: {"vendor_id": args.get("vendor_id", "N/A")},
        },
        "create_price_alert": {
            "decision": "price_alert_created",
            "reasoning_template": "Price alert created",
        },
        "escalate_approval": {
            "decision": "approval_escalated",
            "reasoning_from_args": "reason",
            "reasoning_fallback": "SLA breach",
        },
        "check_budget": {
            "decision": "budget_checked",
            "reasoning_template": "Budget check for {budget_code}: ${amount}",
            "reasoning_args": lambda args: {
                "budget_code": args.get("budget_code", "N/A"),
                "amount": args.get("amount", "N/A"),
            },
        },
        "validate_policy": {
            "decision": "policy_validated",
            "reasoning_template": "Policy validation completed",
        },
        "compare_vendor_prices": {
            "decision": "prices_compared",
            "reasoning_template": "Cross-vendor price comparison completed",
        },
        "get_price_history": {
            "decision": "price_history_analyzed",
            "reasoning_template": "Historical price analysis completed",
        },
        "recommend_purchase_timing": {
            "decision": "timing_recommended",
            "reasoning_template": "Purchase timing recommendation generated",
        },
    }

    def _extract_decision(
        self, response_text: str, tool_calls: list
    ) -> tuple[Optional[str], Optional[str]]:
        """
        Extract the decision and reasoning from agent output.

        Uses DECISION_TOOL_MAP for structured extraction from tool calls,
        then falls back to response text analysis.
        Returns (decision, reasoning) tuple.
        """
        decision = None
        reasoning = None

        # Check tool calls against the structured map
        for tc in tool_calls:
            name = tc.get("name", "")
            args = tc.get("args", {})

            mapping = self.DECISION_TOOL_MAP.get(name)
            if not mapping:
                continue

            # Extract decision
            if "decision_from_args" in mapping:
                decision = args.get(
                    mapping["decision_from_args"],
                    mapping.get("decision_fallback", name),
                )
            else:
                decision = mapping.get("decision", name)

            # Extract reasoning
            if "reasoning_from_args" in mapping:
                reasoning = args.get(
                    mapping["reasoning_from_args"],
                    mapping.get("reasoning_fallback"),
                )
            elif "reasoning_template" in mapping:
                template = mapping["reasoning_template"]
                if "reasoning_args" in mapping:
                    template_args = mapping["reasoning_args"](args)
                    reasoning = template.format(**template_args)
                else:
                    reasoning = template

        # If no decision from tools, try to infer from response
        if not decision and response_text:
            lower = response_text.lower()
            if "approved" in lower and "not approved" not in lower:
                decision = "approved"
            elif "rejected" in lower:
                decision = "rejected"
            elif "recommend" in lower:
                decision = "recommendation_made"
            elif "alert" in lower and "created" in lower:
                decision = "alert_created"
            elif "escalat" in lower:
                decision = "escalated"

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
