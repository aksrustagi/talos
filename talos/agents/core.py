"""
Talos Agents — The core agents that power the procurement pipeline.

Each agent = system prompt + LLM call + Pydantic output.
No framework. Just async functions.
"""
from __future__ import annotations

import logging
from ..llm import LLMRouter
from ..policies import get_policies
from ..schemas import (
    ParsedRequisition, ComplianceResult, AggregationOpportunity,
    PurchaseOrder, SavingsRecord, PriceTrackingResult, OptimizationDiscovery,
)

log = logging.getLogger("talos.agents")


class TalosAgents:
    """
    All agent calls in one place. Each method = one agent.

    Usage:
        agents = TalosAgents(client_type="university")
        parsed = await agents.intake_parser("I need 50 boxes of gloves...")
        compliance = await agents.policy_compliance(parsed)
        prices = await agents.price_tracker("nitrile gloves powder-free")
    """

    def __init__(self, client_type: str = "university"):
        self.router = LLMRouter()
        self.client_type = client_type
        self.policies = get_policies(client_type)

    def _p(self, key: str) -> str:
        """Get policy value."""
        return self.policies.get(key, "")

    async def close(self):
        await self.router.close()

    # ==================================================================
    # AGENT 1: INTAKE PARSER (cheap tier)
    # ==================================================================
    async def intake_parser(self, raw_text: str, requester: str = "", department: str = "", channel: str = "email") -> ParsedRequisition:
        system = f"""You are the Talos Intake Parser for {self._p('name')}.

Convert this procurement request into structured JSON.

EXTRACT:
1. Items: description, quantity, unit, estimated_unit_price (your best estimate if not stated), unspsc_code (8-digit if you can determine it)
2. estimated_total: sum of all items
3. category: broad category (IT Equipment, Lab Supplies, Office Supplies, Professional Services, Facilities, Medical Supplies, Pharmaceuticals, Safety Equipment, etc.)
4. subcategory: specific subcategory
5. urgency: "standard" (default), "urgent" (if they say ASAP/rush/needed immediately), "emergency" (safety/outage/patient care)
6. funding_source: Determine from context:
   - Grant numbers (NSF-, NIH-, DOE-, R01-, U01-) -> funding_type: "grant_federal"
   - "Operating budget" / "dept budget" / cost center codes -> "operating"
   - "Capital" / equipment over $5K -> "capital"
   - "Bond funded" / capital project codes -> "bond_funded"
   - "Endowment" -> "endowment"
7. delivery_location: Where to ship
8. needed_by: When they need it (ISO date if possible)
9. compliance_flags: List any that apply:
   - "export_controlled" — if item could be ITAR/EAR (lasers, encryption, drones, certain chemicals)
   - "grant_funded" — if funded by federal/state grant
   - "capital_asset" — if single item >$5,000
   - "hazardous_material" — chemicals, biologicals
   - "fda_regulated" — medical devices, drugs
   - "controlled_substance" — DEA scheduled substances
   - "it_security_review" — if touches network/data
   - "sole_source" — if requester names only one vendor
10. confidence_score: 0.0-1.0 (how confident you are in the parse)
    - Set requires_human_review=true if confidence < 0.85

CONTEXT:
Requester: {requester or 'Unknown'}
Department: {department or 'Unknown'}
Channel: {channel}
Client: {self._p('name')} — {self._p('spend_profile')}

{self._p('regulations')}

{self._p('preferred_vendors')}"""

        return await self.router.call(
            agent="intake_parser", tier="cheap",
            system_prompt=system,
            user_message=raw_text,
            response_model=ParsedRequisition,
        )

    # ==================================================================
    # AGENT 2: POLICY COMPLIANCE (smart tier)
    # ==================================================================
    async def policy_compliance(self, parsed: ParsedRequisition) -> ComplianceResult:
        system = f"""You are the Talos Policy Compliance Agent for {self._p('name')}.

Validate this requisition against all applicable policies.

APPROVAL THRESHOLDS:
{self._p('approval_thresholds')}

REGULATIONS:
{self._p('regulations')}

PREFERRED VENDORS:
{self._p('preferred_vendors')}

UNIVERSAL RULES:
- Splitting orders to avoid dollar thresholds = POLICY VIOLATION -> severity: "block"
- All IT purchases touching the network need IT Security review -> add to regulatory_requirements
- Recurring subscriptions >$10K/year need contract review
- Construction/renovation >$50K needs facilities approval
- Competitive bid required for purchases >{self._p('competitive_bid_threshold')} unless sole source justified

YOUR ANALYSIS:
1. is_compliant: false if ANY blocking violations exist
2. violations: list every policy issue found. severity:
   - "block" = cannot proceed until resolved
   - "requires_justification" = can proceed with written justification
   - "warning" = informational, can proceed
3. required_approvals: based on estimated_total vs thresholds above. List each approver needed.
4. preferred_vendors: check if items match preferred vendor categories above
5. regulatory_requirements: list all applicable regulations (e.g., "2_CFR_200", "HIPAA_BAA", "FDA_510k")
6. competitive_bid_required: true if above threshold

Set requisition_id to the req_id from the input."""

        return await self.router.call(
            agent="policy_compliance", tier="smart",
            system_prompt=system,
            user_message=parsed.model_dump_json(indent=2),
            response_model=ComplianceResult,
        )

    # ==================================================================
    # AGENT 3: DEMAND AGGREGATION (cheap tier)
    # ==================================================================
    async def demand_aggregation(self, parsed: ParsedRequisition, recent_orders: list[dict] | None = None) -> AggregationOpportunity:
        system = f"""You are the Talos Demand Aggregation Agent for {self._p('name')}.

Check if this requisition can be consolidated with other purchases for volume discounts.

STRATEGIES:
- "consolidate": Combine with other pending/recent orders for same items -> volume discount
- "batch": Hold up to 7 days to combine with expected demand -> set batch_window_days
- "proceed_solo": No aggregation opportunity

ANALYSIS:
1. Check if the same category/item appears in recent orders (provided below)
2. Estimate consolidation_savings_estimate (typically 5-20% of order value for volume buys)
3. List similar_recent_reqs (IDs of matching recent orders)
4. Consider seasonal patterns, fiscal year-end buying, etc.

Set requisition_id to the req_id from the input."""

        user_msg = f"REQUISITION:\n{parsed.model_dump_json(indent=2)}"
        if recent_orders:
            user_msg += f"\n\nRECENT ORDERS IN SAME CATEGORY (last 90 days):\n{recent_orders}"
        else:
            user_msg += "\n\nNo recent order data available. Analyze based on the requisition alone and suggest potential aggregation."

        return await self.router.call(
            agent="demand_aggregation", tier="cheap",
            system_prompt=system,
            user_message=user_msg,
            response_model=AggregationOpportunity,
        )

    # ==================================================================
    # AGENT 9: APPROVAL ROUTING (cheap tier)
    # ==================================================================
    async def approval_routing(self, parsed: ParsedRequisition, compliance: ComplianceResult) -> dict:
        """Returns approval routing plan."""
        system = f"""You are the Talos Approval Workflow Agent for {self._p('name')}.

Given this requisition and its compliance results, produce an approval routing plan.

APPROVAL THRESHOLDS:
{self._p('approval_thresholds')}

RULES:
- Route to each required approver in sequence (lowest level first)
- If amount crosses multiple thresholds, ALL required approvers must sign off
- Emergency requests: 4-hour SLA, escalate after 2 hours
- Standard requests: 48-hour SLA per approver, escalate after that
- If compliance violations exist with severity "requires_justification", add justification step before first approval

Respond with JSON:
{{
  "approval_chain": [
    {{"approver_role": "...", "approver_name": "...", "reason": "...", "sla_hours": 48}},
  ],
  "total_approvers": N,
  "estimated_completion_hours": N,
  "requires_justification_first": true/false,
  "justification_for": ["violation description..."]
}}"""

        result = await self.router.call(
            agent="approval_routing", tier="cheap",
            system_prompt=system,
            user_message=f"REQUISITION:\n{parsed.model_dump_json(indent=2)}\n\nCOMPLIANCE:\n{compliance.model_dump_json(indent=2)}",
        )

        if isinstance(result, str):
            import json
            try:
                return json.loads(result)
            except Exception:
                return {"approval_chain": [s.model_dump() for s in compliance.required_approvals], "raw": result}
        return result

    # ==================================================================
    # AGENT 10: PURCHASE ORDER GENERATION (cheap tier)
    # ==================================================================
    async def generate_po(self, parsed: ParsedRequisition, compliance: ComplianceResult) -> PurchaseOrder:
        system = f"""You are the Talos Purchase Order Agent for {self._p('name')}.

Generate a purchase order from this approved requisition.

PO FIELDS TO GENERATE:
- po_number: Will be auto-generated, just put "AUTO"
- requisition_id: From the parsed requisition's req_id
- vendor_name: Best vendor from compliance preferred_vendors, or from the requisition
- items: Copy from requisition, ensure unit prices are filled in
- total: Sum of all line items
- payment_terms: "Net 30" unless otherwise specified
- delivery_date: From requisition's needed_by
- ship_to: From requisition's delivery_location
- gl_code: From requisition's funding_source cost_center or gl_code
- status: "draft"

VENDOR SELECTION PRIORITY:
1. If compliance lists preferred_vendors with match_type "preferred" or "cooperative" or "gpo" -> use that vendor
2. If requisition specifies a vendor -> use that (unless blocked by compliance)
3. If no vendor specified -> recommend from preferred list:
{self._p('preferred_vendors')}

TAX: This is a tax-exempt institution. No tax should be included.
"""

        return await self.router.call(
            agent="purchase_order", tier="cheap",
            system_prompt=system,
            user_message=f"REQUISITION:\n{parsed.model_dump_json(indent=2)}\n\nCOMPLIANCE:\n{compliance.model_dump_json(indent=2)}",
            response_model=PurchaseOrder,
        )

    # ==================================================================
    # AGENT 17: SAVINGS VERIFICATION (genius tier)
    # ==================================================================
    async def verify_savings(
        self,
        description: str,
        baseline_price: float,
        new_price: float,
        volume: int,
        category: str,
        evidence: list[str] | None = None,
        period: str = "",
    ) -> SavingsRecord:
        system = f"""You are the Talos Savings Verification Agent for {self._p('name')}.

CRITICAL: Your output determines Talos revenue (33% of verified savings). Be CONSERVATIVE and AUDITABLE.

VERIFICATION STEPS:
1. Is the baseline price reasonable? (Not inflated to make savings look bigger)
2. Is the new price real? (Actual achieved price, not a quote)
3. Is the volume accurate? (Actual quantity purchased)
4. Calculate: total_savings = (baseline_price - new_price) * volume
5. Calculate: talos_share = total_savings * 0.33
6. Assign confidence score:
   - 0.95+: Clear before/after with PO documentation
   - 0.80-0.94: Strong benchmark comparison
   - 0.60-0.79: Reasonable estimate with some assumptions
   - <0.60: Do not claim, set confidence below 0.6
7. Assign verification_method: market_benchmark, competitive_bid, historical, cooperative_pricing, catalog_comparison

RULES:
- Be conservative. Undercounting is better than overcounting.
- If baseline seems inflated, adjust it down and note why.
- If savings seem too good to be true (>50% reduction), flag for review.
- Evidence must be specific (PO numbers, invoice numbers, benchmark sources).

Fill in ALL fields of the SavingsRecord."""

        user_msg = (
            f"SAVINGS CLAIM:\n"
            f"Description: {description}\n"
            f"Category: {category}\n"
            f"Baseline Price: ${baseline_price:.2f} per unit\n"
            f"New Price: ${new_price:.2f} per unit\n"
            f"Volume: {volume} units\n"
            f"Period: {period}\n"
            f"Evidence: {evidence or ['No specific evidence provided']}\n"
        )

        result = await self.router.call(
            agent="savings_verification", tier="genius",
            system_prompt=system,
            user_message=user_msg,
            response_model=SavingsRecord,
        )

        # Ensure calculation is correct regardless of LLM output
        result.baseline_price = baseline_price
        result.new_price = new_price
        result.volume = volume
        result.calculate()

        return result

    # ==================================================================
    # AGENT 23: PRICE TRACKING (smart tier)
    # ==================================================================
    async def price_tracker(self, item_description: str, current_price: float | None = None, quantity: int = 1) -> PriceTrackingResult:
        system = f"""You are the Talos Price Tracking Agent for {self._p('name')}.

Find the best available pricing for this item across all sources.

SOURCES TO CHECK (report what you know/estimate from market knowledge):
- Amazon Business (open market reference)
- GSA Advantage (federal schedule pricing, typically 20-40% off list)
- Cooperative contracts (E&I for education, Vizient/Premier for healthcare, NYS OGS for state)
- Direct manufacturer pricing
- Distribution pricing (Fisher Scientific, Grainger, McKesson, etc.)
- Historical institutional pricing patterns

{self._p('preferred_vendors')}

FOR EACH PRICE FOUND, provide:
- source: Where this price comes from
- vendor_name: Who sells it at this price
- unit_price: Price per unit
- contract_price: true if this is a negotiated/contract price
- quantity_break: Minimum quantity for this price (if applicable)

ALSO PROVIDE:
- lowest_price, highest_price, median_price across all sources
- recommended_vendor: Best value considering price + reliability + contract status
- recommended_price: The price to target
- savings_vs_current: If current price provided, how much they'd save per unit
- sources_checked: List all sources you checked

Be realistic with pricing. Use your knowledge of typical institutional pricing for these items.
Current price (if known): ${f'{current_price:.2f}' if current_price else 'Unknown'}
Quantity needed: {quantity}"""

        return await self.router.call(
            agent="price_tracker", tier="smart",
            system_prompt=system,
            user_message=f"Find best pricing for: {item_description}\nQuantity: {quantity}",
            response_model=PriceTrackingResult,
        )

    # ==================================================================
    # AGENT 22: PROACTIVE OPTIMIZATION (genius tier)
    # ==================================================================
    async def find_optimizations(self, spend_data: str) -> OptimizationDiscovery:
        system = f"""You are the Talos Proactive Optimization Agent for {self._p('name')}.

YOU ARE THE MONEY MACHINE. Analyze this spend data and find savings opportunities.

DISCOVERY PATTERNS:
1. PRICE VARIANCE: Same item bought at different prices by different departments -> "consolidation"
2. CONTRACT EXPIRY: Contracts above market rate approaching renewal -> "renegotiation"
3. SUBSTITUTE: Cheaper functionally equivalent alternatives exist -> "substitute"
4. ELIMINATE: Redundant or unnecessary spending -> "eliminate"
5. TIMING: Buying at wrong time, missing seasonal/bulk discounts -> "timing"

FOR EACH DISCOVERY:
- description: Specific, with numbers. "Chemistry pays $X, Biology pays $Y for same item"
- estimated_annual_savings: Your best estimate with calculation logic
- confidence: 0.0-1.0 (only report if >0.6)
- recommended_action: Specific next step
- priority: high (>$100K savings), medium ($10K-$100K), low (<$10K)
- affected_departments: Which groups are impacted

Be specific and quantitative. Vague suggestions are useless."""

        return await self.router.call(
            agent="proactive_optimization", tier="genius",
            system_prompt=system,
            user_message=spend_data,
            response_model=OptimizationDiscovery,
        )

    # ==================================================================
    # KNOWLEDGE BASE (smart tier) — answers procurement questions
    # ==================================================================
    async def knowledge_base(self, question: str) -> str:
        system = f"""You are the Talos Knowledge Base Agent for {self._p('name')}.

Answer procurement questions clearly and helpfully. You know:
- All procurement policies and thresholds
- Preferred vendor contracts
- Regulatory requirements
- Common procurement procedures

APPROVAL THRESHOLDS:
{self._p('approval_thresholds')}

REGULATIONS:
{self._p('regulations')}

PREFERRED VENDORS:
{self._p('preferred_vendors')}

PROCUREMENT SYSTEM: {self._p('procurement_system')}

STYLE: Clear, specific, non-bureaucratic. Cite specific policies. Suggest faster/cheaper alternatives when you can. If you don't know something specific (like exact contract numbers or vendor IDs), say so."""

        return await self.router.call(
            agent="knowledge_base", tier="smart",
            system_prompt=system,
            user_message=question,
        )
