"""
Talos API — FastAPI server with conversational + pipeline endpoints.

Game-changing decision #6: SINGLE-STACK API
- One server, one language, one deploy
- Auto-generated Swagger docs at /docs
- Conversational chat endpoint (doanything-style)
- Full pipeline API for integrations
- WebSocket support for real-time chat (future)

Run:
    uvicorn talos.api.server:app --reload --port 8000
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ..config import get_config
from ..agents.pipeline import RequisitionPipelineRunner, SavingsAnalyzer
from ..agents.core import TalosAgents
from ..chat.engine import ChatEngine
from ..db import TalosDB
from ..notifications import NotificationService

log = logging.getLogger("talos.api")

# ---- Globals (initialized on startup) ----
pipeline_runner: RequisitionPipelineRunner | None = None
savings_analyzer: SavingsAnalyzer | None = None
agents: TalosAgents | None = None
chat_engine: ChatEngine | None = None
db: TalosDB | None = None
notifier: NotificationService | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipeline_runner, savings_analyzer, agents, chat_engine, db, notifier
    config = get_config()

    # Shared agents instance — single LLMRouter for unified cost tracking
    agents = TalosAgents(config.client_type.value)
    pipeline_runner = RequisitionPipelineRunner(config.client_type.value, agents=agents)
    savings_analyzer = SavingsAnalyzer(config.client_type.value, agents=agents)
    chat_engine = ChatEngine(
        config.client_type.value,
        agents=agents,
        pipeline_runner=pipeline_runner,
    )
    db = TalosDB(config.db_path)
    notifier = NotificationService()

    log.info(f"Talos API started | client={config.client_type.value} | db={config.db_path}")
    yield

    await agents.close()
    await notifier.close()
    db.close()


app = FastAPI(
    title="Talos AI — Procurement Intelligence",
    description="The doanything.com for procurement. Talk naturally, Talos handles the rest.",
    version="0.3.0",
    lifespan=lifespan,
)


# ---- CORS Middleware (configured per environment) ----
_config = get_config()
_cors_origins = _config.cors_origins if _config.cors_origins else ["http://localhost:3000", "http://localhost:8000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


# ---- Rate Limiting ----
_rate_limit_store: dict[str, list[float]] = defaultdict(list)


def _check_rate_limit(key: str, rpm: int) -> bool:
    """Returns True if rate limit exceeded."""
    now = time.time()
    window_start = now - 60
    hits = _rate_limit_store[key]
    # Prune old entries
    _rate_limit_store[key] = [t for t in hits if t > window_start]
    if len(_rate_limit_store[key]) >= rpm:
        return True
    _rate_limit_store[key].append(now)
    return False


# ---- Authentication Dependency ----
async def verify_api_key(request: Request):
    """Verify API key if authentication is configured."""
    config = get_config()
    if not config.api_keys:
        return  # No auth configured — open access

    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    else:
        token = request.query_params.get("api_key", "")

    if not token:
        raise HTTPException(status_code=401, detail="Missing API key. Provide via Authorization: Bearer <key> header.")

    # Constant-time comparison
    if not any(hmac.compare_digest(token, k) for k in config.api_keys):
        raise HTTPException(status_code=403, detail="Invalid API key.")

    # Rate limit per key
    if _check_rate_limit(token[:8], config.rate_limit_rpm):
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Try again in a minute.")


# ---- Global Exception Handler ----
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    log.error(f"Unhandled error on {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)[:200]},
    )


# ---- Request/Response Models ----

class ChatRequest(BaseModel):
    message: str = Field(..., max_length=5000)
    session_id: str | None = None
    requester_name: str = Field(default="", max_length=200)
    department: str = Field(default="", max_length=200)

class RequisitionRequest(BaseModel):
    raw_text: str = Field(..., max_length=10000)
    requester_name: str = Field(default="", max_length=200)
    department: str = Field(default="", max_length=200)
    channel: str = Field(default="portal", max_length=50)
    auto_generate_po: bool = False

class PriceCheckRequest(BaseModel):
    item_description: str = Field(..., max_length=2000)
    current_price: float | None = None
    quantity: int = Field(default=1, ge=1, le=1000000)

class SavingsVerifyRequest(BaseModel):
    description: str = Field(..., max_length=2000)
    baseline_price: float = Field(..., ge=0)
    new_price: float = Field(..., ge=0)
    volume: int = Field(..., ge=1)
    category: str = Field(default="", max_length=200)
    evidence: list[str] = []

class OptimizationRequest(BaseModel):
    spend_data: str = Field(..., max_length=20000)

class KnowledgeRequest(BaseModel):
    question: str = Field(..., max_length=2000)


# =====================================================================
# CONVERSATIONAL ENDPOINTS (Decision #2: doanything-style UX)
# =====================================================================

@app.post("/chat", dependencies=[Depends(verify_api_key)])
async def chat(req: ChatRequest):
    """
    Talk to Talos naturally. The primary interface.

    Examples:
    - "I need 50 boxes of gloves for the chem lab"
    - "How much do mass spectrometers cost?"
    - "Can I buy equipment over $5K on my NSF grant?"
    - "Find me savings on lab supplies"
    """
    # Try to restore session from DB if not in memory
    if req.session_id and req.session_id not in chat_engine.sessions:
        saved = db.get_conversation(req.session_id)
        if saved:
            chat_engine.load_session(saved)

    result = await chat_engine.message(
        text=req.message,
        session_id=req.session_id,
        requester=req.requester_name,
        department=req.department,
    )

    # Persist conversation to DB
    session_id = result.get("session_id")
    if session_id and session_id in chat_engine.sessions:
        db.save_conversation(chat_engine.sessions[session_id])

    # Save pipeline if one was created via chat
    pipeline_id = result.get("pipeline_id")
    pipeline_data = result.get("pipeline")
    if pipeline_data and pipeline_id:
        from ..schemas import RequisitionPipeline
        pipe = RequisitionPipeline.model_validate(pipeline_data)
        db.save_pipeline(pipe, get_config().client_type.value)

        # Drain LLM history and save
        calls = agents.router.drain_history()
        if calls:
            db.save_llm_calls(calls, pipeline_id)

        # Trigger notifications
        if pipe.compliance and not pipe.compliance.is_compliant:
            await notifier.notify_compliance_block(pipe)
        if pipe.compliance and pipe.compliance.required_approvals:
            await notifier.notify_approval_needed(pipe)
        if pipe.savings:
            await notifier.notify_savings_found(
                pipeline_id, pipe.savings.total_savings,
                pipe.pricing.recommended_vendor if pipe.pricing else "Unknown",
            )

    return result

@app.get("/chat/sessions", dependencies=[Depends(verify_api_key)])
async def list_chat_sessions(limit: int = 20, offset: int = 0):
    """List active chat sessions."""
    return db.list_conversations(limit=limit, offset=offset)

@app.get("/chat/sessions/{session_id}", dependencies=[Depends(verify_api_key)])
async def get_chat_session(session_id: str):
    """Get a specific chat session with full history."""
    session = db.get_conversation(session_id)
    if not session:
        raise HTTPException(404, f"Session {session_id} not found")
    return session.model_dump()


# =====================================================================
# PIPELINE ENDPOINTS (Direct agent access for integrations)
# =====================================================================

@app.post("/requisitions", dependencies=[Depends(verify_api_key)])
async def submit_requisition(req: RequisitionRequest):
    """Submit a procurement request. Runs full pipeline: parse -> comply -> aggregate -> price."""
    recent = db.find_similar_orders(req.raw_text[:50]) if db else None

    result = await pipeline_runner.process(
        raw_text=req.raw_text,
        requester_name=req.requester_name,
        department=req.department,
        channel=req.channel,
        recent_orders=recent,
        auto_generate_po=req.auto_generate_po,
    )

    if db:
        db.save_pipeline(result, get_config().client_type.value)
        # drain_history already called inside pipeline_runner.process(),
        # but we save any remaining calls
        calls = agents.router.drain_history()
        if calls:
            db.save_llm_calls(calls, result.id)

    # Notifications
    if result.compliance and not result.compliance.is_compliant:
        await notifier.notify_compliance_block(result)
    if result.compliance and result.compliance.required_approvals:
        await notifier.notify_approval_needed(result)
    if result.savings:
        await notifier.notify_savings_found(
            result.id, result.savings.total_savings,
            result.pricing.recommended_vendor if result.pricing else "Unknown",
        )

    return {
        "pipeline_id": result.id,
        "status": result.status,
        "parsed": result.parsed.model_dump() if result.parsed else None,
        "compliance": result.compliance.model_dump() if result.compliance else None,
        "aggregation": result.aggregation.model_dump() if result.aggregation else None,
        "pricing": result.pricing.model_dump() if result.pricing else None,
        "savings": result.savings.model_dump() if result.savings else None,
        "purchase_order": result.purchase_order.model_dump() if result.purchase_order else None,
        "llm_cost": result.total_llm_cost,
        "errors": result.errors,
    }


@app.get("/requisitions", dependencies=[Depends(verify_api_key)])
async def list_requisitions(limit: int = 50, offset: int = 0, status: str | None = None):
    """List all processed requisitions."""
    return db.list_pipelines(limit=limit, offset=offset, status=status)


@app.get("/requisitions/{pipeline_id}", dependencies=[Depends(verify_api_key)])
async def get_requisition(pipeline_id: str):
    """Get full details of a specific requisition pipeline."""
    result = db.get_pipeline(pipeline_id)
    if not result:
        raise HTTPException(404, f"Pipeline {pipeline_id} not found")
    return result.model_dump()


# =====================================================================
# PRICING & SAVINGS ENDPOINTS
# =====================================================================

@app.post("/prices/check", dependencies=[Depends(verify_api_key)])
async def check_prices(req: PriceCheckRequest):
    """Check pricing across all sources for an item."""
    result = await agents.price_tracker(
        item_description=req.item_description,
        current_price=req.current_price,
        quantity=req.quantity,
    )

    # Store in vendor memory
    if result.prices_found:
        for p in result.prices_found:
            if p.vendor_name and p.unit_price > 0:
                db.save_vendor_price(
                    vendor_name=p.vendor_name,
                    item_category=result.item_description,
                    price=p.unit_price,
                    contract_price=p.unit_price if p.contract_price else None,
                )

    return result.model_dump()


@app.post("/savings/verify", dependencies=[Depends(verify_api_key)])
async def verify_savings(req: SavingsVerifyRequest):
    """Verify a savings claim — the billing basis."""
    result = await savings_analyzer.verify_single(
        description=req.description,
        baseline_price=req.baseline_price,
        new_price=req.new_price,
        volume=req.volume,
        category=req.category,
        evidence=req.evidence,
    )
    if db:
        db.save_savings(result)
    return result.model_dump()


@app.post("/savings/optimize", dependencies=[Depends(verify_api_key)])
async def find_optimizations(req: OptimizationRequest):
    """Find savings opportunities in spend data."""
    result = await savings_analyzer.find_optimization(req.spend_data)
    return result.model_dump()


@app.get("/savings", dependencies=[Depends(verify_api_key)])
async def list_savings(period: str | None = None, limit: int = 50, offset: int = 0):
    """List all verified savings records."""
    return db.list_savings(period=period, limit=limit, offset=offset)


@app.get("/savings/summary", dependencies=[Depends(verify_api_key)])
async def savings_summary():
    """Get savings summary with Talos billing amount."""
    return db.savings_summary()


# =====================================================================
# KNOWLEDGE & VENDOR INTELLIGENCE
# =====================================================================

@app.post("/knowledge", dependencies=[Depends(verify_api_key)])
async def ask_knowledge(req: KnowledgeRequest):
    """Ask a procurement question — Knowledge Base Agent."""
    answer = await agents.knowledge_base(req.question)
    return {"question": req.question, "answer": answer}


@app.get("/vendors/{category}", dependencies=[Depends(verify_api_key)])
async def get_vendor_prices(category: str):
    """Get historical vendor pricing for a category from Talos memory."""
    return db.get_vendor_prices(category)


# =====================================================================
# SLACK WEBHOOK HANDLER (Decision #7: Actionable notifications)
# =====================================================================

@app.post("/webhooks/slack")
async def handle_slack_action(request: Request):
    """Handle Slack interactive message button clicks (approve/reject/view)."""
    import json as json_lib

    form_data = await request.form()
    payload_str = form_data.get("payload", "")
    if not payload_str:
        raise HTTPException(400, "Missing payload")

    try:
        payload = json_lib.loads(payload_str)
    except json_lib.JSONDecodeError:
        raise HTTPException(400, "Invalid payload JSON")

    actions = payload.get("actions", [])
    if not actions:
        return {"text": "No action received"}

    action_value = actions[0].get("value", "")
    user_name = payload.get("user", {}).get("name", "Unknown")

    if action_value.startswith("approve_"):
        pipeline_id = action_value[8:]
        pipe = db.get_pipeline(pipeline_id)
        if pipe:
            pipe.status = "approved"
            db.save_pipeline(pipe, get_config().client_type.value)
            log.info(f"Pipeline {pipeline_id} approved by {user_name}")
            return {"text": f"Approved by {user_name}. Pipeline {pipeline_id} is now approved."}
        return {"text": f"Pipeline {pipeline_id} not found."}

    elif action_value.startswith("reject_"):
        pipeline_id = action_value[7:]
        pipe = db.get_pipeline(pipeline_id)
        if pipe:
            pipe.status = "rejected"
            db.save_pipeline(pipe, get_config().client_type.value)
            log.info(f"Pipeline {pipeline_id} rejected by {user_name}")
            return {"text": f"Rejected by {user_name}. Pipeline {pipeline_id} has been rejected."}
        return {"text": f"Pipeline {pipeline_id} not found."}

    elif action_value.startswith("view_"):
        pipeline_id = action_value[5:]
        pipe = db.get_pipeline(pipeline_id)
        if pipe:
            return {
                "text": (
                    f"*Pipeline {pipeline_id}*\n"
                    f"Status: {pipe.status}\n"
                    f"Requester: {pipe.requester_name}\n"
                    f"Total: ${(pipe.parsed.estimated_total if pipe.parsed else 0):,.2f}"
                )
            }
        return {"text": f"Pipeline {pipeline_id} not found."}

    return {"text": "Unknown action"}


# =====================================================================
# TEMPORAL WORKFLOW ENDPOINTS (Optional — active when enable_temporal=True)
# =====================================================================

class WorkflowSignalRequest(BaseModel):
    pipeline_id: str = Field(..., max_length=100)

@app.post("/workflows/approve", dependencies=[Depends(verify_api_key)])
async def workflow_approve(req: WorkflowSignalRequest):
    """Send approval signal to a running Temporal workflow."""
    config = get_config()
    if not config.enable_temporal:
        raise HTTPException(400, "Temporal is not enabled. Set TALOS_ENABLE_TEMPORAL=true.")

    try:
        from temporalio.client import Client

        client = await Client.connect(config.temporal_address, namespace=config.temporal_namespace)
        handle = client.get_workflow_handle(f"talos-pipeline-{req.pipeline_id}")
        await handle.signal("approve")
        return {"status": "approved", "pipeline_id": req.pipeline_id}
    except Exception as e:
        log.error(f"Failed to signal approval for {req.pipeline_id}: {e}")
        raise HTTPException(500, f"Failed to signal workflow: {e}")


@app.post("/workflows/reject", dependencies=[Depends(verify_api_key)])
async def workflow_reject(req: WorkflowSignalRequest):
    """Send rejection signal to a running Temporal workflow."""
    config = get_config()
    if not config.enable_temporal:
        raise HTTPException(400, "Temporal is not enabled. Set TALOS_ENABLE_TEMPORAL=true.")

    try:
        from temporalio.client import Client

        client = await Client.connect(config.temporal_address, namespace=config.temporal_namespace)
        handle = client.get_workflow_handle(f"talos-pipeline-{req.pipeline_id}")
        await handle.signal("reject")
        return {"status": "rejected", "pipeline_id": req.pipeline_id}
    except Exception as e:
        log.error(f"Failed to signal rejection for {req.pipeline_id}: {e}")
        raise HTTPException(500, f"Failed to signal workflow: {e}")


@app.get("/workflows/{pipeline_id}/status", dependencies=[Depends(verify_api_key)])
async def workflow_status(pipeline_id: str):
    """Query the current status of a running Temporal workflow."""
    config = get_config()
    if not config.enable_temporal:
        raise HTTPException(400, "Temporal is not enabled. Set TALOS_ENABLE_TEMPORAL=true.")

    try:
        from temporalio.client import Client

        client = await Client.connect(config.temporal_address, namespace=config.temporal_namespace)
        handle = client.get_workflow_handle(f"talos-pipeline-{pipeline_id}")
        status = await handle.query("get_status")
        return status
    except Exception as e:
        log.error(f"Failed to query workflow status for {pipeline_id}: {e}")
        raise HTTPException(500, f"Failed to query workflow: {e}")


# =====================================================================
# DASHBOARD & OPERATIONAL ENDPOINTS
# =====================================================================

@app.get("/dashboard", dependencies=[Depends(verify_api_key)])
async def dashboard():
    """Overview dashboard: pipeline counts, savings, costs, ROI."""
    return db.dashboard()


@app.get("/costs", dependencies=[Depends(verify_api_key)])
async def costs():
    """LLM cost breakdown by agent."""
    return db.cost_summary()


@app.get("/health")
async def health():
    config = get_config()
    return {
        "status": "healthy",
        "version": "0.3.0",
        "client": config.client_type.value,
        "api_key_set": bool(config.openrouter_api_key),
        "auth_enabled": bool(config.api_keys),
        "slack_configured": bool(config.slack_webhook_url),
        "temporal_enabled": config.enable_temporal,
        "temporal_address": config.temporal_address if config.enable_temporal else None,
        "db": config.db_path,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
