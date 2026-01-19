"""
Price Intelligence Agent Implementations

Implements Tier 1 price intelligence agents using LangGraph.
"""

from typing import Optional
from langchain_core.tools import tool

from agents.core.base_agent import ProcurementAgent, AgentConfig, AgentFactory


# ============================================
# Tools for Price Agents
# ============================================

@tool
def search_products(query: str, category: Optional[str] = None, limit: int = 10) -> str:
    """
    Search the unified product catalog.

    Args:
        query: Search query string
        category: Optional category filter
        limit: Maximum results to return
    """
    # Implementation would call Convex
    return f"Found {limit} products matching '{query}'"


@tool
def get_price_history(product_id: str, vendor_id: Optional[str] = None, days: int = 365) -> str:
    """
    Get historical prices for a product.

    Args:
        product_id: Product identifier
        vendor_id: Optional vendor filter
        days: Number of days of history
    """
    return f"Price history for {product_id} over {days} days"


@tool
def get_vendor_listings(product_id: str) -> str:
    """
    Get current prices from all vendors for a product.

    Args:
        product_id: Product identifier
    """
    return f"Vendor listings for {product_id}"


@tool
def create_price_alert(
    product_id: str,
    alert_type: str,
    threshold: float,
    notify_emails: list[str],
) -> str:
    """
    Create a price alert.

    Args:
        product_id: Product to monitor
        alert_type: Type of alert (price_drop, price_increase, better_price)
        threshold: Threshold percentage for alert
        notify_emails: Email addresses to notify
    """
    return f"Created {alert_type} alert for {product_id} at {threshold}%"


@tool
def send_slack_alert(channel: str, message: str, level: str = "info") -> str:
    """
    Send an alert to Slack.

    Args:
        channel: Slack channel
        message: Alert message
        level: Alert level (info, warning, critical)
    """
    return f"Sent {level} alert to #{channel}"


@tool
def compare_vendor_prices(product_id: str, quantity: int = 1) -> str:
    """
    Compare prices across all vendors for a product.

    Args:
        product_id: Product identifier
        quantity: Quantity to price
    """
    return f"Price comparison for {product_id} x {quantity}"


@tool
def calculate_total_cost(
    product_id: str,
    vendor_id: str,
    quantity: int,
    include_shipping: bool = True,
) -> str:
    """
    Calculate total cost including shipping and fees.

    Args:
        product_id: Product identifier
        vendor_id: Vendor identifier
        quantity: Quantity to purchase
        include_shipping: Whether to include shipping costs
    """
    return f"Total cost calculation for {product_id}"


@tool
def get_network_benchmark(product_id: str) -> str:
    """
    Get cross-university price benchmark.

    Args:
        product_id: Product identifier
    """
    return f"Network benchmark for {product_id}"


@tool
def predict_price_state(product_id: str) -> str:
    """
    Predict future price state using HMM.

    Args:
        product_id: Product identifier
    """
    return f"Price state prediction for {product_id}"


@tool
def recommend_purchase_timing(product_id: str, target_price: Optional[float] = None) -> str:
    """
    Recommend optimal purchase timing.

    Args:
        product_id: Product identifier
        target_price: Optional target price to wait for
    """
    return f"Purchase timing recommendation for {product_id}"


# ============================================
# System Prompts
# ============================================

PRICE_WATCH_PROMPT = """# PRICEWATCH AGENT SYSTEM PROMPT

## Identity
You are the PriceWatch Agent for {university_name}'s procurement system.

## Your Role
Monitor prices across all vendor catalogs and alert the procurement team to significant changes, opportunities, and risks.

## Available Tools
- search_products: Search the unified product catalog
- get_price_history: Get historical prices for a product
- get_vendor_listings: Get current prices from all vendors
- create_price_alert: Set up a price alert
- send_slack_alert: Send urgent alerts to Slack

## Alert Thresholds
- CRITICAL: >15% increase or contract violation
- HIGH: >10% increase or better price found
- MEDIUM: 5-10% change
- LOW: <5% change

## Behavioral Guidelines
1. Always calculate annual impact based on purchase history
2. Verify product equivalence before suggesting alternatives
3. Factor in total cost (shipping, handling, minimums)
4. Learn from user feedback on alert relevance

## Current Context
University: {university_name}
User: {user_name}
Department: {department}
"""

PRICE_COMPARE_PROMPT = """# PRICE COMPARE AGENT SYSTEM PROMPT

## Identity
You are the Price Compare Agent for {university_name}'s procurement system.

## Your Role
Provide comprehensive price comparisons across vendors, considering total cost of ownership.

## Available Tools
- search_products: Search the unified product catalog
- compare_vendor_prices: Compare prices across vendors
- calculate_total_cost: Calculate total cost including fees
- get_network_benchmark: Get cross-university benchmarks
- get_price_history: Get historical pricing data

## Comparison Factors
When comparing prices, always consider:
1. Unit Price: Normalize to same unit of measure
2. Pack Size: Calculate price per unit
3. Shipping: Free shipping thresholds, expedited options
4. Minimum Orders: MOQs and their impact
5. Volume Discounts: Tier pricing at different quantities
6. Payment Terms: Early pay discounts
7. Contract Status: Negotiated rates vs. list price
8. Supplier Diversity: MWBE certification status
9. Sustainability: Environmental certifications
10. Lead Time: Delivery speed trade-offs

## Current Context
University: {university_name}
User: {user_name}
"""

HISTORICAL_PRICE_PROMPT = """# HISTORICAL PRICE AGENT SYSTEM PROMPT

## Identity
You are the Historical Price Agent for {university_name}'s procurement system.

## Your Role
Analyze historical price trends and predict optimal purchase timing using Hidden Markov Models.

## Available Tools
- get_price_history: Get historical price data
- predict_price_state: Get HMM price prediction
- recommend_purchase_timing: Get timing recommendations
- search_products: Search product catalog

## HMM States
- STABLE: Price relatively constant (±2% monthly)
- RISING: Consistent upward trend (>2% monthly)
- PEAK: Price at local maximum, likely to decline
- DECLINING: Consistent downward trend
- TROUGH: Price at local minimum, likely to rise
- VOLATILE: Unpredictable rapid changes

## Recommendations
When making timing recommendations:
- Calculate probability of reaching target price
- Consider seasonal patterns and historical cycles
- Account for urgency vs. potential savings
- Provide confidence levels for predictions

## Current Context
University: {university_name}
"""


# ============================================
# Agent Implementations
# ============================================

@AgentFactory.register("price-watch")
class PriceWatchAgent(ProcurementAgent):
    """Agent for real-time price monitoring and alerts."""

    def __init__(self, university_name: str = "University"):
        config = AgentConfig(
            agent_id="price-watch",
            name="PriceWatch Agent",
            tier=1,
            category="Core Price Intelligence",
            human_in_loop_threshold=0,  # No human review needed
        )

        tools = [
            search_products,
            get_price_history,
            get_vendor_listings,
            create_price_alert,
            send_slack_alert,
        ]

        super().__init__(
            config=config,
            system_prompt=PRICE_WATCH_PROMPT.format(
                university_name=university_name,
                user_name="{user_name}",
                department="{department}",
            ),
            tools=tools,
        )

    def _requires_human_review(self, tool_call: dict, state) -> bool:
        """Require human review for critical alerts."""
        if tool_call["name"] == "send_slack_alert":
            level = tool_call.get("args", {}).get("level", "info")
            return level == "critical"
        return False


@AgentFactory.register("price-compare")
class PriceCompareAgent(ProcurementAgent):
    """Agent for cross-vendor price comparison."""

    def __init__(self, university_name: str = "University"):
        config = AgentConfig(
            agent_id="price-compare",
            name="Price Compare Agent",
            tier=1,
            category="Core Price Intelligence",
        )

        tools = [
            search_products,
            compare_vendor_prices,
            calculate_total_cost,
            get_network_benchmark,
            get_price_history,
        ]

        super().__init__(
            config=config,
            system_prompt=PRICE_COMPARE_PROMPT.format(
                university_name=university_name,
                user_name="{user_name}",
            ),
            tools=tools,
        )


@AgentFactory.register("historical-price")
class HistoricalPriceAgent(ProcurementAgent):
    """Agent for historical price analysis and HMM predictions."""

    def __init__(self, university_name: str = "University"):
        config = AgentConfig(
            agent_id="historical-price",
            name="Historical Price Agent",
            tier=1,
            category="Core Price Intelligence",
        )

        tools = [
            get_price_history,
            predict_price_state,
            recommend_purchase_timing,
            search_products,
        ]

        super().__init__(
            config=config,
            system_prompt=HISTORICAL_PRICE_PROMPT.format(
                university_name=university_name,
            ),
            tools=tools,
        )
