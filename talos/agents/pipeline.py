"""
Talos Pipeline — Chains agents together. This IS the orchestration.

When Temporal is enabled (config.enable_temporal=True), pipelines run as
durable Temporal workflows. Otherwise, the default direct async path is used.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from .core import TalosAgents
from ..config import get_config
from ..schemas import (
    RequisitionPipeline, ParsedRequisition, ComplianceResult,
    AggregationOpportunity, PriceTrackingResult, SavingsRecord,
)

log = logging.getLogger("talos.pipeline")


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class RequisitionPipelineRunner:
    """
    Runs the full req-to-PO pipeline:
    intake_parser -> policy_compliance -> demand_aggregation -> price_tracker -> [approval] -> po_generation
    """

    def __init__(self, client_type: str = "university", agents: TalosAgents | None = None):
        self.agents = agents or TalosAgents(client_type)
        self.client_type = client_type

    async def process(
        self,
        raw_text: str,
        requester_name: str = "",
        department: str = "",
        channel: str = "email",
        recent_orders: list[dict] | None = None,
        auto_generate_po: bool = False,
    ) -> RequisitionPipeline:
        """Run the full pipeline. Returns pipeline state with all agent outputs."""
        pipe = RequisitionPipeline(
            raw_text=raw_text,
            source_channel=channel,
            requester_name=requester_name,
            department=department,
        )

        try:
            # ---- STEP 1: Parse ----
            log.info(f"[{pipe.id}] Step 1: Parsing request...")
            pipe.parsed = await self.agents.intake_parser(
                raw_text, requester=requester_name, department=department, channel=channel
            )
            pipe.status = "parsed"
            pipe.agent_calls.append({
                "agent": "intake_parser", "step": 1,
                "timestamp": _utcnow_iso(),
            })
            log.info(f"[{pipe.id}] Parsed: {pipe.parsed.req_id} | {len(pipe.parsed.items)} items | "
                     f"${pipe.parsed.estimated_total:.2f} | confidence={pipe.parsed.confidence_score}")

            # ---- STEP 2: Compliance ----
            log.info(f"[{pipe.id}] Step 2: Checking compliance...")
            pipe.compliance = await self.agents.policy_compliance(pipe.parsed)
            pipe.status = "compliance_checked"
            pipe.agent_calls.append({
                "agent": "policy_compliance", "step": 2,
                "timestamp": _utcnow_iso(),
            })

            blocking_violations = [v for v in pipe.compliance.violations if v.severity == "block"]
            if blocking_violations:
                pipe.status = "compliance_blocked"
                log.warning(f"[{pipe.id}] BLOCKED: {len(blocking_violations)} blocking violations")
                for v in blocking_violations:
                    log.warning(f"  [{v.severity}] {v.policy_name}: {v.description}")

            log.info(f"[{pipe.id}] Compliant: {pipe.compliance.is_compliant} | "
                     f"{len(pipe.compliance.violations)} violations | "
                     f"{len(pipe.compliance.required_approvals)} approvals needed")

            # ---- STEP 3: Aggregation ----
            log.info(f"[{pipe.id}] Step 3: Checking aggregation opportunities...")
            pipe.aggregation = await self.agents.demand_aggregation(pipe.parsed, recent_orders)
            pipe.status = "aggregation_checked" if pipe.status != "compliance_blocked" else pipe.status
            pipe.agent_calls.append({
                "agent": "demand_aggregation", "step": 3,
                "timestamp": _utcnow_iso(),
            })
            log.info(f"[{pipe.id}] Aggregation: {pipe.aggregation.recommended_action} | "
                     f"savings=${pipe.aggregation.consolidation_savings_estimate:.2f}")

            # ---- STEP 4: Price Tracking ----
            if pipe.parsed.items:
                item_desc = pipe.parsed.items[0].description
                current_price = pipe.parsed.items[0].estimated_unit_price
                qty = sum(item.quantity for item in pipe.parsed.items)

                log.info(f"[{pipe.id}] Step 4: Tracking prices for '{item_desc}'...")
                pipe.pricing = await self.agents.price_tracker(
                    item_description=item_desc,
                    current_price=current_price,
                    quantity=qty,
                )
                pipe.status = "priced" if pipe.status not in ("compliance_blocked",) else pipe.status
                pipe.agent_calls.append({
                    "agent": "price_tracker", "step": 4,
                    "timestamp": _utcnow_iso(),
                })
                log.info(f"[{pipe.id}] Pricing: {len(pipe.pricing.sources_checked)} sources | "
                         f"${pipe.pricing.lowest_price:.2f}-${pipe.pricing.highest_price:.2f} | "
                         f"recommended=${pipe.pricing.recommended_price:.2f}")

                # Auto-generate savings if price tracking found better price
                if current_price and pipe.pricing.recommended_price < current_price:
                    savings_amount = (current_price - pipe.pricing.recommended_price) * qty
                    log.info(f"[{pipe.id}] Potential savings found: ${savings_amount:.2f}")
                    pipe.savings = SavingsRecord(
                        category=pipe.parsed.category,
                        description=f"Price improvement for {item_desc}",
                        baseline_price=current_price,
                        new_price=pipe.pricing.recommended_price,
                        volume=qty,
                        period=datetime.now(timezone.utc).strftime("%Y-%m"),
                        evidence=[f"Price tracking: {pipe.pricing.recommended_vendor}"],
                    ).calculate()

            # ---- STEP 5: Generate PO (if auto and compliant) ----
            if auto_generate_po and pipe.status == "priced" and pipe.compliance.is_compliant:
                if not pipe.compliance.required_approvals:
                    log.info(f"[{pipe.id}] Step 5: Auto-generating PO (no approval required)...")
                    pipe.purchase_order = await self.agents.generate_po(pipe.parsed, pipe.compliance)
                    pipe.status = "po_generated"
                    pipe.agent_calls.append({
                        "agent": "purchase_order", "step": 5,
                        "timestamp": _utcnow_iso(),
                    })
                    log.info(f"[{pipe.id}] PO: {pipe.purchase_order.po_number} | ${pipe.purchase_order.total:.2f}")
                else:
                    pipe.status = "awaiting_approval"
                    log.info(f"[{pipe.id}] Awaiting {len(pipe.compliance.required_approvals)} approvals")

        except Exception as e:
            log.error(f"[{pipe.id}] Pipeline error: {e}", exc_info=True)
            pipe.errors.append(str(e))
            pipe.status = "error"

        # Track total LLM cost using drain to prevent unbounded history accumulation
        calls = self.agents.router.drain_history()
        pipe.total_llm_cost = sum(c.cost for c in calls)

        return pipe

    async def start_temporal_workflow(
        self,
        raw_text: str,
        requester_name: str = "",
        department: str = "",
        channel: str = "portal",
        recent_orders: list[dict] | None = None,
        auto_generate_po: bool = False,
        pipeline_id: str | None = None,
    ) -> RequisitionPipeline:
        """
        Start a Temporal workflow for the pipeline. Returns immediately with
        workflow_id/workflow_run_id populated. The actual processing happens
        asynchronously in the Temporal worker.
        """
        from temporalio.client import Client
        from ..workflows.requisition_workflow import RequisitionWorkflow, RequisitionWorkflowInput

        config = get_config()

        pipe = RequisitionPipeline(
            raw_text=raw_text,
            source_channel=channel,
            requester_name=requester_name,
            department=department,
        )
        if pipeline_id:
            pipe.id = pipeline_id

        client = await Client.connect(
            config.temporal_address,
            namespace=config.temporal_namespace,
        )

        workflow_input = RequisitionWorkflowInput(
            raw_text=raw_text,
            requester_name=requester_name,
            department=department,
            channel=channel,
            recent_orders=recent_orders,
            auto_generate_po=auto_generate_po,
            pipeline_id=pipe.id,
        )

        handle = await client.start_workflow(
            RequisitionWorkflow.run,
            workflow_input,
            id=f"talos-pipeline-{pipe.id}",
            task_queue=config.temporal_task_queue,
        )

        pipe.workflow_id = handle.id
        pipe.workflow_run_id = handle.result_run_id
        pipe.status = "workflow_started"

        log.info(f"[{pipe.id}] Temporal workflow started: {handle.id}")
        return pipe

    async def dispatch(
        self,
        raw_text: str,
        requester_name: str = "",
        department: str = "",
        channel: str = "portal",
        recent_orders: list[dict] | None = None,
        auto_generate_po: bool = False,
    ) -> RequisitionPipeline:
        """
        Smart dispatch: uses Temporal if enabled, otherwise direct async.
        This is the recommended entry point for new code.
        """
        config = get_config()
        if config.enable_temporal:
            return await self.start_temporal_workflow(
                raw_text=raw_text,
                requester_name=requester_name,
                department=department,
                channel=channel,
                recent_orders=recent_orders,
                auto_generate_po=auto_generate_po,
            )
        return await self.process(
            raw_text=raw_text,
            requester_name=requester_name,
            department=department,
            channel=channel,
            recent_orders=recent_orders,
            auto_generate_po=auto_generate_po,
        )

    async def close(self):
        await self.agents.close()


class SavingsAnalyzer:
    """Analyze historical spend data to find savings opportunities."""

    def __init__(self, client_type: str = "university", agents: TalosAgents | None = None):
        self.agents = agents or TalosAgents(client_type)

    async def verify_single(
        self,
        description: str,
        baseline_price: float,
        new_price: float,
        volume: int,
        category: str = "",
        evidence: list[str] | None = None,
    ) -> SavingsRecord:
        """Verify a single savings claim."""
        return await self.agents.verify_savings(
            description=description,
            baseline_price=baseline_price,
            new_price=new_price,
            volume=volume,
            category=category,
            evidence=evidence,
        )

    async def find_optimization(self, spend_data: str):
        """Find optimization opportunities in spend data."""
        return await self.agents.find_optimizations(spend_data)

    async def close(self):
        await self.agents.close()
