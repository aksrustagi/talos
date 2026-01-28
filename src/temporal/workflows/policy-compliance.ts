/**
 * Agent 4: Policy Compliance Agent
 *
 * Purpose: Ensure all purchases comply with federal, state, and institutional policies
 * Runtime: TEMPORAL (audit trail required)
 *
 * This is a compliance-critical workflow that requires:
 * - Complete audit trail for federal auditors
 * - Signal handling for exception approvals
 * - Query support for real-time status
 * - Durable execution for multi-day exception handling
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

import type * as activities from "../activities/compliance-activities";

// Proxy activities
const {
  loadGrantRestrictions,
  checkSpendingThresholds,
  checkVendorCompliance,
  checkBiddingRequirements,
  runPolicyEngine,
  getApplicablePolicies,
  notifyExceptionApprovers,
  recordAuditEvent,
  updateRequisitionStatus,
  notifyRequester,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    nonRetryableErrorTypes: ["ValidationError"],
  },
});

// Types
export interface Requisition {
  id: string;
  universityId: string;
  requesterId: string;
  department: string;
  amount: number;
  category: string;
  vendor: {
    id: string;
    name: string;
    samUei?: string;
  };
  fundingSource: {
    type: "grant" | "operating" | "endowment" | "gift";
    grantNumber?: string;
    costCenter: string;
    accountCode: string;
  };
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
  }>;
  solesourceJustification?: string;
}

export interface ComplianceCheck {
  checkId: string;
  type: string;
  status: "passed" | "failed" | "warning" | "skipped";
  details: any;
  checkedAt: number;
}

export interface Exception {
  id: string;
  type: string;
  reason: string;
  requiredApprover: string;
  status: "pending" | "approved" | "rejected";
  approvedBy?: string;
  approvedAt?: number;
  justification?: string;
  rejectionReason?: string;
}

export interface AuditEntry {
  timestamp: string;
  workflowId: string;
  action: string;
  details: any;
}

export interface ComplianceState {
  requisitionId: string;
  checks: ComplianceCheck[];
  overallStatus: "pending" | "compliant" | "violation" | "exception_pending" | "exception_approved";
  exceptions: Exception[];
  auditTrail: AuditEntry[];
}

export interface ComplianceResult {
  status: string;
  checks?: ComplianceCheck[];
  exceptions?: Exception[];
  reason?: string;
  auditTrail: AuditEntry[];
}

// Signals for exception handling
export const approveExceptionSignal = defineSignal<[string, string, string]>("approveException");
export const rejectExceptionSignal = defineSignal<[string, string]>("rejectException");
export const cancelWorkflowSignal = defineSignal("cancelWorkflow");

// Queries for auditors
export const getComplianceStatusQuery = defineQuery<ComplianceState>("getComplianceStatus");
export const getAuditTrailQuery = defineQuery<AuditEntry[]>("getAuditTrail");
export const getChecksQuery = defineQuery<ComplianceCheck[]>("getChecks");
export const getExceptionsQuery = defineQuery<Exception[]>("getExceptions");

/**
 * Policy Compliance Workflow
 *
 * Performs comprehensive compliance checking for requisitions with full audit trail.
 * Supports exception handling with multi-day approval waits.
 */
export async function policyComplianceWorkflow(
  requisition: Requisition
): Promise<ComplianceResult> {
  // Initialize state
  const state: ComplianceState = {
    requisitionId: requisition.id,
    checks: [],
    overallStatus: "pending",
    exceptions: [],
    auditTrail: [],
  };

  let cancelled = false;

  // Helper function to add audit entries
  const audit = (action: string, details: any) => {
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      workflowId: workflowInfo().workflowId,
      action,
      details,
    };
    state.auditTrail.push(entry);
  };

  // Setup signal handlers
  setHandler(cancelWorkflowSignal, () => {
    cancelled = true;
    audit("workflow_cancelled", { reason: "User cancelled" });
  });

  setHandler(approveExceptionSignal, (exceptionId: string, approver: string, justification: string) => {
    const exception = state.exceptions.find(e => e.id === exceptionId);
    if (exception && exception.status === "pending") {
      exception.status = "approved";
      exception.approvedBy = approver;
      exception.justification = justification;
      exception.approvedAt = Date.now();
      audit("exception_approved", { exceptionId, approver, justification });
    }
  });

  setHandler(rejectExceptionSignal, (exceptionId: string, reason: string) => {
    const exception = state.exceptions.find(e => e.id === exceptionId);
    if (exception && exception.status === "pending") {
      exception.status = "rejected";
      exception.rejectionReason = reason;
      audit("exception_rejected", { exceptionId, reason });
    }
  });

  // Setup query handlers
  setHandler(getComplianceStatusQuery, () => state);
  setHandler(getAuditTrailQuery, () => state.auditTrail);
  setHandler(getChecksQuery, () => state.checks);
  setHandler(getExceptionsQuery, () => state.exceptions);

  audit("workflow_started", { requisition: { id: requisition.id, amount: requisition.amount } });

  try {
    // ==========================================
    // CHECK 1: Grant/Fund Restrictions
    // ==========================================
    if (requisition.fundingSource.type === "grant" && requisition.fundingSource.grantNumber) {
      audit("grant_check_started", { grantNumber: requisition.fundingSource.grantNumber });

      const grantCheck = await loadGrantRestrictions({
        grantNumber: requisition.fundingSource.grantNumber,
        expenseCategory: requisition.category,
        amount: requisition.amount,
        vendorId: requisition.vendor.id,
      });

      audit("grant_check_completed", grantCheck);

      state.checks.push({
        checkId: `grant_${Date.now()}`,
        type: "grant_restrictions",
        status: grantCheck.compliant ? "passed" : "failed",
        details: grantCheck,
        checkedAt: Date.now(),
      });

      if (!grantCheck.compliant) {
        if (grantCheck.exceptionPossible) {
          const exceptionId = `exc_grant_${Date.now()}`;
          state.exceptions.push({
            id: exceptionId,
            type: "grant_exception",
            reason: grantCheck.violationReason || "Grant restriction violation",
            requiredApprover: grantCheck.exceptionApprover || "grant_pi",
            status: "pending",
          });
          audit("exception_created", { exceptionId, type: "grant_exception" });
        } else {
          state.overallStatus = "violation";
          audit("hard_violation", { check: "grant_restrictions", reason: grantCheck.violationReason });

          await updateRequisitionStatus({
            requisitionId: requisition.id,
            status: "compliance_violation",
            reason: grantCheck.violationReason,
          });

          await notifyRequester({
            requisitionId: requisition.id,
            requesterId: requisition.requesterId,
            status: "violation",
            reason: grantCheck.violationReason || "Grant restriction violation",
          });

          return {
            status: "violation",
            reason: grantCheck.violationReason,
            checks: state.checks,
            auditTrail: state.auditTrail,
          };
        }
      }
    }

    if (cancelled) {
      return { status: "cancelled", auditTrail: state.auditTrail };
    }

    // ==========================================
    // CHECK 2: Spending Thresholds
    // ==========================================
    audit("threshold_check_started", { amount: requisition.amount });

    const thresholdCheck = await checkSpendingThresholds({
      amount: requisition.amount,
      category: requisition.category,
      department: requisition.department,
      universityId: requisition.universityId,
    });

    audit("threshold_check_completed", thresholdCheck);

    state.checks.push({
      checkId: `threshold_${Date.now()}`,
      type: "spending_threshold",
      status: thresholdCheck.compliant ? "passed" : "warning",
      details: thresholdCheck,
      checkedAt: Date.now(),
    });

    if (!thresholdCheck.compliant) {
      // Threshold violations require additional approvals, handled by approval routing
      audit("threshold_exceeded", {
        amount: requisition.amount,
        threshold: thresholdCheck.threshold,
        requiredApprovalLevel: thresholdCheck.requiredApprovalLevel,
      });
    }

    // ==========================================
    // CHECK 3: Vendor Compliance
    // ==========================================
    audit("vendor_check_started", { vendorId: requisition.vendor.id });

    const vendorCheck = await checkVendorCompliance({
      vendorId: requisition.vendor.id,
      amount: requisition.amount,
      category: requisition.category,
      fundingType: requisition.fundingSource.type,
    });

    audit("vendor_check_completed", vendorCheck);

    state.checks.push({
      checkId: `vendor_${Date.now()}`,
      type: "vendor_compliance",
      status: vendorCheck.compliant ? "passed" : "failed",
      details: vendorCheck,
      checkedAt: Date.now(),
    });

    if (!vendorCheck.compliant) {
      // SAM.gov registration is a hard requirement for federal funds
      if (vendorCheck.issues?.includes("not_in_sam") && requisition.fundingSource.type === "grant") {
        state.overallStatus = "violation";
        audit("sam_violation", { vendor: requisition.vendor.name });

        await updateRequisitionStatus({
          requisitionId: requisition.id,
          status: "compliance_violation",
          reason: "Vendor not registered in SAM.gov - required for federal funds",
        });

        await notifyRequester({
          requisitionId: requisition.id,
          requesterId: requisition.requesterId,
          status: "violation",
          reason: "Vendor not registered in SAM.gov",
        });

        return {
          status: "violation",
          reason: "Vendor not registered in SAM.gov - required for federal funds",
          checks: state.checks,
          auditTrail: state.auditTrail,
        };
      }

      // Debarment is always a hard stop
      if (vendorCheck.issues?.includes("debarred")) {
        state.overallStatus = "violation";
        audit("debarment_violation", { vendor: requisition.vendor.name });

        await updateRequisitionStatus({
          requisitionId: requisition.id,
          status: "compliance_violation",
          reason: "Vendor is debarred from contracting",
        });

        return {
          status: "violation",
          reason: "Vendor is debarred from federal/state contracting",
          checks: state.checks,
          auditTrail: state.auditTrail,
        };
      }
    }

    if (cancelled) {
      return { status: "cancelled", auditTrail: state.auditTrail };
    }

    // ==========================================
    // CHECK 4: Competitive Bidding Requirements
    // ==========================================
    audit("bidding_check_started", { amount: requisition.amount });

    const biddingCheck = await checkBiddingRequirements({
      amount: requisition.amount,
      category: requisition.category,
      solesourceJustification: requisition.solesourceJustification,
      universityId: requisition.universityId,
    });

    audit("bidding_check_completed", biddingCheck);

    state.checks.push({
      checkId: `bidding_${Date.now()}`,
      type: "competitive_bidding",
      status: biddingCheck.compliant ? "passed" : "warning",
      details: biddingCheck,
      checkedAt: Date.now(),
    });

    if (!biddingCheck.compliant && !requisition.solesourceJustification) {
      const exceptionId = `exc_bidding_${Date.now()}`;
      state.exceptions.push({
        id: exceptionId,
        type: "sole_source_exception",
        reason: `Purchase of $${requisition.amount} exceeds competitive bidding threshold of $${biddingCheck.threshold}`,
        requiredApprover: biddingCheck.exceptionApprover || "procurement_director",
        status: "pending",
      });
      audit("exception_created", { exceptionId, type: "sole_source_exception" });
    }

    // ==========================================
    // CHECK 5: Policy-Specific Rules
    // ==========================================
    audit("policy_check_started", {});

    const applicablePolicies = await getApplicablePolicies({
      universityId: requisition.universityId,
      category: requisition.category,
      amount: requisition.amount,
      fundingType: requisition.fundingSource.type,
    });

    const policyCheck = await runPolicyEngine({
      requisition,
      policies: applicablePolicies,
    });

    audit("policy_check_completed", policyCheck);

    for (const result of policyCheck.results || []) {
      state.checks.push({
        checkId: `policy_${result.policyId}_${Date.now()}`,
        type: `policy_${result.policyId}`,
        status: result.compliant ? "passed" : "failed",
        details: result,
        checkedAt: Date.now(),
      });

      if (!result.compliant && result.exceptionPossible) {
        const exceptionId = `exc_policy_${result.policyId}_${Date.now()}`;
        state.exceptions.push({
          id: exceptionId,
          type: "policy_exception",
          reason: result.violationReason || `Policy ${result.policyId} violation`,
          requiredApprover: result.exceptionApprover || "policy_admin",
          status: "pending",
        });
        audit("exception_created", { exceptionId, type: "policy_exception", policyId: result.policyId });
      }
    }

    // ==========================================
    // HANDLE EXCEPTIONS (if any)
    // ==========================================
    const pendingExceptions = state.exceptions.filter(e => e.status === "pending");

    if (pendingExceptions.length > 0) {
      state.overallStatus = "exception_pending";
      audit("exceptions_pending", { count: pendingExceptions.length });

      // Notify exception approvers
      await notifyExceptionApprovers({
        requisitionId: requisition.id,
        exceptions: pendingExceptions,
      });

      // Wait for all exceptions to be resolved (up to 14 days)
      const resolved = await condition(
        () => state.exceptions.every(e => e.status !== "pending") || cancelled,
        "14 days"
      );

      if (!resolved) {
        // Timeout - escalate
        audit("exception_timeout", { unresolved: state.exceptions.filter(e => e.status === "pending").length });
      }

      // Check results
      const rejectedExceptions = state.exceptions.filter(e => e.status === "rejected");
      if (rejectedExceptions.length > 0) {
        state.overallStatus = "violation";
        const reasons = rejectedExceptions.map(e => e.rejectionReason || e.reason).join("; ");

        await updateRequisitionStatus({
          requisitionId: requisition.id,
          status: "compliance_violation",
          reason: `Exception(s) rejected: ${reasons}`,
        });

        await notifyRequester({
          requisitionId: requisition.id,
          requesterId: requisition.requesterId,
          status: "violation",
          reason: `Exception(s) rejected: ${reasons}`,
        });

        return {
          status: "violation",
          reason: `Exception(s) rejected: ${reasons}`,
          checks: state.checks,
          exceptions: state.exceptions,
          auditTrail: state.auditTrail,
        };
      }

      state.overallStatus = "exception_approved";
    } else {
      state.overallStatus = "compliant";
    }

    // Record final audit event
    audit("workflow_completed", { status: state.overallStatus });

    // Record audit trail to permanent storage
    await recordAuditEvent({
      workflowId: workflowInfo().workflowId,
      requisitionId: requisition.id,
      auditTrail: state.auditTrail,
    });

    // Update requisition status
    await updateRequisitionStatus({
      requisitionId: requisition.id,
      status: "compliance_passed",
      reason: null,
    });

    return {
      status: state.overallStatus,
      checks: state.checks,
      exceptions: state.exceptions,
      auditTrail: state.auditTrail,
    };

  } catch (error) {
    audit("workflow_error", { error: error instanceof Error ? error.message : "Unknown error" });
    state.overallStatus = "violation";
    throw error;
  }
}
