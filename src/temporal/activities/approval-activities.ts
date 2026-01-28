/**
 * Activities for Approval Routing Workflow
 */

export interface DetermineChainInput {
  amount: number;
  category: string;
  fundingSource: {
    type: string;
    grantNumber?: string;
  };
  department: string;
  universityId: string;
  exceptions?: any[];
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

export async function determineApprovalChain(input: DetermineChainInput): Promise<ApprovalStage[]> {
  const chain: ApprovalStage[] = [];
  let order = 1;

  // Supervisor always required
  chain.push({
    stageId: `stage_supervisor_${Date.now()}`,
    name: "Supervisor Approval",
    order: order++,
    approverId: "supervisor_001",
    approverName: "Dr. Sarah Johnson",
    approverEmail: "sjohnson@university.edu",
    approverRole: "supervisor",
    delegates: [],
    escalationDays: 3,
    escalateTo: "dept_head_001",
  });

  // Department Head for >$5K
  if (input.amount > 5000) {
    chain.push({
      stageId: `stage_dept_${Date.now()}`,
      name: "Department Head Approval",
      order: order++,
      approverId: "dept_head_001",
      approverName: "Prof. Michael Chen",
      approverEmail: "mchen@university.edu",
      approverRole: "department_head",
      delegates: [],
      escalationDays: 3,
      escalateTo: "dean_001",
    });
  }

  // Dean for >$25K
  if (input.amount > 25000) {
    chain.push({
      stageId: `stage_dean_${Date.now()}`,
      name: "Dean Approval",
      order: order++,
      approverId: "dean_001",
      approverName: "Dean Patricia Williams",
      approverEmail: "pwilliams@university.edu",
      approverRole: "dean",
      delegates: [],
      escalationDays: 5,
      escalateTo: "provost_001",
    });
  }

  // Provost for >$100K
  if (input.amount > 100000) {
    chain.push({
      stageId: `stage_provost_${Date.now()}`,
      name: "Provost Approval",
      order: order++,
      approverId: "provost_001",
      approverName: "Provost James Anderson",
      approverEmail: "janderson@university.edu",
      approverRole: "provost",
      delegates: [],
      escalationDays: 7,
    });
  }

  // Grant PI for grant-funded purchases
  if (input.fundingSource.type === "grant" && input.fundingSource.grantNumber) {
    chain.splice(1, 0, {
      stageId: `stage_pi_${Date.now()}`,
      name: "Grant PI Approval",
      order: 0, // Will be reordered
      approverId: "pi_001",
      approverName: "Dr. Robert Martinez",
      approverEmail: "rmartinez@university.edu",
      approverRole: "grant_pi",
      delegates: [],
      escalationDays: 3,
    });
  }

  // Reorder
  chain.forEach((stage, i) => {
    stage.order = i + 1;
  });

  return chain;
}

export async function getApprover(input: { approverId: string }): Promise<any> {
  // Would query user database
  return {
    id: input.approverId,
    name: "Approver",
    email: "approver@university.edu",
  };
}

export interface NotifyApproverInput {
  approverId: string;
  approverEmail: string;
  approverName: string;
  requisitionId: string;
  requisition: any;
  stage: ApprovalStage;
  priorApprovals: any[];
}

export async function notifyApprover(input: NotifyApproverInput): Promise<void> {
  console.log(`Notifying ${input.approverName} (${input.approverEmail}) for requisition ${input.requisitionId}`);
  // Would send email notification
}

export interface NotifyDelegateInput {
  delegateId: string;
  delegatedBy: string;
  requisitionId: string;
  stageId: string;
}

export async function notifyDelegate(input: NotifyDelegateInput): Promise<void> {
  console.log(`Notifying delegate ${input.delegateId} about delegation from ${input.delegatedBy}`);
}

export interface NotifyRequesterInput {
  requesterId: string;
  requesterEmail: string;
  requisitionId: string;
  status: string;
  reason?: string;
  rejectedBy?: string;
  returnedBy?: string;
}

export async function notifyRequester(input: NotifyRequesterInput): Promise<void> {
  console.log(`Notifying requester ${input.requesterEmail} about requisition ${input.requisitionId}: ${input.status}`);
}

export interface EscalateInput {
  stageId: string;
  requisitionId: string;
  escalateTo: string;
  reason: string;
}

export async function escalateApproval(input: EscalateInput): Promise<void> {
  console.log(`Escalating approval for requisition ${input.requisitionId} to ${input.escalateTo}`);
}

export interface AdminNotificationInput {
  requisitionId: string;
  stageId: string;
  reason: string;
}

export async function notifyProcurementAdmin(input: AdminNotificationInput): Promise<void> {
  console.log(`Notifying procurement admin about requisition ${input.requisitionId}: ${input.reason}`);
}

export interface UpdateStatusInput {
  requisitionId: string;
  status: string;
  currentApprover?: string;
  reason?: string;
}

export async function updateRequisitionStatus(input: UpdateStatusInput): Promise<void> {
  console.log(`Updating requisition ${input.requisitionId} to status ${input.status}`);
}

export interface RecordDecisionInput {
  requisitionId: string;
  stageId: string;
  decision: string;
  approver: string;
  approverName: string;
  comments?: string;
  reason?: string;
}

export async function recordApprovalDecision(input: RecordDecisionInput): Promise<void> {
  console.log(`Recording ${input.decision} decision by ${input.approverName} for requisition ${input.requisitionId}`);
}

export interface AuditEventInput {
  workflowId: string;
  requisitionId: string;
  auditTrail: any[];
}

export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  console.log(`Recording ${input.auditTrail.length} audit events for requisition ${input.requisitionId}`);
}

export interface ReminderInput {
  approverId: string;
  approverEmail: string;
  requisitionId: string;
  reminderNumber: number;
}

export async function sendApprovalReminder(input: ReminderInput): Promise<void> {
  console.log(`Sending reminder #${input.reminderNumber} to ${input.approverEmail} for requisition ${input.requisitionId}`);
}
