/**
 * Activities for Policy Compliance Workflow
 */

export interface GrantCheckInput {
  grantNumber: string;
  expenseCategory: string;
  amount: number;
  vendorId: string;
}

export interface GrantCheckResult {
  compliant: boolean;
  violationReason?: string;
  exceptionPossible?: boolean;
  exceptionApprover?: string;
  allowableCategories?: string[];
  restrictedCategories?: string[];
}

export async function loadGrantRestrictions(input: GrantCheckInput): Promise<GrantCheckResult> {
  // This would query the grant database for restrictions
  // Mock implementation
  const restrictedCategories = ["travel", "entertainment", "alcohol"];
  const isRestricted = restrictedCategories.includes(input.expenseCategory.toLowerCase());

  return {
    compliant: !isRestricted,
    violationReason: isRestricted ? `Category "${input.expenseCategory}" is restricted for this grant` : undefined,
    exceptionPossible: isRestricted,
    exceptionApprover: "grant_pi",
    allowableCategories: ["supplies", "equipment", "services", "personnel"],
    restrictedCategories,
  };
}

export interface ThresholdCheckInput {
  amount: number;
  category: string;
  department: string;
  universityId: string;
}

export interface ThresholdCheckResult {
  compliant: boolean;
  threshold?: number;
  requiredApprovalLevel?: string;
}

export async function checkSpendingThresholds(input: ThresholdCheckInput): Promise<ThresholdCheckResult> {
  // Threshold rules
  const thresholds = [
    { max: 5000, approvalLevel: "supervisor" },
    { max: 25000, approvalLevel: "department_head" },
    { max: 100000, approvalLevel: "dean" },
    { max: Infinity, approvalLevel: "provost" },
  ];

  const applicable = thresholds.find(t => input.amount <= t.max);

  return {
    compliant: input.amount <= 5000, // Auto-approve under $5K
    threshold: applicable?.max,
    requiredApprovalLevel: applicable?.approvalLevel,
  };
}

export interface VendorComplianceInput {
  vendorId: string;
  amount: number;
  category: string;
  fundingType: string;
}

export interface VendorComplianceResult {
  compliant: boolean;
  issues?: string[];
  samRegistered?: boolean;
  debarred?: boolean;
}

export async function checkVendorCompliance(input: VendorComplianceInput): Promise<VendorComplianceResult> {
  // This would check SAM.gov and debarment lists
  // Mock implementation - assume compliant
  return {
    compliant: true,
    samRegistered: true,
    debarred: false,
  };
}

export interface BiddingCheckInput {
  amount: number;
  category: string;
  solesourceJustification?: string;
  universityId: string;
}

export interface BiddingCheckResult {
  compliant: boolean;
  threshold?: number;
  exceptionApprover?: string;
  bidsRequired?: number;
}

export async function checkBiddingRequirements(input: BiddingCheckInput): Promise<BiddingCheckResult> {
  // Competitive bidding thresholds
  const biddingThreshold = 10000; // $10K requires competitive bids
  const needsBids = input.amount >= biddingThreshold && !input.solesourceJustification;

  return {
    compliant: !needsBids,
    threshold: biddingThreshold,
    exceptionApprover: "procurement_director",
    bidsRequired: needsBids ? 3 : 0,
  };
}

export interface PolicyInput {
  universityId: string;
  category: string;
  amount: number;
  fundingType: string;
}

export async function getApplicablePolicies(input: PolicyInput): Promise<any[]> {
  // Return applicable policies based on context
  return [
    { policyId: "IT_SECURITY", name: "IT Security Review", appliesTo: ["technology", "software"] },
    { policyId: "HAZMAT", name: "Hazardous Materials", appliesTo: ["chemicals", "biologicals"] },
  ];
}

export interface PolicyEngineInput {
  requisition: any;
  policies: any[];
}

export interface PolicyEngineResult {
  results: Array<{
    policyId: string;
    compliant: boolean;
    violationReason?: string;
    exceptionPossible?: boolean;
    exceptionApprover?: string;
  }>;
}

export async function runPolicyEngine(input: PolicyEngineInput): Promise<PolicyEngineResult> {
  // Evaluate each policy
  const results = input.policies.map(policy => {
    const categoryMatch = policy.appliesTo?.includes(input.requisition.category?.toLowerCase());
    return {
      policyId: policy.policyId,
      compliant: !categoryMatch, // Simplified - would do actual policy evaluation
      violationReason: categoryMatch ? `Requires ${policy.name} review` : undefined,
      exceptionPossible: true,
      exceptionApprover: "policy_admin",
    };
  });

  return { results };
}

export interface ExceptionNotificationInput {
  requisitionId: string;
  exceptions: any[];
}

export async function notifyExceptionApprovers(input: ExceptionNotificationInput): Promise<void> {
  // Send notifications to exception approvers
  console.log(`Notifying approvers for ${input.exceptions.length} exceptions on requisition ${input.requisitionId}`);
}

export interface AuditEventInput {
  workflowId: string;
  requisitionId: string;
  auditTrail: any[];
}

export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  // Store audit trail to permanent storage (Convex/Neon)
  console.log(`Recording ${input.auditTrail.length} audit events for requisition ${input.requisitionId}`);
}

export interface RequisitionStatusInput {
  requisitionId: string;
  status: string;
  reason?: string | null;
}

export async function updateRequisitionStatus(input: RequisitionStatusInput): Promise<void> {
  // Update requisition status in Convex
  console.log(`Updating requisition ${input.requisitionId} to status ${input.status}`);
}

export interface RequesterNotificationInput {
  requisitionId: string;
  requesterId: string;
  status: string;
  reason?: string;
}

export async function notifyRequester(input: RequesterNotificationInput): Promise<void> {
  // Send notification to requester
  console.log(`Notifying requester ${input.requesterId} about requisition ${input.requisitionId}: ${input.status}`);
}
