/**
 * Agent 5: Approval Routing Agent
 *
 * Purpose: Intelligently route requisitions through approval chains
 * Runtime: TEMPORAL (signals, queries, long-running)
 *
 * This workflow handles:
 * - Dynamic approval chain determination based on amount, category, funding
 * - Multi-stage approval with escalation
 * - Delegation support
 * - Return for revision
 * - Complete audit trail
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

import type * as activities from "../activities/approval-activities";

// Proxy activities
const {
  determineApprovalChain,
  getApprover,
  notifyApprover,
  notifyDelegate,
  notifyRequester,
  escalateApproval,
  notifyProcurementAdmin,
  updateRequisitionStatus,
  recordApprovalDecision,
  recordAuditEvent,
  sendApprovalReminder,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 3,
  },
});

// Types
export interface Requisition {
  id: string;
  universityId: string;
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  department: string;
  amount: number;
  category: string;
  fundingSource: {
    type: "grant" | "operating" | "endowment" | "gift";
    grantNumber?: string;
  };
  description: string;
}

export interface ComplianceResult {
  status: string;
  exceptions?: Array<{
    type: string;
    approvedBy?: string;
  }>;
}

export interface ApprovalStage {
  stageId: string;
  name: string;
  order: number;
  approverId: string;
  approverName: string;
  approverEmail: string;
  approverRole: string;
  delegates: string[];
  escalationDays: number;
  escalateTo?: string;
  requiredForAmountAbove?: number;
}

export interface ApprovalDecision {
  type: "approve" | "reject" | "return";
  approver: string;
  approverName: string;
  comments?: string;
  reason?: string;
  returnTo?: string;
  timestamp: number;
}

export interface CompletedApproval {
  stageId: string;
  stageName: string;
  approver: string;
  approverName: string;
  comments?: string;
  timestamp: number;
}

export interface AuditEntry {
  timestamp: string;
  action: string;
  actorId: string;
  actorName: string;
  details: any;
}

export interface ApprovalState {
  requisitionId: string;
  currentStage: string;
  currentStageIndex: number;
  approvalChain: ApprovalStage[];
  completedApprovals: CompletedApproval[];
  auditTrail: AuditEntry[];
  status: "pending" | "in_progress" | "approved" | "rejected" | "returned" | "cancelled";
}

export interface ApprovalResult {
  status: string;
  approvals?: CompletedApproval[];
  rejectedAt?: string;
  rejectedBy?: string;
  reason?: string;
  returnedTo?: string;
  auditTrail: AuditEntry[];
}

// Signals
export const approveSignal = defineSignal<[string, string, string?]>("approve"); // approver, approverName, comments
export const rejectSignal = defineSignal<[string, string, string]>("reject"); // approver, approverName, reason
export const returnSignal = defineSignal<[string, string, string, string]>("return"); // approver, approverName, reason, returnTo
export const delegateSignal = defineSignal<[string, string, string, string]>("delegate"); // from, fromName, to, reason
export const cancelSignal = defineSignal("cancel");

// Queries
export const getApprovalStatusQuery = defineQuery<ApprovalState>("getApprovalStatus");
export const getCurrentStageQuery = defineQuery<ApprovalStage | undefined>("getCurrentStage");
export const getAuditTrailQuery = defineQuery<AuditEntry[]>("getAuditTrail");
export const getPendingApproverQuery = defineQuery<string>("getPendingApprover");

/**
 * Approval Routing Workflow
 *
 * Routes requisitions through the appropriate approval chain based on:
 * - Amount thresholds
 * - Category requirements
 * - Funding source (grants require PI approval)
 * - Department hierarchy
 * - Exception approvals from compliance
 */
export async function approvalRoutingWorkflow(
  requisition: Requisition,
  complianceResult: ComplianceResult
): Promise<ApprovalResult> {
  // Initialize state
  const state: ApprovalState = {
    requisitionId: requisition.id,
    currentStage: "initial",
    currentStageIndex: 0,
    approvalChain: [],
    completedApprovals: [],
    auditTrail: [],
    status: "pending",
  };

  let cancelled = false;
  let currentDecision: ApprovalDecision | null = null;

  // Helper function to add audit entries
  const audit = (action: string, actorId: string, actorName: string, details: any) => {
    state.auditTrail.push({
      timestamp: new Date().toISOString(),
      action,
      actorId,
      actorName,
      details,
    });
  };

  // Setup signal handlers
  setHandler(cancelSignal, () => {
    cancelled = true;
    audit("workflow_cancelled", "system", "System", { reason: "Workflow cancelled" });
  });

  setHandler(approveSignal, (approver: string, approverName: string, comments?: string) => {
    const currentStage = state.approvalChain[state.currentStageIndex];
    if (currentStage && (approver === currentStage.approverId || currentStage.delegates.includes(approver))) {
      currentDecision = {
        type: "approve",
        approver,
        approverName,
        comments,
        timestamp: Date.now(),
      };
      audit("approval_received", approver, approverName, { stageId: currentStage.stageId, comments });
    }
  });

  setHandler(rejectSignal, (approver: string, approverName: string, reason: string) => {
    const currentStage = state.approvalChain[state.currentStageIndex];
    if (currentStage && (approver === currentStage.approverId || currentStage.delegates.includes(approver))) {
      currentDecision = {
        type: "reject",
        approver,
        approverName,
        reason,
        timestamp: Date.now(),
      };
      audit("rejection_received", approver, approverName, { stageId: currentStage.stageId, reason });
    }
  });

  setHandler(returnSignal, (approver: string, approverName: string, reason: string, returnTo: string) => {
    const currentStage = state.approvalChain[state.currentStageIndex];
    if (currentStage && (approver === currentStage.approverId || currentStage.delegates.includes(approver))) {
      currentDecision = {
        type: "return",
        approver,
        approverName,
        reason,
        returnTo,
        timestamp: Date.now(),
      };
      audit("return_received", approver, approverName, { stageId: currentStage.stageId, reason, returnTo });
    }
  });

  setHandler(delegateSignal, (from: string, fromName: string, to: string, reason: string) => {
    const currentStage = state.approvalChain[state.currentStageIndex];
    if (currentStage && from === currentStage.approverId) {
      currentStage.delegates.push(to);
      audit("delegation", from, fromName, { to, reason });
      // Notify delegate asynchronously
      notifyDelegate({
        delegateId: to,
        delegatedBy: fromName,
        requisitionId: requisition.id,
        stageId: currentStage.stageId,
      }).catch(() => {});
    }
  });

  // Setup query handlers
  setHandler(getApprovalStatusQuery, () => state);
  setHandler(getCurrentStageQuery, () => state.approvalChain[state.currentStageIndex]);
  setHandler(getAuditTrailQuery, () => state.auditTrail);
  setHandler(getPendingApproverQuery, () => {
    const stage = state.approvalChain[state.currentStageIndex];
    return stage?.approverEmail || "";
  });

  audit("workflow_started", "system", "System", { requisitionId: requisition.id, amount: requisition.amount });

  try {
    // Determine approval chain based on requisition characteristics
    state.approvalChain = await determineApprovalChain({
      amount: requisition.amount,
      category: requisition.category,
      fundingSource: requisition.fundingSource,
      department: requisition.department,
      universityId: requisition.universityId,
      exceptions: complianceResult.exceptions,
    });

    audit("approval_chain_determined", "system", "System", {
      stages: state.approvalChain.map(s => ({ stageId: s.stageId, name: s.name, approver: s.approverName })),
    });

    /*
    Example approval chains:

    $0 - $5,000:        Supervisor only
    $5,001 - $25,000:   Supervisor → Department Head
    $25,001 - $100,000: Supervisor → Department Head → Dean
    $100,001+:          Supervisor → Department Head → Dean → Provost

    Grant funds:        Add Grant PI and Office of Sponsored Programs
    Capital equipment:  Add Facilities
    IT purchases:       Add IT Security
    */

    state.status = "in_progress";

    // Update requisition status
    await updateRequisitionStatus({
      requisitionId: requisition.id,
      status: "pending_approval",
      currentApprover: state.approvalChain[0]?.approverName,
    });

    // Process each approval stage
    for (let i = 0; i < state.approvalChain.length; i++) {
      if (cancelled) {
        state.status = "cancelled";
        return { status: "cancelled", auditTrail: state.auditTrail };
      }

      const stage = state.approvalChain[i];
      state.currentStage = stage.name;
      state.currentStageIndex = i;
      currentDecision = null;

      audit("stage_started", "system", "System", {
        stageId: stage.stageId,
        stageName: stage.name,
        approver: stage.approverName,
      });

      // Notify approver
      await notifyApprover({
        approverId: stage.approverId,
        approverEmail: stage.approverEmail,
        approverName: stage.approverName,
        requisitionId: requisition.id,
        requisition,
        stage,
        priorApprovals: state.completedApprovals,
      });

      // Wait for decision with escalation
      const escalationDays = stage.escalationDays || 3;
      let remindersSent = 0;
      const maxReminders = 3;

      while (!currentDecision && !cancelled) {
        // Wait for signal or timeout
        const gotDecision = await condition(
          () => currentDecision !== null || cancelled,
          `${escalationDays} days`
        );

        if (!gotDecision && !cancelled) {
          remindersSent++;

          if (remindersSent <= maxReminders) {
            // Send reminder
            audit("reminder_sent", "system", "System", {
              stageId: stage.stageId,
              reminderNumber: remindersSent,
            });

            await sendApprovalReminder({
              approverId: stage.approverId,
              approverEmail: stage.approverEmail,
              requisitionId: requisition.id,
              reminderNumber: remindersSent,
            });
          } else if (stage.escalateTo) {
            // Escalate
            audit("auto_escalation", "system", "System", {
              stageId: stage.stageId,
              reason: "timeout",
              escalateTo: stage.escalateTo,
            });

            await escalateApproval({
              stageId: stage.stageId,
              requisitionId: requisition.id,
              escalateTo: stage.escalateTo,
              reason: "Approval timeout after multiple reminders",
            });

            // Add escalation target as delegate
            stage.delegates.push(stage.escalateTo);
          } else {
            // Final escalation to procurement admin
            await notifyProcurementAdmin({
              requisitionId: requisition.id,
              stageId: stage.stageId,
              reason: "Approval timeout - requires admin intervention",
            });

            // Wait one more week
            await condition(
              () => currentDecision !== null || cancelled,
              "7 days"
            );

            if (!currentDecision) {
              // Still no decision - auto-reject
              currentDecision = {
                type: "reject",
                approver: "system",
                approverName: "System (Timeout)",
                reason: "Approval timeout - no response received",
                timestamp: Date.now(),
              };
            }
          }
        }
      }

      if (cancelled) {
        state.status = "cancelled";
        return { status: "cancelled", auditTrail: state.auditTrail };
      }

      // Process decision
      if (currentDecision!.type === "reject") {
        state.status = "rejected";

        // Record rejection
        await recordApprovalDecision({
          requisitionId: requisition.id,
          stageId: stage.stageId,
          decision: "rejected",
          approver: currentDecision!.approver,
          approverName: currentDecision!.approverName,
          reason: currentDecision!.reason,
        });

        // Update requisition status
        await updateRequisitionStatus({
          requisitionId: requisition.id,
          status: "rejected",
          reason: currentDecision!.reason,
        });

        // Notify requester
        await notifyRequester({
          requesterId: requisition.requesterId,
          requesterEmail: requisition.requesterEmail,
          requisitionId: requisition.id,
          status: "rejected",
          reason: currentDecision!.reason,
          rejectedBy: currentDecision!.approverName,
        });

        audit("workflow_completed", "system", "System", { status: "rejected" });

        return {
          status: "rejected",
          rejectedAt: stage.name,
          rejectedBy: currentDecision!.approverName,
          reason: currentDecision!.reason,
          auditTrail: state.auditTrail,
        };
      }

      if (currentDecision!.type === "return") {
        state.status = "returned";

        // Update requisition status
        await updateRequisitionStatus({
          requisitionId: requisition.id,
          status: "returned",
          reason: currentDecision!.reason,
        });

        // Notify requester
        await notifyRequester({
          requesterId: requisition.requesterId,
          requesterEmail: requisition.requesterEmail,
          requisitionId: requisition.id,
          status: "returned",
          reason: currentDecision!.reason,
          returnedBy: currentDecision!.approverName,
        });

        audit("workflow_completed", "system", "System", { status: "returned" });

        return {
          status: "returned",
          returnedTo: currentDecision!.returnTo || requisition.requesterName,
          reason: currentDecision!.reason,
          auditTrail: state.auditTrail,
        };
      }

      // Approval received
      state.completedApprovals.push({
        stageId: stage.stageId,
        stageName: stage.name,
        approver: currentDecision!.approver,
        approverName: currentDecision!.approverName,
        comments: currentDecision!.comments,
        timestamp: currentDecision!.timestamp,
      });

      // Record approval
      await recordApprovalDecision({
        requisitionId: requisition.id,
        stageId: stage.stageId,
        decision: "approved",
        approver: currentDecision!.approver,
        approverName: currentDecision!.approverName,
        comments: currentDecision!.comments,
      });

      // Update requisition with current approver
      if (i < state.approvalChain.length - 1) {
        await updateRequisitionStatus({
          requisitionId: requisition.id,
          status: "pending_approval",
          currentApprover: state.approvalChain[i + 1]?.approverName,
        });
      }
    }

    // All approvals complete
    state.status = "approved";

    audit("all_approvals_complete", "system", "System", {
      approvals: state.completedApprovals.map(a => ({ stage: a.stageName, approver: a.approverName })),
    });

    // Update requisition status
    await updateRequisitionStatus({
      requisitionId: requisition.id,
      status: "approved",
    });

    // Notify requester
    await notifyRequester({
      requesterId: requisition.requesterId,
      requesterEmail: requisition.requesterEmail,
      requisitionId: requisition.id,
      status: "approved",
    });

    // Record audit trail to permanent storage
    await recordAuditEvent({
      workflowId: workflowInfo().workflowId,
      requisitionId: requisition.id,
      auditTrail: state.auditTrail,
    });

    return {
      status: "approved",
      approvals: state.completedApprovals,
      auditTrail: state.auditTrail,
    };

  } catch (error) {
    audit("workflow_error", "system", "System", { error: error instanceof Error ? error.message : "Unknown error" });
    throw error;
  }
}
