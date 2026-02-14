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

import logging
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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

    pipeline_runner = RequisitionPipelineRunner(config.client_type.value)
    savings_analyzer = SavingsAnalyzer(config.client_type.value)
    agents = TalosAgents(config.client_type.value)
    chat_engine = ChatEngine(config.client_type.value)
    db = TalosDB(config.db_path)
    notifier = NotificationService()

    log.info(f"Talos API started | client={config.client_type.value} | db={config.db_path}")
    yield

    await pipeline_runner.close()
    await savings_analyzer.close()
    await agents.close()
    await chat_engine.close()
    await notifier.close()


app = FastAPI(
    title="Talos AI — Procurement Intelligence",
    description="The doanything.com for procurement. Talk naturally, Talos handles the rest.",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- Request/Response Models ----

class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    requester_name: str = ""
    department: str = ""

class RequisitionRequest(BaseModel):
    raw_text: str
    requester_name: str = ""
    department: str = ""
    channel: str = "portal"
    auto_generate_po: bool = False

class PriceCheckRequest(BaseModel):
    item_description: str
    current_price: float | None = None
    quantity: int = 1

class SavingsVerifyRequest(BaseModel):
    description: str
    baseline_price: float
    new_price: float
    volume: int
    category: str = ""
    evidence: list[str] = []

class OptimizationRequest(BaseModel):
    spend_data: str

class KnowledgeRequest(BaseModel):
    question: str


# =====================================================================
# CONVERSATIONAL ENDPOINTS (Decision #2: doanything-style UX)
# =====================================================================

@app.post("/chat")
async def chat(req: ChatRequest):
    """
    Talk to Talos naturally. The primary interface.

    Examples:
    - "I need 50 boxes of gloves for the chem lab"
    - "How much do mass spectrometers cost?"
    - "Can I buy equipment over $5K on my NSF grant?"
    - "Find me savings on lab supplies"
    """
    result = await chat_engine.message(
        text=req.message,
        session_id=req.session_id,
        requester=req.requester_name,
        department=req.department,
    )

    # Persist conversation
    session_id = result.get("session_id")
    if session_id and session_id in chat_engine.sessions:
        db.save_conversation(chat_engine.sessions[session_id])

    # Save pipeline if one was created
    pipeline_data = result.get("pipeline")
    if pipeline_data and "id" in pipeline_data:
        pipe = pipeline_runner.agents.router  # for cost tracking
        # Trigger notifications if needed
        pipeline_id = result.get("pipeline_id")
        if pipeline_id:
            pipeline = db.get_pipeline(pipeline_id)
            if pipeline and pipeline.compliance and not pipeline.compliance.is_compliant:
                await notifier.notify_compliance_block(pipeline)
            if pipeline and pipeline.compliance and pipeline.compliance.required_approvals:
                await notifier.notify_approval_needed(pipeline)
            if pipeline and pipeline.savings:
                await notifier.notify_savings_found(
                    pipeline_id, pipeline.savings.total_savings,
                    pipeline.pricing.recommended_vendor if pipeline.pricing else "Unknown",
                )

    return result

@app.get("/chat/sessions")
async def list_chat_sessions(limit: int = 20):
    """List active chat sessions."""
    return db.list_conversations(limit=limit)

@app.get("/chat/sessions/{session_id}")
async def get_chat_session(session_id: str):
    """Get a specific chat session with full history."""
    session = db.get_conversation(session_id)
    if not session:
        raise HTTPException(404, f"Session {session_id} not found")
    return session.model_dump()


# =====================================================================
# PIPELINE ENDPOINTS (Direct agent access for integrations)
# =====================================================================

@app.post("/requisitions")
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
        db.save_llm_calls(pipeline_runner.agents.router.history, result.id)

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


@app.get("/requisitions")
async def list_requisitions(limit: int = 50, status: str | None = None):
    """List all processed requisitions."""
    return db.list_pipelines(limit=limit, status=status)


@app.get("/requisitions/{pipeline_id}")
async def get_requisition(pipeline_id: str):
    """Get full details of a specific requisition pipeline."""
    result = db.get_pipeline(pipeline_id)
    if not result:
        raise HTTPException(404, f"Pipeline {pipeline_id} not found")
    return result.model_dump()


# =====================================================================
# PRICING & SAVINGS ENDPOINTS
# =====================================================================

@app.post("/prices/check")
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


@app.post("/savings/verify")
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


@app.post("/savings/optimize")
async def find_optimizations(req: OptimizationRequest):
    """Find savings opportunities in spend data."""
    result = await savings_analyzer.find_optimization(req.spend_data)
    return result.model_dump()


@app.get("/savings")
async def list_savings(period: str | None = None):
    """List all verified savings records."""
    return db.list_savings(period=period)


@app.get("/savings/summary")
async def savings_summary():
    """Get savings summary with Talos billing amount."""
    return db.savings_summary()


# =====================================================================
# KNOWLEDGE & VENDOR INTELLIGENCE
# =====================================================================

@app.post("/knowledge")
async def ask_knowledge(req: KnowledgeRequest):
    """Ask a procurement question — Knowledge Base Agent."""
    answer = await agents.knowledge_base(req.question)
    return {"question": req.question, "answer": answer}


@app.get("/vendors/{category}")
async def get_vendor_prices(category: str):
    """Get historical vendor pricing for a category from Talos memory."""
    return db.get_vendor_prices(category)


# =====================================================================
# DASHBOARD & OPERATIONAL ENDPOINTS
# =====================================================================

@app.get("/dashboard")
async def dashboard():
    """Overview dashboard: pipeline counts, savings, costs, ROI."""
    return db.dashboard()


@app.get("/costs")
async def costs():
    """LLM cost breakdown by agent."""
    return db.cost_summary()


@app.get("/health")
async def health():
    config = get_config()
    return {
        "status": "healthy",
        "version": "0.2.0",
        "client": config.client_type.value,
        "api_key_set": bool(config.openrouter_api_key),
        "slack_configured": bool(config.slack_webhook_url),
        "db": config.db_path,
        "timestamp": datetime.utcnow().isoformat(),
    }
