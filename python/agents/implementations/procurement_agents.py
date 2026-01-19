"""
Procurement Process Agent Implementations

Implements Tier 2 procurement process agents using LangGraph.
"""

from typing import Optional
from langchain_core.tools import tool

from agents.core.base_agent import ProcurementAgent, AgentConfig, AgentFactory


# ============================================
# Tools for Procurement Agents
# ============================================

@tool
def parse_request(text: str) -> str:
    """
    Parse a natural language purchase request.

    Args:
        text: Natural language request text
    """
    return f"Parsed request: {text[:50]}..."


@tool
def match_product(description: str, category: Optional[str] = None) -> str:
    """
    Match a product description to catalog items.

    Args:
        description: Product description
        category: Optional category hint
    """
    return f"Matched products for: {description}"


@tool
def check_budget(budget_code: str, amount: float) -> str:
    """
    Check if budget is available.

    Args:
        budget_code: Budget/cost center code
        amount: Amount to check
    """
    return f"Budget check for {budget_code}: ${amount}"


@tool
def validate_policy(
    items: list[dict],
    requester_id: str,
    budget_code: str,
) -> str:
    """
    Validate request against procurement policies.

    Args:
        items: List of items to validate
        requester_id: ID of the requester
        budget_code: Budget code for the request
    """
    return "Policy validation complete"


@tool
def create_requisition(
    items: list[dict],
    requester_id: str,
    budget_code: str,
    urgency: str = "standard",
    needed_by: Optional[str] = None,
) -> str:
    """
    Create a new requisition.

    Args:
        items: List of items with quantities and prices
        requester_id: ID of the requester
        budget_code: Budget code
        urgency: Urgency level (standard, rush, emergency)
        needed_by: Optional date needed by
    """
    return f"Created requisition with {len(items)} items"


@tool
def route_approval(requisition_id: str, total_amount: float) -> str:
    """
    Route requisition for approval based on amount.

    Args:
        requisition_id: ID of the requisition
        total_amount: Total amount for approval routing
    """
    return f"Routed {requisition_id} for approval (${total_amount})"


@tool
def get_pending_approvals(approver_id: str) -> str:
    """
    Get pending approvals for an approver.

    Args:
        approver_id: ID of the approver
    """
    return f"Pending approvals for {approver_id}"


@tool
def send_reminder(approval_id: str, approver_id: str) -> str:
    """
    Send approval reminder.

    Args:
        approval_id: ID of the pending approval
        approver_id: ID of the approver to remind
    """
    return f"Sent reminder for {approval_id}"


@tool
def escalate_approval(approval_id: str, reason: str) -> str:
    """
    Escalate an overdue approval.

    Args:
        approval_id: ID of the approval to escalate
        reason: Reason for escalation
    """
    return f"Escalated {approval_id}: {reason}"


@tool
def process_approval(
    approval_id: str,
    decision: str,
    comments: Optional[str] = None,
) -> str:
    """
    Process an approval decision.

    Args:
        approval_id: ID of the approval
        decision: Decision (approve, reject, delegate)
        comments: Optional comments
    """
    return f"Processed {approval_id}: {decision}"


@tool
def score_vendor(vendor_id: str, category: Optional[str] = None) -> str:
    """
    Get vendor scorecard.

    Args:
        vendor_id: ID of the vendor
        category: Optional category context
    """
    return f"Scorecard for vendor {vendor_id}"


@tool
def find_diverse_suppliers(category: str, diversity_type: Optional[str] = None) -> str:
    """
    Find diverse suppliers for a category.

    Args:
        category: Product category
        diversity_type: Optional diversity classification (MWBE, SBE, etc.)
    """
    return f"Diverse suppliers for {category}"


@tool
def assess_vendor_risk(vendor_id: str) -> str:
    """
    Assess risk for a vendor.

    Args:
        vendor_id: ID of the vendor
    """
    return f"Risk assessment for {vendor_id}"


@tool
def get_vendor_performance(vendor_id: str, period: str = "12m") -> str:
    """
    Get vendor performance metrics.

    Args:
        vendor_id: ID of the vendor
        period: Time period (e.g., "12m", "6m", "ytd")
    """
    return f"Performance metrics for {vendor_id} over {period}"


# ============================================
# System Prompts
# ============================================

REQUISITION_PROMPT = """# REQUISITION AGENT SYSTEM PROMPT

## Identity
You are the Requisition Agent for {university_name}'s procurement system.

## Your Role
Process purchase requests from any channel and convert them into properly formatted, policy-compliant requisitions.

## Available Tools
- parse_request: Parse natural language requests
- match_product: Match descriptions to catalog
- check_budget: Verify budget availability
- validate_policy: Check policy compliance
- create_requisition: Create formal requisition
- route_approval: Route for approvals

## Request Processing Flow
1. RECEIVE request
2. EXTRACT: items, quantities, urgency, budget code
3. MATCH: products to catalog
4. VALIDATE: budget, policy, approvals needed
5. ENRICH: add vendor recommendations, alternatives
6. GENERATE: formal requisition
7. ROUTE: to appropriate approver(s)
8. CONFIRM: acknowledgment to requester

## Policy Rules
- $0-$500: Auto-approve (within budget)
- $501-$5,000: Manager approval
- $5,001-$25,000: Director approval
- $25,001-$100,000: VP approval
- >$100,000: CFO approval

## Current Context
University: {university_name}
User: {user_name}
Department: {department}
Budget: {budget_code}
"""

APPROVAL_WORKFLOW_PROMPT = """# APPROVAL WORKFLOW AGENT SYSTEM PROMPT

## Identity
You are the Approval Workflow Agent for {university_name}'s procurement system.

## Your Role
Manage the procurement approval process, track SLAs, and ensure timely processing.

## Available Tools
- get_pending_approvals: Get pending items for an approver
- send_reminder: Send approval reminders
- escalate_approval: Escalate overdue approvals
- process_approval: Process approval decisions
- route_approval: Route to additional approvers

## SLA Targets
- Standard: 48 hours
- Rush: 8 hours
- Emergency: 2 hours

## Escalation Rules
- 75% of SLA: Send reminder
- 100% of SLA: First escalation (to backup)
- 150% of SLA: Second escalation (to manager)
- 200% of SLA: Executive escalation

## Current Context
University: {university_name}
"""

VENDOR_SELECTION_PROMPT = """# VENDOR SELECTION AGENT SYSTEM PROMPT

## Identity
You are the Vendor Selection Agent for {university_name}'s procurement system.

## Your Role
Recommend optimal vendors for procurement needs based on price, quality, diversity, and risk.

## Available Tools
- score_vendor: Get vendor scorecard
- find_diverse_suppliers: Find MWBE/SBE vendors
- assess_vendor_risk: Evaluate vendor risk
- get_vendor_performance: Get performance metrics

## Evaluation Dimensions (Weighted)
- Price (30%): Unit price, discounts, shipping, payment terms
- Quality (20%): Product quality, defect rate, specs match
- Delivery (20%): On-time rate, lead time, tracking
- Service (15%): Responsiveness, issue resolution, support
- Compliance (10%): Contract compliance, invoice accuracy
- Strategic (5%): Diversity, sustainability, local preference

## Diversity Classifications
- MWBE: Minority/Women Business Enterprise
- SBE: Small Business Enterprise
- SDVOSB: Service-Disabled Veteran-Owned
- HUBZone: Historically Underutilized Business Zone
- LGBTBE: LGBT-Owned Business Enterprise

## Current Context
University: {university_name}
Diversity Goal: {diversity_goal}%
"""


# ============================================
# Agent Implementations
# ============================================

@AgentFactory.register("requisition")
class RequisitionAgent(ProcurementAgent):
    """Agent for processing purchase requests and creating requisitions."""

    def __init__(self, university_name: str = "University"):
        config = AgentConfig(
            agent_id="requisition",
            name="Requisition Agent",
            tier=2,
            category="Procurement Process",
            human_in_loop_threshold=25000,  # Human review for orders over $25K
        )

        tools = [
            parse_request,
            match_product,
            check_budget,
            validate_policy,
            create_requisition,
            route_approval,
        ]

        super().__init__(
            config=config,
            system_prompt=REQUISITION_PROMPT.format(
                university_name=university_name,
                user_name="{user_name}",
                department="{department}",
                budget_code="{budget_code}",
            ),
            tools=tools,
        )

    def _requires_human_review(self, tool_call: dict, state) -> bool:
        """Require human review for large requisitions."""
        if tool_call["name"] == "create_requisition":
            items = tool_call.get("args", {}).get("items", [])
            total = sum(
                item.get("unit_price", 0) * item.get("quantity", 1)
                for item in items
            )
            return total > self.config.human_in_loop_threshold
        return False


@AgentFactory.register("approval-workflow")
class ApprovalWorkflowAgent(ProcurementAgent):
    """Agent for managing procurement approvals."""

    def __init__(self, university_name: str = "University"):
        config = AgentConfig(
            agent_id="approval-workflow",
            name="Approval Workflow Agent",
            tier=2,
            category="Procurement Process",
        )

        tools = [
            get_pending_approvals,
            send_reminder,
            escalate_approval,
            process_approval,
            route_approval,
        ]

        super().__init__(
            config=config,
            system_prompt=APPROVAL_WORKFLOW_PROMPT.format(
                university_name=university_name,
            ),
            tools=tools,
        )


@AgentFactory.register("vendor-selection")
class VendorSelectionAgent(ProcurementAgent):
    """Agent for vendor evaluation and selection."""

    def __init__(self, university_name: str = "University"):
        config = AgentConfig(
            agent_id="vendor-selection",
            name="Vendor Selection Agent",
            tier=2,
            category="Procurement Process",
        )

        tools = [
            score_vendor,
            find_diverse_suppliers,
            assess_vendor_risk,
            get_vendor_performance,
        ]

        super().__init__(
            config=config,
            system_prompt=VENDOR_SELECTION_PROMPT.format(
                university_name=university_name,
                diversity_goal="{diversity_goal}",
            ),
            tools=tools,
        )
