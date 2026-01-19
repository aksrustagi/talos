"""
FastAPI Application for University Procurement AI Platform

Provides REST API endpoints for interacting with AI agents,
managing procurement workflows, and integrating with Jaggaer.
"""

from contextlib import asynccontextmanager
from typing import Optional, List, Any
from datetime import datetime

from fastapi import FastAPI, HTTPException, Depends, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import structlog

from agents import (
    AgentOrchestrator,
    PriceWatchAgent,
    PriceCompareAgent,
    HistoricalPriceAgent,
    RequisitionAgent,
    ApprovalWorkflowAgent,
    VendorSelectionAgent,
)

# Configure structured logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ]
)
logger = structlog.get_logger()


# ============================================
# Request/Response Models
# ============================================

class ChatMessage(BaseModel):
    """Chat message input."""
    content: str = Field(..., description="User message content")
    agent_id: Optional[str] = Field(None, description="Specific agent to use")
    context: Optional[dict] = Field(default_factory=dict, description="Additional context")


class ChatResponse(BaseModel):
    """Chat response output."""
    response: str
    agent_id: str
    tool_calls: Optional[List[dict]] = None
    actions_taken: Optional[List[dict]] = None
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class RequisitionRequest(BaseModel):
    """Requisition creation request."""
    items: List[dict] = Field(..., description="Line items to order")
    budget_code: str = Field(..., description="Budget/cost center code")
    urgency: str = Field("standard", description="Urgency: standard, rush, emergency")
    needed_by: Optional[str] = Field(None, description="Date needed by (ISO format)")
    notes: Optional[str] = Field(None, description="Additional notes")


class PriceCompareRequest(BaseModel):
    """Price comparison request."""
    product_id: str = Field(..., description="Product ID to compare")
    quantity: int = Field(1, description="Quantity for pricing")
    include_network: bool = Field(True, description="Include cross-university prices")


class ApprovalAction(BaseModel):
    """Approval action request."""
    approval_id: str = Field(..., description="ID of the approval")
    decision: str = Field(..., description="approve, reject, or delegate")
    comments: Optional[str] = Field(None, description="Optional comments")
    delegate_to: Optional[str] = Field(None, description="User ID to delegate to")


class WebhookPayload(BaseModel):
    """Generic webhook payload."""
    event_type: str
    data: dict
    timestamp: Optional[str] = None


# ============================================
# Dependencies
# ============================================

class UserContext:
    """User context extracted from request."""
    def __init__(
        self,
        user_id: str,
        university_id: str,
        email: str,
        department: str,
        role: str,
    ):
        self.user_id = user_id
        self.university_id = university_id
        self.email = email
        self.department = department
        self.role = role


async def get_current_user(request: Request) -> UserContext:
    """Extract current user from request headers/token."""
    # In production, this would validate JWT/session
    # For now, use headers or defaults
    return UserContext(
        user_id=request.headers.get("X-User-ID", "user_001"),
        university_id=request.headers.get("X-University-ID", "university_001"),
        email=request.headers.get("X-User-Email", "user@university.edu"),
        department=request.headers.get("X-Department", "Procurement"),
        role=request.headers.get("X-Role", "requester"),
    )


# ============================================
# Application Setup
# ============================================

# Initialize agents
agents = {
    "price-watch": PriceWatchAgent(),
    "price-compare": PriceCompareAgent(),
    "historical-price": HistoricalPriceAgent(),
    "requisition": RequisitionAgent(),
    "approval-workflow": ApprovalWorkflowAgent(),
    "vendor-selection": VendorSelectionAgent(),
}

orchestrator = AgentOrchestrator(agents)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    logger.info("Starting Talos Procurement AI Platform")
    yield
    logger.info("Shutting down Talos Procurement AI Platform")


app = FastAPI(
    title="Talos Procurement AI Platform",
    description="Comprehensive University Procurement AI Platform with 30 specialized agents",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================
# Chat Endpoints
# ============================================

@app.post("/api/chat", response_model=ChatResponse, tags=["Chat"])
async def chat(
    message: ChatMessage,
    user: UserContext = Depends(get_current_user),
):
    """
    Main chat endpoint - routes to appropriate agent.

    If agent_id is specified, uses that agent directly.
    Otherwise, automatically routes based on message content.
    """
    try:
        # Determine agent
        if message.agent_id:
            agent_id = message.agent_id
        else:
            agent_id = await orchestrator.route_message(message.content)

        # Build context
        context = {
            "user_name": user.email.split("@")[0],
            "department": user.department,
            "budget_code": message.context.get("budget_code", ""),
            "university_name": "University",  # Would come from config
            **message.context,
        }

        # Execute agent
        result = await orchestrator.execute(
            agent_id=agent_id,
            message=message.content,
            user_id=user.user_id,
            university_id=user.university_id,
            context=context,
        )

        return ChatResponse(
            response=result["response"],
            agent_id=agent_id,
            tool_calls=result.get("tool_calls"),
            actions_taken=result.get("actions"),
        )

    except Exception as e:
        logger.error("Chat error", error=str(e), user_id=user.user_id)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chat/chain", tags=["Chat"])
async def chat_chain(
    message: ChatMessage,
    agent_ids: List[str],
    user: UserContext = Depends(get_current_user),
):
    """
    Execute a chain of agents sequentially.

    Each agent's output becomes input to the next agent.
    """
    try:
        context = {
            "user_name": user.email.split("@")[0],
            "department": user.department,
            **message.context,
        }

        results = await orchestrator.execute_chain(
            agent_ids=agent_ids,
            message=message.content,
            user_id=user.user_id,
            university_id=user.university_id,
            context=context,
        )

        return {
            "results": results,
            "agent_chain": agent_ids,
        }

    except Exception as e:
        logger.error("Chat chain error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Requisition Endpoints
# ============================================

@app.post("/api/requisitions", tags=["Requisitions"])
async def create_requisition(
    req: RequisitionRequest,
    user: UserContext = Depends(get_current_user),
):
    """Create a new requisition using the Requisition Agent."""
    try:
        # Format request for agent
        message = f"""Create a requisition with the following details:
- Items: {req.items}
- Budget Code: {req.budget_code}
- Urgency: {req.urgency}
- Needed By: {req.needed_by or 'Not specified'}
- Notes: {req.notes or 'None'}
"""
        context = {
            "user_name": user.email.split("@")[0],
            "department": user.department,
            "budget_code": req.budget_code,
        }

        result = await orchestrator.execute(
            agent_id="requisition",
            message=message,
            user_id=user.user_id,
            university_id=user.university_id,
            context=context,
        )

        return {
            "status": "created",
            "agent_response": result["response"],
            "actions": result.get("actions", []),
        }

    except Exception as e:
        logger.error("Requisition creation error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/requisitions/{requisition_id}", tags=["Requisitions"])
async def get_requisition(
    requisition_id: str,
    user: UserContext = Depends(get_current_user),
):
    """Get requisition details."""
    # Implementation would query Convex
    return {
        "requisition_id": requisition_id,
        "status": "pending_approval",
    }


# ============================================
# Price Intelligence Endpoints
# ============================================

@app.get("/api/prices/compare/{product_id}", tags=["Prices"])
async def compare_prices(
    product_id: str,
    quantity: int = 1,
    user: UserContext = Depends(get_current_user),
):
    """Compare prices across vendors for a product."""
    try:
        result = await orchestrator.execute(
            agent_id="price-compare",
            message=f"Compare prices for product {product_id}, quantity {quantity}",
            user_id=user.user_id,
            university_id=user.university_id,
        )

        return {
            "product_id": product_id,
            "quantity": quantity,
            "comparison": result["response"],
            "tool_results": result.get("tool_results", []),
        }

    except Exception as e:
        logger.error("Price comparison error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/prices/history/{product_id}", tags=["Prices"])
async def get_price_history(
    product_id: str,
    days: int = 365,
    user: UserContext = Depends(get_current_user),
):
    """Get historical price data and predictions."""
    try:
        result = await orchestrator.execute(
            agent_id="historical-price",
            message=f"Analyze price history for product {product_id} over {days} days and predict optimal purchase timing",
            user_id=user.user_id,
            university_id=user.university_id,
        )

        return {
            "product_id": product_id,
            "days": days,
            "analysis": result["response"],
        }

    except Exception as e:
        logger.error("Price history error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/prices/alerts", tags=["Prices"])
async def create_price_alert(
    product_id: str,
    alert_type: str,
    threshold: float,
    user: UserContext = Depends(get_current_user),
):
    """Create a price alert for a product."""
    try:
        result = await orchestrator.execute(
            agent_id="price-watch",
            message=f"Create a {alert_type} alert for product {product_id} with threshold {threshold}%",
            user_id=user.user_id,
            university_id=user.university_id,
        )

        return {
            "status": "created",
            "product_id": product_id,
            "alert_type": alert_type,
            "threshold": threshold,
            "agent_response": result["response"],
        }

    except Exception as e:
        logger.error("Price alert creation error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Approval Endpoints
# ============================================

@app.get("/api/approvals/pending", tags=["Approvals"])
async def get_pending_approvals(
    user: UserContext = Depends(get_current_user),
):
    """Get pending approvals for current user."""
    try:
        result = await orchestrator.execute(
            agent_id="approval-workflow",
            message=f"Get all pending approvals for approver {user.user_id}",
            user_id=user.user_id,
            university_id=user.university_id,
        )

        return {
            "approver_id": user.user_id,
            "pending": result["response"],
        }

    except Exception as e:
        logger.error("Pending approvals error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/approvals/action", tags=["Approvals"])
async def process_approval(
    action: ApprovalAction,
    user: UserContext = Depends(get_current_user),
):
    """Process an approval decision."""
    try:
        message = f"Process approval {action.approval_id}: {action.decision}"
        if action.comments:
            message += f" with comments: {action.comments}"
        if action.delegate_to:
            message += f" delegate to {action.delegate_to}"

        result = await orchestrator.execute(
            agent_id="approval-workflow",
            message=message,
            user_id=user.user_id,
            university_id=user.university_id,
        )

        return {
            "status": "processed",
            "approval_id": action.approval_id,
            "decision": action.decision,
            "agent_response": result["response"],
        }

    except Exception as e:
        logger.error("Approval processing error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Vendor Endpoints
# ============================================

@app.get("/api/vendors/{vendor_id}/score", tags=["Vendors"])
async def get_vendor_score(
    vendor_id: str,
    user: UserContext = Depends(get_current_user),
):
    """Get vendor scorecard and performance metrics."""
    try:
        result = await orchestrator.execute(
            agent_id="vendor-selection",
            message=f"Get comprehensive scorecard for vendor {vendor_id}",
            user_id=user.user_id,
            university_id=user.university_id,
        )

        return {
            "vendor_id": vendor_id,
            "scorecard": result["response"],
        }

    except Exception as e:
        logger.error("Vendor score error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/vendors/diverse", tags=["Vendors"])
async def find_diverse_vendors(
    category: str,
    diversity_type: Optional[str] = None,
    user: UserContext = Depends(get_current_user),
):
    """Find diverse suppliers for a category."""
    try:
        message = f"Find diverse suppliers for category {category}"
        if diversity_type:
            message += f" with certification {diversity_type}"

        result = await orchestrator.execute(
            agent_id="vendor-selection",
            message=message,
            user_id=user.user_id,
            university_id=user.university_id,
            context={"diversity_goal": "15"},
        )

        return {
            "category": category,
            "diversity_type": diversity_type,
            "suppliers": result["response"],
        }

    except Exception as e:
        logger.error("Diverse vendor search error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Analytics Endpoints
# ============================================

@app.get("/api/analytics/spend", tags=["Analytics"])
async def get_spend_analytics(
    period: str = "month",
    user: UserContext = Depends(get_current_user),
):
    """Get spend analytics summary."""
    # Implementation would query Convex and use spend analytics agent
    return {
        "period": period,
        "university_id": user.university_id,
        "total_spend": 0,
        "by_category": {},
        "by_vendor": {},
    }


@app.get("/api/analytics/savings", tags=["Analytics"])
async def get_savings_report(
    period: str = "month",
    user: UserContext = Depends(get_current_user),
):
    """Get savings and ROI report."""
    return {
        "period": period,
        "total_savings": 0,
        "by_source": {},
        "roi": 0,
    }


# ============================================
# Webhook Endpoints
# ============================================

@app.post("/api/webhooks/jaggaer", tags=["Webhooks"])
async def jaggaer_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
):
    """Handle incoming Jaggaer webhooks (invoices, status updates)."""
    body = await request.body()
    content_type = request.headers.get("content-type", "")

    try:
        if "xml" in content_type:
            # Process cXML message
            body_str = body.decode()
            if "InvoiceDetailRequest" in body_str:
                # Queue invoice processing
                background_tasks.add_task(process_invoice_webhook, body_str)
                return {"status": "received", "type": "invoice"}
            elif "ConfirmationRequest" in body_str:
                return {"status": "received", "type": "confirmation"}

        return {"status": "received", "type": "unknown"}

    except Exception as e:
        logger.error("Webhook processing error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


async def process_invoice_webhook(cxml_body: str):
    """Background task to process invoice webhook."""
    # Implementation would parse cXML and trigger workflow
    logger.info("Processing invoice webhook")


@app.post("/api/webhooks/catalog", tags=["Webhooks"])
async def catalog_webhook(
    payload: WebhookPayload,
    background_tasks: BackgroundTasks,
):
    """Handle vendor catalog update webhooks."""
    if payload.event_type == "catalog_updated":
        # Queue catalog sync
        background_tasks.add_task(
            sync_catalog,
            payload.data.get("vendor_id"),
        )

    return {"status": "received", "event_type": payload.event_type}


async def sync_catalog(vendor_id: str):
    """Background task to sync vendor catalog."""
    logger.info("Syncing catalog", vendor_id=vendor_id)


# ============================================
# Health & Status Endpoints
# ============================================

@app.get("/api/health", tags=["System"])
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/api/agents", tags=["System"])
async def list_agents():
    """List all available agents."""
    return {
        "agents": orchestrator.get_agent_status(),
        "count": len(agents),
    }


@app.get("/api/agents/{agent_id}", tags=["System"])
async def get_agent_info(agent_id: str):
    """Get information about a specific agent."""
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    agent = agents[agent_id]
    return {
        "agent_id": agent_id,
        "name": agent.config.name,
        "tier": agent.config.tier,
        "category": agent.config.category,
        "tools": [t.name for t in agent.tools] if agent.tools else [],
    }


# ============================================
# Main Entry Point
# ============================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
