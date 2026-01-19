"""
Convex Client Wrapper

Provides Python interface to Convex backend for procurement data operations.
"""

from typing import Optional, List, Any, Dict
import os
import httpx
from dataclasses import dataclass
from datetime import datetime
import structlog

logger = structlog.get_logger()


@dataclass
class ConvexConfig:
    """Convex connection configuration."""
    deployment_url: str
    admin_key: Optional[str] = None

    @classmethod
    def from_env(cls) -> "ConvexConfig":
        """Create config from environment variables."""
        return cls(
            deployment_url=os.getenv("CONVEX_URL", "https://your-deployment.convex.cloud"),
            admin_key=os.getenv("CONVEX_ADMIN_KEY"),
        )


class ConvexClient:
    """
    Async client for Convex backend operations.

    Provides methods for querying and mutating procurement data.
    """

    def __init__(self, config: Optional[ConvexConfig] = None):
        self.config = config or ConvexConfig.from_env()
        self._client = httpx.AsyncClient(
            base_url=self.config.deployment_url,
            headers=self._build_headers(),
            timeout=30.0,
        )

    def _build_headers(self) -> Dict[str, str]:
        """Build request headers."""
        headers = {
            "Content-Type": "application/json",
        }
        if self.config.admin_key:
            headers["Authorization"] = f"Convex {self.config.admin_key}"
        return headers

    async def query(self, function_name: str, args: Optional[Dict] = None) -> Any:
        """
        Execute a Convex query function.

        Args:
            function_name: Full function path (e.g., "products:search")
            args: Query arguments

        Returns:
            Query result
        """
        try:
            response = await self._client.post(
                "/api/query",
                json={
                    "path": function_name,
                    "args": args or {},
                },
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            logger.error("Convex query error", function=function_name, error=str(e))
            raise

    async def mutation(self, function_name: str, args: Optional[Dict] = None) -> Any:
        """
        Execute a Convex mutation function.

        Args:
            function_name: Full function path (e.g., "requisitions:create")
            args: Mutation arguments

        Returns:
            Mutation result
        """
        try:
            response = await self._client.post(
                "/api/mutation",
                json={
                    "path": function_name,
                    "args": args or {},
                },
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            logger.error("Convex mutation error", function=function_name, error=str(e))
            raise

    async def action(self, function_name: str, args: Optional[Dict] = None) -> Any:
        """
        Execute a Convex action function.

        Args:
            function_name: Full function path (e.g., "aiAgents:executeAgent")
            args: Action arguments

        Returns:
            Action result
        """
        try:
            response = await self._client.post(
                "/api/action",
                json={
                    "path": function_name,
                    "args": args or {},
                },
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            logger.error("Convex action error", function=function_name, error=str(e))
            raise

    # ============================================
    # Product Operations
    # ============================================

    async def search_products(
        self,
        query: str,
        category: Optional[str] = None,
        limit: int = 20,
    ) -> List[Dict]:
        """Search products in the catalog."""
        return await self.query(
            "products:search",
            {
                "query": query,
                "category": category,
                "limit": limit,
            },
        )

    async def get_product(self, product_id: str) -> Optional[Dict]:
        """Get a product by ID."""
        return await self.query("products:getById", {"productId": product_id})

    async def get_product_equivalents(self, product_id: str) -> List[Dict]:
        """Get equivalent products."""
        return await self.query("products:getEquivalents", {"productId": product_id})

    # ============================================
    # Vendor Operations
    # ============================================

    async def get_vendor_listings(self, product_id: str) -> List[Dict]:
        """Get all vendor listings for a product."""
        return await self.query("vendors:getListingsByProduct", {"productId": product_id})

    async def get_vendor(self, vendor_id: str) -> Optional[Dict]:
        """Get vendor by ID."""
        return await self.query("vendors:getById", {"vendorId": vendor_id})

    async def get_vendor_performance(self, vendor_id: str) -> Dict:
        """Get vendor performance metrics."""
        return await self.query("vendors:getPerformance", {"vendorId": vendor_id})

    async def find_diverse_vendors(
        self,
        category: str,
        diversity_type: Optional[str] = None,
    ) -> List[Dict]:
        """Find diverse vendors for a category."""
        return await self.query(
            "vendors:findDiverse",
            {
                "category": category,
                "diversityType": diversity_type,
            },
        )

    # ============================================
    # Price Operations
    # ============================================

    async def get_price_history(
        self,
        product_id: str,
        vendor_id: Optional[str] = None,
        days: int = 365,
    ) -> List[Dict]:
        """Get historical prices for a product."""
        return await self.query(
            "priceIntelligence:getHistory",
            {
                "productId": product_id,
                "vendorId": vendor_id,
                "days": days,
            },
        )

    async def get_price_state(self, product_id: str) -> Dict:
        """Get current HMM price state."""
        return await self.query("priceIntelligence:getState", {"productId": product_id})

    async def create_price_alert(
        self,
        product_id: str,
        alert_type: str,
        threshold: float,
        notify_user_id: str,
    ) -> str:
        """Create a price alert."""
        return await self.mutation(
            "priceIntelligence:createAlert",
            {
                "productId": product_id,
                "alertType": alert_type,
                "thresholdPercent": threshold,
                "notifyUserId": notify_user_id,
            },
        )

    async def get_network_benchmark(self, product_id: str) -> Dict:
        """Get cross-university price benchmark."""
        return await self.query(
            "priceIntelligence:getNetworkBenchmark",
            {"productId": product_id},
        )

    # ============================================
    # Requisition Operations
    # ============================================

    async def create_requisition(
        self,
        requester_id: str,
        department: str,
        budget_code: str,
        line_items: List[Dict],
        urgency: str = "standard",
        needed_by: Optional[str] = None,
    ) -> str:
        """Create a new requisition."""
        return await self.mutation(
            "requisitions:create",
            {
                "requesterId": requester_id,
                "department": department,
                "budgetCode": budget_code,
                "lineItems": line_items,
                "urgency": urgency,
                "neededBy": needed_by,
            },
        )

    async def get_requisition(self, requisition_id: str) -> Optional[Dict]:
        """Get requisition by ID."""
        return await self.query("requisitions:getById", {"requisitionId": requisition_id})

    async def get_requisitions_by_status(
        self,
        status: str,
        limit: int = 50,
    ) -> List[Dict]:
        """Get requisitions by status."""
        return await self.query(
            "requisitions:getByStatus",
            {"status": status, "limit": limit},
        )

    async def update_requisition_status(
        self,
        requisition_id: str,
        status: str,
    ) -> bool:
        """Update requisition status."""
        return await self.mutation(
            "requisitions:updateStatus",
            {"requisitionId": requisition_id, "status": status},
        )

    # ============================================
    # Approval Operations
    # ============================================

    async def get_pending_approvals(self, approver_id: str) -> List[Dict]:
        """Get pending approvals for an approver."""
        return await self.query(
            "requisitions:getPendingApprovals",
            {"approverId": approver_id},
        )

    async def process_approval(
        self,
        requisition_id: str,
        approver_id: str,
        decision: str,
        comments: Optional[str] = None,
    ) -> bool:
        """Process an approval decision."""
        return await self.mutation(
            "requisitions:processApproval",
            {
                "requisitionId": requisition_id,
                "approverId": approver_id,
                "decision": decision,
                "comments": comments,
            },
        )

    # ============================================
    # Budget Operations
    # ============================================

    async def check_budget(self, budget_code: str, amount: float) -> Dict:
        """Check budget availability."""
        return await self.query(
            "requisitions:checkBudget",
            {"budgetCode": budget_code, "amount": amount},
        )

    # ============================================
    # Contract Operations
    # ============================================

    async def get_contract_price(
        self,
        product_id: str,
        vendor_id: str,
        university_id: str,
    ) -> Optional[Dict]:
        """Get contract price for a product."""
        return await self.query(
            "priceIntelligence:getContractPrice",
            {
                "productId": product_id,
                "vendorId": vendor_id,
                "universityId": university_id,
            },
        )

    async def get_expiring_contracts(
        self,
        university_id: str,
        days_ahead: int = 90,
    ) -> List[Dict]:
        """Get contracts expiring within specified days."""
        return await self.query(
            "agents:getExpiringContracts",
            {"universityId": university_id, "daysAhead": days_ahead},
        )

    # ============================================
    # Agent Operations
    # ============================================

    async def execute_agent(
        self,
        agent_id: str,
        input_data: Dict,
        university_id: str,
        user_id: str,
    ) -> Dict:
        """Execute a Convex AI agent."""
        return await self.action(
            "aiAgents:executeAgent",
            {
                "agentId": agent_id,
                "input": input_data,
                "universityId": university_id,
                "userId": user_id,
            },
        )

    async def get_agent_execution(self, execution_id: str) -> Optional[Dict]:
        """Get agent execution status."""
        return await self.query(
            "agents:getExecution",
            {"executionId": execution_id},
        )

    # ============================================
    # Analytics Operations
    # ============================================

    async def get_spend_summary(
        self,
        university_id: str,
        period: str = "month",
    ) -> Dict:
        """Get spend analytics summary."""
        return await self.query(
            "priceIntelligence:getSpendSummary",
            {"universityId": university_id, "period": period},
        )

    async def get_savings_report(
        self,
        university_id: str,
        period: str = "month",
    ) -> Dict:
        """Get savings report."""
        return await self.query(
            "priceIntelligence:getSavingsReport",
            {"universityId": university_id, "period": period},
        )

    # ============================================
    # Cleanup
    # ============================================

    async def close(self):
        """Close the HTTP client."""
        await self._client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()


# Singleton instance
_client: Optional[ConvexClient] = None


def get_convex_client() -> ConvexClient:
    """Get or create the global Convex client."""
    global _client
    if _client is None:
        _client = ConvexClient()
    return _client
