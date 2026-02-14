"""
Talos AI — LLM Activities

All agent LLM calls wrapped as Temporal activities.
These are the bridge between Temporal workflows and agent logic.
"""

import logging

from temporalio import activity

from llm.router import LLMRouter, LLMConfig, LLMProvider

logger = logging.getLogger(__name__)


def _get_router() -> LLMRouter:
    """Get or create a shared LLM router instance."""
    import os

    config = LLMConfig(
        provider=LLMProvider(os.getenv("LLM_PROVIDER", "openrouter")),
        openrouter_api_key=os.getenv("OPENROUTER_API_KEY", ""),
        aws_region=os.getenv("AWS_REGION", "us-east-1"),
    )
    return LLMRouter(config)


# ============================================
# Agent 1: Intake Parser
# ============================================

@activity.defn(name="parse_requisition")
async def parse_requisition(raw_input: dict) -> dict:
    """Parse raw procurement request into structured requisition (Agent 1)."""
    from agents.intake import parse_requisition as _parse

    router = _get_router()
    client_mode = raw_input.get("client_mode", "university")
    result = await _parse(router, raw_input, client_mode=client_mode)
    return result if isinstance(result, dict) else result.model_dump()


# ============================================
# Agent 2: Policy Compliance
# ============================================

@activity.defn(name="check_compliance")
async def check_compliance(parsed_req: dict) -> dict:
    """Check requisition against policies and regulations (Agent 2)."""
    from agents.compliance import check_compliance as _check

    router = _get_router()
    client_mode = parsed_req.get("client_mode", "university")
    result = await _check(router, parsed_req, client_mode=client_mode)
    return result if isinstance(result, dict) else result.model_dump()


# ============================================
# Agent 3: Demand Aggregation
# ============================================

@activity.defn(name="check_aggregation")
async def check_aggregation(parsed_req: dict) -> dict:
    """Check for demand aggregation opportunities (Agent 3)."""
    from agents.aggregation import check_aggregation as _check

    router = _get_router()
    client_mode = parsed_req.get("client_mode", "university")
    result = await _check(router, parsed_req, client_mode=client_mode)
    return result if isinstance(result, dict) else result.model_dump()


# ============================================
# Agent 4: Market Intelligence
# ============================================

@activity.defn(name="gather_market_intelligence")
async def gather_market_intelligence(request: dict) -> dict:
    """Gather market intelligence and pricing benchmarks (Agent 4)."""
    from agents.market_intel import gather_market_intelligence as _gather

    router = _get_router()
    client_mode = request.get("client_mode", "university")
    return await _gather(router, request, client_mode=client_mode)


# ============================================
# Agent 5: Sourcing
# ============================================

@activity.defn(name="generate_rfp")
async def generate_rfp(request: dict) -> dict:
    """Generate an RFP document from sourcing request (Agent 5)."""
    from agents.sourcing import generate_rfp as _generate

    router = _get_router()
    client_mode = request.get("client_mode", "university")
    return await _generate(router, request, client_mode=client_mode)


@activity.defn(name="evaluate_vendor_responses")
async def evaluate_vendor_responses(evaluation_data: dict) -> dict:
    """Score and rank vendor RFP responses (Agent 5)."""
    from agents.sourcing import evaluate_vendor_responses as _evaluate

    router = _get_router()
    client_mode = evaluation_data.get("client_mode", "university")
    return await _evaluate(router, evaluation_data, client_mode=client_mode)


# ============================================
# Agent 6: Negotiation
# ============================================

@activity.defn(name="run_negotiation")
async def run_negotiation(negotiation_data: dict) -> dict:
    """Conduct vendor negotiation (Agent 6 — genius tier)."""
    from agents.negotiation import run_negotiation as _negotiate

    router = _get_router()
    client_mode = negotiation_data.get("client_mode", "university")
    result = await _negotiate(router, negotiation_data, client_mode=client_mode)
    return result if isinstance(result, dict) else result.model_dump()


# ============================================
# Agent 7: Vendor Onboarding
# ============================================

@activity.defn(name="onboard_vendor")
async def onboard_vendor(vendor_data: dict) -> dict:
    """Onboard a new vendor (Agent 7)."""
    from agents.vendor_onboarding import onboard_vendor as _onboard

    router = _get_router()
    client_mode = vendor_data.get("client_mode", "university")
    return await _onboard(router, vendor_data, client_mode=client_mode)


# ============================================
# Agent 9: Approval Workflow
# ============================================

@activity.defn(name="send_approval_request")
async def send_approval_request(request: dict) -> dict:
    """Route approval request to correct approver (Agent 9)."""
    from agents.approval import route_approval as _route

    router = _get_router()
    return await _route(router, request)


@activity.defn(name="escalate_approval")
async def escalate_approval_activity(request: dict) -> dict:
    """Escalate overdue approval request (Agent 9)."""
    from agents.approval import route_approval as _route

    router = _get_router()
    request["action"] = "escalate"
    return await _route(router, request)


# ============================================
# Agent 10: Purchase Order
# ============================================

@activity.defn(name="generate_purchase_order")
async def generate_purchase_order_activity(po_data: dict) -> dict:
    """Generate a purchase order from approved requisition (Agent 10)."""
    from agents.purchase_order import generate_purchase_order as _generate

    router = _get_router()
    return await _generate(router, po_data)


@activity.defn(name="dispatch_po_to_vendor")
async def dispatch_po_to_vendor(po: dict) -> dict:
    """Send PO to vendor via email/EDI/portal (Agent 10)."""
    from agents.purchase_order import generate_purchase_order as _dispatch

    router = _get_router()
    po["action"] = "dispatch"
    return await _dispatch(router, po)


# ============================================
# Agent 11: Order Confirmation
# ============================================

@activity.defn(name="chase_vendor_confirmation")
async def chase_vendor_confirmation(chase_data: dict) -> dict:
    """Chase vendor for PO acknowledgment (Agent 11)."""
    from agents.order_confirmation import chase_vendor_confirmation as _chase

    router = _get_router()
    return await _chase(router, chase_data)


# ============================================
# Agent 12: Invoice Matching
# ============================================

@activity.defn(name="three_way_match")
async def three_way_match(match_data: dict) -> dict:
    """Perform 3-way match on invoice (Agent 12)."""
    from agents.invoice_matching import three_way_match as _match

    router = _get_router()
    client_mode = match_data.get("client_mode", "university")
    result = await _match(router, match_data, client_mode=client_mode)
    return result if isinstance(result, dict) else result.model_dump()


# ============================================
# Agent 13: Payment Optimization
# ============================================

@activity.defn(name="optimize_payment")
async def optimize_payment(payment_data: dict) -> dict:
    """Optimize payment timing and discounts (Agent 13)."""
    from agents.payment_optimization import optimize_payment as _optimize

    router = _get_router()
    return await _optimize(router, payment_data)


# ============================================
# Agent 14: Goods Receipt
# ============================================

@activity.defn(name="verify_goods_receipt")
async def verify_goods_receipt(receipt_data: dict) -> dict:
    """Process and verify goods receipt (Agent 14)."""
    from agents.goods_receipt import process_receipt as _process

    router = _get_router()
    return await _process(router, receipt_data)


# ============================================
# Agent 15: Budget Guardian
# ============================================

@activity.defn(name="check_budget")
async def check_budget(budget_data: dict) -> dict:
    """Check budget availability and forecast (Agent 15)."""
    from agents.budget_guardian import check_budget as _check

    router = _get_router()
    return await _check(router, budget_data)


# ============================================
# Agent 16: Spend Analytics
# ============================================

@activity.defn(name="analyze_spend")
async def analyze_spend(analytics_data: dict) -> dict:
    """Analyze spend patterns and generate insights (Agent 16)."""
    from agents.spend_analytics import analyze_spend as _analyze

    router = _get_router()
    return await _analyze(router, analytics_data)


# ============================================
# Agent 17: Savings Verification
# ============================================

@activity.defn(name="verify_savings_claim")
async def verify_savings_claim(claim: dict) -> dict:
    """Verify a savings claim for billing (Agent 17 — genius tier)."""
    from agents.savings_verification import verify_savings as _verify

    router = _get_router()
    result = await _verify(router, claim)
    return result if isinstance(result, dict) else result.model_dump()


@activity.defn(name="collect_savings_events")
async def collect_savings_events(period: dict) -> list:
    """Collect raw savings events for a billing period."""
    # This would query the database for savings events in the period
    logger.info(f"Collecting savings events for period: {period}")
    return []


@activity.defn(name="generate_savings_report")
async def generate_savings_report(report_data: dict) -> dict:
    """Generate monthly savings report for client."""
    from agents.savings_verification import verify_savings as _verify

    router = _get_router()
    return await _verify(router, {
        "action": "generate_report",
        **report_data,
    })


@activity.defn(name="send_savings_report_to_client")
async def send_savings_report_to_client(report: dict) -> dict:
    """Send savings report and invoice to client."""
    logger.info(
        f"Sending savings report to client. "
        f"Talos invoice: ${report.get('talos_invoice_amount', 0):,.2f}"
    )
    return {"sent": True}


# ============================================
# Agent 18: Risk & Compliance
# ============================================

@activity.defn(name="monitor_risk")
async def monitor_risk(risk_data: dict) -> dict:
    """Monitor vendor and supply chain risk (Agent 18)."""
    from agents.risk_compliance import monitor_risk as _monitor

    router = _get_router()
    return await _monitor(router, risk_data)


# ============================================
# Agent 19: Category Strategy
# ============================================

@activity.defn(name="develop_category_strategy")
async def develop_category_strategy(strategy_data: dict) -> dict:
    """Develop or update a procurement category strategy (Agent 19)."""
    from agents.category_strategy import develop_strategy as _develop

    router = _get_router()
    client_mode = strategy_data.get("client_mode", "university")
    return await _develop(router, strategy_data, client_mode=client_mode)


# ============================================
# Agent 20: Supplier Performance
# ============================================

@activity.defn(name="score_supplier")
async def score_supplier(supplier_data: dict) -> dict:
    """Score and evaluate supplier performance (Agent 20)."""
    from agents.supplier_performance import score_supplier as _score

    router = _get_router()
    client_mode = supplier_data.get("client_mode", "university")
    return await _score(router, supplier_data, client_mode=client_mode)


# ============================================
# Agent 21: Knowledge Base
# ============================================

@activity.defn(name="answer_procurement_question")
async def answer_procurement_question(question_data: dict) -> dict:
    """Answer a procurement-related question from the knowledge base (Agent 21)."""
    from agents.knowledge_base import answer_question as _answer

    router = _get_router()
    client_mode = question_data.get("client_mode", "university")
    return await _answer(router, question_data, client_mode=client_mode)


# ============================================
# Agent 22: Proactive Optimization
# ============================================

@activity.defn(name="scan_price_variances")
async def scan_price_variances(config: dict) -> dict:
    """Scan for price variance opportunities (Agent 22)."""
    from agents.proactive_optimization import discover_savings as _discover

    router = _get_router()
    config["scan_type"] = "price_variance"
    return await _discover(router, config)


@activity.defn(name="scan_maverick_spend")
async def scan_maverick_spend(config: dict) -> dict:
    """Scan for maverick spend (Agent 22)."""
    from agents.proactive_optimization import discover_savings as _discover

    router = _get_router()
    config["scan_type"] = "maverick_spend"
    return await _discover(router, config)


@activity.defn(name="scan_contract_expiries")
async def scan_contract_expiries(config: dict) -> dict:
    """Scan for contract expiry optimization opportunities (Agent 22)."""
    from agents.proactive_optimization import discover_savings as _discover

    router = _get_router()
    config["scan_type"] = "contract_expiry"
    return await _discover(router, config)


@activity.defn(name="scan_payment_optimization")
async def scan_payment_optimization(config: dict) -> dict:
    """Scan for payment optimization opportunities (Agent 22)."""
    from agents.proactive_optimization import discover_savings as _discover

    router = _get_router()
    config["scan_type"] = "payment_optimization"
    return await _discover(router, config)


@activity.defn(name="scan_category_optimization")
async def scan_category_optimization(config: dict) -> dict:
    """Full category optimization analysis (Agent 22)."""
    from agents.proactive_optimization import discover_savings as _discover

    router = _get_router()
    config["scan_type"] = "category_optimization"
    return await _discover(router, config)


@activity.defn(name="scan_substitute_products")
async def scan_substitute_products(config: dict) -> dict:
    """Scan for substitute product opportunities (Agent 22)."""
    from agents.proactive_optimization import discover_savings as _discover

    router = _get_router()
    config["scan_type"] = "substitute_products"
    return await _discover(router, config)


@activity.defn(name="scan_vendor_consolidation")
async def scan_vendor_consolidation(config: dict) -> dict:
    """Scan for vendor consolidation opportunities (Agent 22)."""
    from agents.proactive_optimization import discover_savings as _discover

    router = _get_router()
    config["scan_type"] = "vendor_consolidation"
    return await _discover(router, config)


# ============================================
# Agent 23: Price Tracking
# ============================================

@activity.defn(name="fetch_catalog_pricing")
async def fetch_catalog_pricing(request: dict) -> dict:
    """Fetch pricing from vendor catalogs and APIs (Agent 23)."""
    from agents.price_tracking import track_prices as _track

    router = _get_router()
    return await _track(router, request)


@activity.defn(name="compare_contract_vs_market")
async def compare_contract_vs_market(comparison_data: dict) -> dict:
    """Compare contract prices against market (Agent 23)."""
    from agents.price_tracking import track_prices as _track

    router = _get_router()
    comparison_data["action"] = "compare"
    return await _track(router, comparison_data)


# ============================================
# Notification Activities (non-LLM)
# ============================================

@activity.defn(name="notify_human_review_needed")
async def notify_human_review_needed(parsed_req: dict) -> dict:
    """Send notification that human review is needed."""
    logger.info(f"Human review needed for requisition: {parsed_req.get('req_id')}")
    return {"notified": True}


@activity.defn(name="notify_compliance_issues")
async def notify_compliance_issues(data: dict) -> dict:
    """Send notification about compliance issues."""
    logger.info(f"Compliance issues for: {data.get('requisition', {}).get('req_id')}")
    return {"notified": True}


@activity.defn(name="notify_invoice_exception")
async def notify_invoice_exception(data: dict) -> dict:
    """Send notification about invoice matching exception."""
    logger.info(f"Invoice exception: {data.get('invoice', {}).get('invoice_id')}")
    return {"notified": True}


@activity.defn(name="escalate_invoice_exception")
async def escalate_invoice_exception(data: dict) -> dict:
    """Escalate unresolved invoice exception."""
    logger.info(f"Escalating invoice: {data.get('invoice', {}).get('invoice_id')}")
    return {"escalated": True}


@activity.defn(name="schedule_payment")
async def schedule_payment(payment_data: dict) -> dict:
    """Schedule a payment in the ERP system."""
    logger.info(f"Scheduling payment for invoice: {payment_data.get('invoice', {}).get('invoice_id')}")
    return {"scheduled": True}


@activity.defn(name="distribute_rfp_to_vendors")
async def distribute_rfp_to_vendors(rfp: dict) -> dict:
    """Distribute RFP to identified vendors."""
    logger.info(f"Distributing RFP to vendors")
    return {"distributed": True}


@activity.defn(name="send_price_alert")
async def send_price_alert(alert_data: dict) -> dict:
    """Send price change alert to procurement team."""
    logger.info(f"Price alert: {alert_data.get('change_type')} for {alert_data.get('category')}")
    return {"sent": True}


@activity.defn(name="update_price_database")
async def update_price_database(results: dict) -> dict:
    """Update internal price database with latest findings."""
    logger.info(f"Updating price database with {len(results.get('results', []))} categories")
    return {"updated": True}


@activity.defn(name="send_optimization_alerts")
async def send_optimization_alerts(alerts: dict) -> dict:
    """Send optimization discovery alerts."""
    count = len(alerts.get("discoveries", []))
    logger.info(f"Sending {count} optimization alerts")
    return {"sent": True, "count": count}


# ============================================
# Contract Lifecycle Activities
# ============================================

@activity.defn(name="begin_renewal_analysis")
async def begin_renewal_analysis(contract: dict) -> dict:
    """Begin market analysis for contract renewal (Agent 8)."""
    from agents.contract import manage_contract as _manage

    router = _get_router()
    contract["action"] = "renewal_analysis"
    return await _manage(router, contract)


@activity.defn(name="send_renewal_recommendation")
async def send_renewal_recommendation(contract: dict) -> dict:
    """Send contract renewal recommendation to stakeholder (Agent 8)."""
    from agents.contract import manage_contract as _manage

    router = _get_router()
    contract["action"] = "renewal_recommendation"
    return await _manage(router, contract)


@activity.defn(name="send_final_renewal_alert")
async def send_final_renewal_alert(contract: dict) -> dict:
    """Send final renewal decision alert (Agent 8)."""
    logger.info(f"Final renewal alert for contract: {contract.get('contract_id')}")
    return {"sent": True}


@activity.defn(name="handle_contract_expiry")
async def handle_contract_expiry(contract: dict) -> dict:
    """Handle contract expiry (Agent 8)."""
    from agents.contract import manage_contract as _manage

    router = _get_router()
    contract["action"] = "handle_expiry"
    return await _manage(router, contract)
