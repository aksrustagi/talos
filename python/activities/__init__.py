"""
Talos AI — Temporal Activities

Activities wrap agent LLM calls and connector operations for use in workflows.
"""

from activities.llm_activities import (
    parse_requisition,
    check_compliance,
    check_aggregation,
    gather_market_intelligence,
    generate_rfp,
    evaluate_vendor_responses,
    run_negotiation,
    onboard_vendor,
    send_approval_request,
    escalate_approval_activity,
    generate_purchase_order_activity,
    dispatch_po_to_vendor,
    chase_vendor_confirmation,
    three_way_match,
    optimize_payment,
    verify_goods_receipt,
    check_budget,
    analyze_spend,
    verify_savings_claim,
    monitor_risk,
    develop_category_strategy,
    score_supplier,
    answer_procurement_question,
    scan_price_variances,
    scan_maverick_spend,
    scan_contract_expiries,
    scan_payment_optimization,
    scan_category_optimization,
    scan_substitute_products,
    scan_vendor_consolidation,
    fetch_catalog_pricing,
    compare_contract_vs_market,
    begin_renewal_analysis,
    send_renewal_recommendation,
    handle_contract_expiry,
)

from activities.connector_activities import (
    create_requisition_in_erp,
    create_po_in_erp,
    get_invoices_from_erp,
    get_vendors_from_erp,
    get_contracts_from_erp,
    search_catalog,
)
