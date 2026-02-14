"""
Talos AI — Agent 12: Invoice Matching

Performs three-way matching between purchase orders, goods receipts, and vendor
invoices to validate payment authorization. Uses the smart model tier for
accurate document comparison and discrepancy detection.
"""

import json
import logging
from typing import Optional

from llm.router import LLMRouter, ModelTier
from llm.prompts.agent_12_invoice_matching import AGENT_12_SYSTEM_PROMPT
from models.core import InvoiceMatchResult

logger = logging.getLogger(__name__)


async def three_way_match(
    router: LLMRouter,
    input_data: dict,
    client_mode: str = "university",
) -> InvoiceMatchResult:
    """
    Perform three-way matching of PO, receipt, and invoice.

    Compares line items, quantities, prices, and terms across the purchase
    order, goods receipt, and vendor invoice to identify discrepancies
    and authorize or flag payments.

    Args:
        router: LLM router instance
        input_data: Invoice data, purchase order details, and goods receipt
                    records including line items, quantities, unit prices,
                    tax amounts, and payment terms.
        client_mode: Client type - "university", "nypa", or "northwell"

    Returns:
        InvoiceMatchResult with match status, discrepancy details,
        recommended action, and payment authorization decision.
    """
    context = json.dumps({
        "client_mode": client_mode,
        "input": input_data,
    })

    result = await router.complete(
        tier=ModelTier.SMART,
        system_prompt=AGENT_12_SYSTEM_PROMPT,
        user_message=context,
        response_format=InvoiceMatchResult,
    )

    return result
