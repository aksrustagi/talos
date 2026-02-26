/**
 * Agent 7: Payment Reconciliation Agent
 *
 * Purpose: Match invoices, verify deliveries, and reconcile payments
 * Runtime: TEMPORAL (financial audit trail)
 *
 * This workflow handles:
 * - Invoice parsing and validation
 * - 3-way matching (PO, Receipt, Invoice)
 * - Contract price verification
 * - Discrepancy handling with approvals
 * - Payment scheduling
 * - Complete audit trail for financial auditors
 */

import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
  workflowInfo,
  sleep,
} from "@temporalio/workflow";

import type * as activities from "../activities/reconciliation-activities";

// Proxy activities
const {
  parseInvoice,
  checkDuplicateInvoice,
  findMatchingPO,
  findMatchingReceipt,
  verifyQuantities,
  verifyPricing,
  getContractPrices,
  notifyReceiver,
  checkReceiptExists,
  notifyApReviewer,
  calculatePaymentDate,
  schedulePayment,
  createVendorDispute,
  checkDisputeResolved,
  recordAuditEvent,
  updateInvoiceStatus,
  sendPaymentNotification,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 3,
  },
});

// Types
export interface Invoice {
  id: string;
  universityId: string;
  vendorId: string;
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: number;
  dueDate: number;
  lineItems: Array<{
    lineNumber: number;
    sku: string;
    description: string;
    quantity: number;
    unitPrice: number;
    extendedPrice: number;
  }>;
  subtotal: number;
  taxAmount: number;
  shippingAmount: number;
  totalAmount: number;
  poNumber?: string;
  paymentTerms?: string;
  earlyPayDiscount?: {
    discountPercent: number;
    discountDays: number;
  };
  documentUrl?: string;
}

export interface ParsedInvoice extends Invoice {
  extractedData: {
    confidence: number;
    warnings: string[];
  };
}

export interface MatchResult {
  found: boolean;
  poNumber?: string;
  poId?: string;
  lineItems?: any[];
  paymentTerms?: string;
  requiresReceipt?: boolean;
}

export interface Discrepancy {
  discrepancyId: string;
  type: "no_po" | "no_receipt" | "price_variance" | "quantity_variance" | "duplicate_invoice" | "unauthorized_purchase" | "contract_violation";
  severity: "low" | "medium" | "high";
  description: string;
  amount?: number;
  lineItemNumber?: number;
  resolution?: "pending" | "approved" | "adjusted" | "disputed" | "rejected";
  resolvedBy?: string;
  resolvedAt?: number;
  resolutionNotes?: string;
}

export interface DiscrepancyResolution {
  action: "approve" | "reject" | "dispute" | "adjust";
  approver: string;
  approverName: string;
  notes: string;
  adjustmentAmount?: number;
}

export interface AuditEntry {
  timestamp: string;
  workflowId: string;
  action: string;
  details: any;
}

export interface ReconciliationState {
  invoiceId: string;
  matchType: "three_way" | "two_way" | "receipt_only";
  poMatch?: MatchResult;
  receiptMatch?: MatchResult;
  discrepancies: Discrepancy[];
  priceVarianceTotal: number;
  status: string;
  auditTrail: AuditEntry[];
}

export interface ReconciliationResult {
  status: "matched" | "exception" | "disputed" | "rejected";
  paymentAmount?: number;
  paymentDate?: number;
  discrepanciesResolved?: number;
  disputeId?: string;
  reason?: string;
  auditTrail: AuditEntry[];
}

// Signals
export const resolveDiscrepancySignal = defineSignal<[string, string, string, string, number?]>("resolveDiscrepancy");
// discrepancyId, action, approver, notes, adjustmentAmount?
export const cancelWorkflowSignal = defineSignal("cancelWorkflow");

// Queries
export const getReconciliationStatusQuery = defineQuery<ReconciliationState>("getReconciliationStatus");
export const getDiscrepanciesQuery = defineQuery<Discrepancy[]>("getDiscrepancies");
export const getAuditTrailQuery = defineQuery<AuditEntry[]>("getAuditTrail");

/**
 * Payment Reconciliation Workflow
 *
 * Performs 3-way matching and reconciliation for invoices with full audit trail.
 * Handles discrepancies with approval workflows.
 */
export async function paymentReconciliationWorkflow(
  invoice: Invoice
): Promise<ReconciliationResult> {
  // Initialize state
  const state: ReconciliationState = {
    invoiceId: invoice.id,
    matchType: "three_way",
    discrepancies: [],
    priceVarianceTotal: 0,
    status: "pending",
    auditTrail: [],
  };

  let cancelled = false;
  const discrepancyResolutions: Map<string, DiscrepancyResolution> = new Map();

  // Helper function to add audit entries
  const audit = (action: string, details: any) => {
    state.auditTrail.push({
      timestamp: new Date().toISOString(),
      workflowId: workflowInfo().workflowId,
      action,
      details,
    });
  };

  // Setup signal handlers
  setHandler(cancelWorkflowSignal, () => {
    cancelled = true;
    audit("workflow_cancelled", { reason: "User cancelled" });
  });

  setHandler(resolveDiscrepancySignal, (
    discrepancyId: string,
    action: string,
    approver: string,
    notes: string,
    adjustmentAmount?: number
  ) => {
    discrepancyResolutions.set(discrepancyId, {
      action: action as any,
      approver,
      approverName: approver, // Would look up name
      notes,
      adjustmentAmount,
    });

    const discrepancy = state.discrepancies.find(d => d.discrepancyId === discrepancyId);
    if (discrepancy) {
      discrepancy.resolution = action as any;
      discrepancy.resolvedBy = approver;
      discrepancy.resolvedAt = Date.now();
      discrepancy.resolutionNotes = notes;
    }

    audit("discrepancy_resolved", { discrepancyId, action, approver, notes, adjustmentAmount });
  });

  // Setup query handlers
  setHandler(getReconciliationStatusQuery, () => state);
  setHandler(getDiscrepanciesQuery, () => state.discrepancies);
  setHandler(getAuditTrailQuery, () => state.auditTrail);

  audit("reconciliation_started", { invoiceId: invoice.id, amount: invoice.totalAmount });

  try {
    // ==========================================
    // STEP 1: Parse and validate invoice
    // ==========================================
    audit("invoice_parsing_started", { invoiceNumber: invoice.invoiceNumber });

    const parsedInvoice = await parseInvoice({ invoice });

    audit("invoice_parsed", {
      lineItems: parsedInvoice.lineItems.length,
      totalAmount: parsedInvoice.totalAmount,
      confidence: parsedInvoice.extractedData?.confidence,
    });

    // Check for duplicates
    const duplicateCheck = await checkDuplicateInvoice({
      vendorId: invoice.vendorId,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.totalAmount,
      invoiceDate: invoice.invoiceDate,
    });

    if (duplicateCheck.isDuplicate) {
      audit("duplicate_detected", {
        duplicateInvoiceId: duplicateCheck.duplicateInvoiceId,
        matchType: duplicateCheck.matchType,
      });

      await updateInvoiceStatus({
        invoiceId: invoice.id,
        status: "duplicate",
        reason: `Duplicate of invoice ${duplicateCheck.duplicateInvoiceId}`,
      });

      return {
        status: "rejected",
        reason: `Duplicate invoice detected: ${duplicateCheck.duplicateInvoiceId}`,
        auditTrail: state.auditTrail,
      };
    }

    if (cancelled) {
      return { status: "rejected", reason: "Cancelled", auditTrail: state.auditTrail };
    }

    // ==========================================
    // STEP 2: Find matching PO
    // ==========================================
    audit("po_matching_started", { poNumber: invoice.poNumber });

    const poMatch = await findMatchingPO({
      poNumber: invoice.poNumber,
      vendorId: invoice.vendorId,
      lineItems: parsedInvoice.lineItems,
      universityId: invoice.universityId,
    });

    state.poMatch = poMatch;
    audit("po_match_result", {
      found: poMatch.found,
      poNumber: poMatch.poNumber,
      requiresReceipt: poMatch.requiresReceipt,
    });

    if (!poMatch.found) {
      state.discrepancies.push({
        discrepancyId: `disc_nopo_${Date.now()}`,
        type: "no_po",
        severity: "high",
        description: "Invoice received without matching purchase order",
        resolution: "pending",
      });
      audit("discrepancy_created", { type: "no_po", severity: "high" });
    }

    // ==========================================
    // STEP 3: Verify receipt (3-way match)
    // ==========================================
    if (poMatch.found && poMatch.requiresReceipt) {
      audit("receipt_matching_started", { poNumber: poMatch.poNumber });

      let receiptMatch = await findMatchingReceipt({
        poId: poMatch.poId!,
        poNumber: poMatch.poNumber!,
        lineItems: parsedInvoice.lineItems,
      });

      state.receiptMatch = receiptMatch;

      if (!receiptMatch.found) {
        state.discrepancies.push({
          discrepancyId: `disc_norec_${Date.now()}`,
          type: "no_receipt",
          severity: "medium",
          description: "Invoice received but goods not yet receipted",
          resolution: "pending",
        });

        audit("receipt_not_found", { poNumber: poMatch.poNumber });

        // Notify receiver and wait for receipt
        await notifyReceiver({
          poId: poMatch.poId!,
          poNumber: poMatch.poNumber!,
          expectedItems: parsedInvoice.lineItems,
          vendorName: invoice.vendorName,
        });

        // Wait up to 14 days for receipt
        const receiptCreated = await condition(async () => {
          const exists = await checkReceiptExists({ poId: poMatch.poId! });
          return exists || cancelled;
        }, "14 days");

        if (receiptCreated && !cancelled) {
          // Re-check for receipt
          receiptMatch = await findMatchingReceipt({
            poId: poMatch.poId!,
            poNumber: poMatch.poNumber!,
            lineItems: parsedInvoice.lineItems,
          });

          state.receiptMatch = receiptMatch;

          if (receiptMatch.found) {
            // Remove the no_receipt discrepancy
            state.discrepancies = state.discrepancies.filter(d => d.type !== "no_receipt");
            audit("receipt_found_after_wait", { poNumber: poMatch.poNumber });
          }
        }
      }

      // Verify quantities match
      if (receiptMatch?.found) {
        const quantityCheck = await verifyQuantities({
          poLineItems: poMatch.lineItems || [],
          receiptLineItems: receiptMatch.lineItems || [],
          invoiceLineItems: parsedInvoice.lineItems,
        });

        audit("quantity_check_result", {
          matches: quantityCheck.matches,
          variances: quantityCheck.variances?.length || 0,
        });

        if (!quantityCheck.matches && quantityCheck.variances) {
          for (const variance of quantityCheck.variances) {
            state.discrepancies.push({
              discrepancyId: `disc_qty_${variance.lineNumber}_${Date.now()}`,
              type: "quantity_variance",
              severity: variance.variancePercent > 10 ? "high" : "medium",
              description: `Quantity variance on line ${variance.lineNumber}: ordered ${variance.ordered}, received ${variance.received}, invoiced ${variance.invoiced}`,
              lineItemNumber: variance.lineNumber,
              resolution: "pending",
            });
          }
        }
      }
    } else {
      // 2-way match (services - no receipt needed)
      state.matchType = "two_way";
    }

    if (cancelled) {
      return { status: "rejected", reason: "Cancelled", auditTrail: state.auditTrail };
    }

    // ==========================================
    // STEP 4: Verify pricing
    // ==========================================
    audit("price_verification_started", {});

    const contractPrices = await getContractPrices({
      vendorId: invoice.vendorId,
      universityId: invoice.universityId,
      productSkus: parsedInvoice.lineItems.map(li => li.sku),
    });

    const priceCheck = await verifyPricing({
      contractPrices,
      poPrices: poMatch.lineItems || [],
      invoicePrices: parsedInvoice.lineItems,
      tolerance: 0.02, // 2% tolerance
    });

    audit("price_check_result", {
      withinTolerance: priceCheck.withinTolerance,
      totalOvercharge: priceCheck.totalOvercharge,
      varianceCount: priceCheck.variances?.length || 0,
    });

    state.priceVarianceTotal = priceCheck.totalOvercharge || 0;

    if (!priceCheck.withinTolerance && priceCheck.variances) {
      for (const variance of priceCheck.variances) {
        const severity = variance.variancePercent > 10 ? "high" : variance.variancePercent > 5 ? "medium" : "low";

        state.discrepancies.push({
          discrepancyId: `disc_price_${variance.lineNumber}_${Date.now()}`,
          type: variance.overContract ? "contract_violation" : "price_variance",
          severity,
          description: `Price variance on line ${variance.lineNumber}: expected $${variance.expectedPrice}, invoiced $${variance.invoicedPrice} (${variance.variancePercent.toFixed(1)}% difference)`,
          amount: variance.varianceAmount,
          lineItemNumber: variance.lineNumber,
          resolution: "pending",
        });
      }
    }

    // ==========================================
    // STEP 5: Handle discrepancies
    // ==========================================
    const highSeverityDiscrepancies = state.discrepancies.filter(d => d.severity === "high" && d.resolution === "pending");

    if (highSeverityDiscrepancies.length > 0) {
      state.status = "exception";
      audit("manual_review_required", {
        discrepancyCount: highSeverityDiscrepancies.length,
        types: highSeverityDiscrepancies.map(d => d.type),
      });

      // Notify AP reviewer
      await notifyApReviewer({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        vendorName: invoice.vendorName,
        totalAmount: invoice.totalAmount,
        discrepancies: state.discrepancies,
      });

      // Wait for all high-severity discrepancies to be resolved (up to 30 days)
      const resolved = await condition(
        () => {
          const pending = state.discrepancies.filter(d => d.severity === "high" && d.resolution === "pending");
          return pending.length === 0 || cancelled;
        },
        "30 days"
      );

      if (!resolved && !cancelled) {
        audit("discrepancy_resolution_timeout", {
          unresolvedCount: state.discrepancies.filter(d => d.resolution === "pending").length,
        });
      }

      // Check for rejections
      const rejectedDiscrepancies = state.discrepancies.filter(d => d.resolution === "rejected");
      if (rejectedDiscrepancies.length > 0) {
        await updateInvoiceStatus({
          invoiceId: invoice.id,
          status: "rejected",
          reason: rejectedDiscrepancies.map(d => d.description).join("; "),
        });

        return {
          status: "rejected",
          reason: `Discrepancies rejected: ${rejectedDiscrepancies.map(d => d.type).join(", ")}`,
          discrepanciesResolved: state.discrepancies.filter(d => d.resolution !== "pending").length,
          auditTrail: state.auditTrail,
        };
      }

      // Check for disputes
      const disputedDiscrepancies = state.discrepancies.filter(d => d.resolution === "disputed");
      if (disputedDiscrepancies.length > 0) {
        // Create vendor dispute
        const dispute = await createVendorDispute({
          invoiceId: invoice.id,
          vendorId: invoice.vendorId,
          vendorName: invoice.vendorName,
          discrepancies: disputedDiscrepancies,
          expectedResolution: disputedDiscrepancies.map(d => d.resolutionNotes).join("; "),
        });

        audit("vendor_dispute_created", { disputeId: dispute.disputeId });

        // Wait for dispute resolution (up to 60 days)
        const disputeResolved = await condition(
          async () => {
            const resolved = await checkDisputeResolved({ disputeId: dispute.disputeId });
            return resolved || cancelled;
          },
          "60 days"
        );

        if (disputeResolved) {
          audit("vendor_dispute_resolved", { disputeId: dispute.disputeId });
        }

        // Update payment amount based on dispute outcome
        // (Would get actual resolution details in real implementation)
      }
    }

    if (cancelled) {
      return { status: "rejected", reason: "Cancelled", auditTrail: state.auditTrail };
    }

    // ==========================================
    // STEP 6: Calculate adjustments and schedule payment
    // ==========================================
    let adjustmentTotal = 0;

    for (const discrepancy of state.discrepancies) {
      const resolution = discrepancyResolutions.get(discrepancy.discrepancyId);
      if (resolution?.action === "adjust" && resolution.adjustmentAmount) {
        adjustmentTotal += resolution.adjustmentAmount;
      }
    }

    const paymentAmount = invoice.totalAmount - adjustmentTotal;

    audit("payment_amount_calculated", {
      originalAmount: invoice.totalAmount,
      adjustments: adjustmentTotal,
      finalAmount: paymentAmount,
    });

    // Calculate payment date
    const paymentDate = await calculatePaymentDate({
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      paymentTerms: poMatch?.paymentTerms || invoice.paymentTerms || "Net 30",
      earlyPayDiscount: invoice.earlyPayDiscount,
    });

    audit("payment_scheduled", {
      paymentDate,
      paymentAmount,
      earlyPayDiscountCaptured: paymentDate.earlyPayDiscountCaptured,
    });

    // Schedule payment
    await schedulePayment({
      invoiceId: invoice.id,
      vendorId: invoice.vendorId,
      vendorName: invoice.vendorName,
      amount: paymentAmount,
      paymentDate: paymentDate.date,
      fundingSource: {
        costCenter: "", // Would come from PO
        accountCode: "",
      },
      earlyPayDiscount: paymentDate.earlyPayDiscountCaptured ? invoice.earlyPayDiscount : undefined,
    });

    // Update invoice status
    await updateInvoiceStatus({
      invoiceId: invoice.id,
      status: "approved",
      paymentAmount,
      paymentDate: paymentDate.date,
    });

    // Send payment notification to vendor
    await sendPaymentNotification({
      vendorId: invoice.vendorId,
      vendorName: invoice.vendorName,
      invoiceNumber: invoice.invoiceNumber,
      paymentAmount,
      paymentDate: paymentDate.date,
    });

    // Record audit trail to permanent storage
    audit("workflow_completed", { status: "approved", paymentAmount, paymentDate: paymentDate.date });

    await recordAuditEvent({
      workflowId: workflowInfo().workflowId,
      invoiceId: invoice.id,
      auditTrail: state.auditTrail,
    });

    return {
      status: state.discrepancies.length > 0 ? "exception" : "matched",
      paymentAmount,
      paymentDate: paymentDate.date,
      discrepanciesResolved: state.discrepancies.filter(d => d.resolution !== "pending").length,
      auditTrail: state.auditTrail,
    };

  } catch (error) {
    audit("workflow_error", { error: error instanceof Error ? error.message : "Unknown error" });
    throw error;
  }
}
