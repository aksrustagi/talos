import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create requisition
export const create = mutation({
  args: {
    universityId: v.id("universities"),
    requesterId: v.id("users"),
    department: v.string(),
    budgetCode: v.string(),
    grantNumber: v.optional(v.string()),
    urgency: v.optional(
      v.union(v.literal("standard"), v.literal("rush"), v.literal("emergency"))
    ),
    neededByDate: v.optional(v.number()),
    justification: v.optional(v.string()),
    sourceChannel: v.optional(
      v.union(
        v.literal("web"),
        v.literal("email"),
        v.literal("slack"),
        v.literal("api")
      )
    ),
    originalRequest: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Generate requisition number
    const count = await ctx.db
      .query("requisitions")
      .withIndex("by_university", (q) => q.eq("universityId", args.universityId))
      .collect();
    const reqNumber = `REQ-${new Date().getFullYear()}-${String(count.length + 1).padStart(5, "0")}`;

    const requisitionId = await ctx.db.insert("requisitions", {
      universityId: args.universityId,
      requesterId: args.requesterId,
      requisitionNumber: reqNumber,
      status: "draft",
      urgency: args.urgency || "standard",
      neededByDate: args.neededByDate,
      department: args.department,
      budgetCode: args.budgetCode,
      grantNumber: args.grantNumber,
      justification: args.justification,
      subtotal: 0,
      shippingCost: 0,
      taxAmount: 0,
      totalAmount: 0,
      sourceChannel: args.sourceChannel || "web",
      originalRequest: args.originalRequest,
      createdAt: now,
      updatedAt: now,
    });

    return { requisitionId, requisitionNumber: reqNumber };
  },
});

// Add line item to requisition
export const addLineItem = mutation({
  args: {
    requisitionId: v.id("requisitions"),
    productId: v.optional(v.id("products")),
    vendorListingId: v.optional(v.id("vendorListings")),
    description: v.string(),
    quantity: v.number(),
    unitPrice: v.number(),
    vendorId: v.optional(v.id("vendors")),
    vendorSku: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const requisition = await ctx.db.get(args.requisitionId);
    if (!requisition) throw new Error("Requisition not found");

    // Get existing line items to determine line number
    const existingItems = await ctx.db
      .query("requisitionLineItems")
      .withIndex("by_requisition", (q) =>
        q.eq("requisitionId", args.requisitionId)
      )
      .collect();

    const lineNumber = existingItems.length + 1;
    const extendedPrice = args.quantity * args.unitPrice;

    const lineItemId = await ctx.db.insert("requisitionLineItems", {
      requisitionId: args.requisitionId,
      lineNumber,
      productId: args.productId,
      vendorListingId: args.vendorListingId,
      description: args.description,
      quantity: args.quantity,
      unitPrice: args.unitPrice,
      extendedPrice,
      vendorId: args.vendorId,
      vendorSku: args.vendorSku,
      alternativesAvailable: false,
      createdAt: Date.now(),
    });

    // Update requisition totals
    const newSubtotal = requisition.subtotal + extendedPrice;
    const newTotal = newSubtotal + requisition.shippingCost + requisition.taxAmount;

    await ctx.db.patch(args.requisitionId, {
      subtotal: newSubtotal,
      totalAmount: newTotal,
      updatedAt: Date.now(),
    });

    return lineItemId;
  },
});

// Submit requisition for approval
export const submit = mutation({
  args: { requisitionId: v.id("requisitions") },
  handler: async (ctx, args) => {
    const requisition = await ctx.db.get(args.requisitionId);
    if (!requisition) throw new Error("Requisition not found");
    if (requisition.status !== "draft") {
      throw new Error("Requisition is not in draft status");
    }

    const now = Date.now();

    // Get university settings for auto-approval
    const university = await ctx.db.get(requisition.universityId);
    if (!university) throw new Error("University not found");

    // Check if auto-approve
    if (requisition.totalAmount <= university.settings.autoApprovalLimit) {
      await ctx.db.patch(args.requisitionId, {
        status: "approved",
        submittedAt: now,
        approvedAt: now,
        updatedAt: now,
      });
      return { status: "approved", message: "Auto-approved" };
    }

    // Determine approval workflow based on amount
    await ctx.db.patch(args.requisitionId, {
      status: "pending_approval",
      submittedAt: now,
      updatedAt: now,
    });

    // Create approval records (simplified - would normally look up approvers)
    const requester = await ctx.db.get(requisition.requesterId);
    if (requester) {
      // For now, create a single pending approval
      await ctx.db.insert("approvals", {
        requisitionId: args.requisitionId,
        approverId: requisition.requesterId, // Placeholder - would be actual approver
        step: 1,
        approverRole: "manager",
        status: "pending",
        dueAt: now + 48 * 60 * 60 * 1000, // 48 hours
        remindersSent: 0,
        createdAt: now,
      });
    }

    return { status: "pending_approval", message: "Submitted for approval" };
  },
});

// Approve requisition
export const approve = mutation({
  args: {
    requisitionId: v.id("requisitions"),
    approverId: v.id("users"),
    comments: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const requisition = await ctx.db.get(args.requisitionId);
    if (!requisition) throw new Error("Requisition not found");

    const now = Date.now();

    // Find pending approval for this approver
    const approval = await ctx.db
      .query("approvals")
      .withIndex("by_approver", (q) =>
        q.eq("approverId", args.approverId).eq("status", "pending")
      )
      .filter((q) => q.eq(q.field("requisitionId"), args.requisitionId))
      .first();

    if (approval) {
      await ctx.db.patch(approval._id, {
        status: "approved",
        comments: args.comments,
        actionAt: now,
      });
    }

    // Check if all approvals are done
    const pendingApprovals = await ctx.db
      .query("approvals")
      .withIndex("by_requisition", (q) => q.eq("requisitionId", args.requisitionId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    if (pendingApprovals.length === 0) {
      await ctx.db.patch(args.requisitionId, {
        status: "approved",
        approvedAt: now,
        updatedAt: now,
      });
    }

    return args.requisitionId;
  },
});

// Reject requisition
export const reject = mutation({
  args: {
    requisitionId: v.id("requisitions"),
    approverId: v.id("users"),
    comments: v.string(),
  },
  handler: async (ctx, args) => {
    const requisition = await ctx.db.get(args.requisitionId);
    if (!requisition) throw new Error("Requisition not found");

    const now = Date.now();

    // Update approval record
    const approval = await ctx.db
      .query("approvals")
      .withIndex("by_approver", (q) =>
        q.eq("approverId", args.approverId).eq("status", "pending")
      )
      .filter((q) => q.eq(q.field("requisitionId"), args.requisitionId))
      .first();

    if (approval) {
      await ctx.db.patch(approval._id, {
        status: "rejected",
        comments: args.comments,
        actionAt: now,
      });
    }

    await ctx.db.patch(args.requisitionId, {
      status: "rejected",
      updatedAt: now,
    });

    return args.requisitionId;
  },
});

// Get requisition with line items
export const getWithItems = query({
  args: { requisitionId: v.id("requisitions") },
  handler: async (ctx, args) => {
    const requisition = await ctx.db.get(args.requisitionId);
    if (!requisition) return null;

    const lineItems = await ctx.db
      .query("requisitionLineItems")
      .withIndex("by_requisition", (q) => q.eq("requisitionId", args.requisitionId))
      .collect();

    // Get product and vendor details for each line
    const itemsWithDetails = await Promise.all(
      lineItems.map(async (item) => {
        const product = item.productId
          ? await ctx.db.get(item.productId)
          : null;
        const vendor = item.vendorId ? await ctx.db.get(item.vendorId) : null;
        return { ...item, product, vendor };
      })
    );

    const requester = await ctx.db.get(requisition.requesterId);
    const approvals = await ctx.db
      .query("approvals")
      .withIndex("by_requisition", (q) => q.eq("requisitionId", args.requisitionId))
      .collect();

    return {
      ...requisition,
      lineItems: itemsWithDetails,
      requester,
      approvals,
    };
  },
});

// List requisitions for a university
export const list = query({
  args: {
    universityId: v.id("universities"),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("pending_approval"),
        v.literal("approved"),
        v.literal("rejected"),
        v.literal("ordered"),
        v.literal("cancelled")
      )
    ),
    department: v.optional(v.string()),
    requesterId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;

    let query = ctx.db
      .query("requisitions")
      .withIndex("by_university", (q) => q.eq("universityId", args.universityId));

    let results = await query.order("desc").take(limit);

    if (args.status) {
      results = results.filter((r) => r.status === args.status);
    }

    if (args.department) {
      results = results.filter((r) => r.department === args.department);
    }

    if (args.requesterId) {
      results = results.filter((r) => r.requesterId === args.requesterId);
    }

    return results;
  },
});

// Get pending approvals for a user
export const getPendingApprovals = query({
  args: { approverId: v.id("users") },
  handler: async (ctx, args) => {
    const approvals = await ctx.db
      .query("approvals")
      .withIndex("by_approver", (q) =>
        q.eq("approverId", args.approverId).eq("status", "pending")
      )
      .collect();

    // Get requisition details for each approval
    const approvalsWithReqs = await Promise.all(
      approvals.map(async (approval) => {
        const requisition = await ctx.db.get(approval.requisitionId);
        const requester = requisition
          ? await ctx.db.get(requisition.requesterId)
          : null;
        return { ...approval, requisition, requester };
      })
    );

    return approvalsWithReqs;
  },
});

// Get approval queue bottlenecks
export const getApprovalBottlenecks = query({
  args: { universityId: v.id("universities") },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get all pending approvals
    const pendingApprovals = await ctx.db
      .query("approvals")
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    // Group by approver
    const approverStats: Record<
      string,
      {
        approverId: string;
        pending: number;
        overdue: number;
        totalBlocked: number;
        avgWaitTime: number;
      }
    > = {};

    for (const approval of pendingApprovals) {
      const requisition = await ctx.db.get(approval.requisitionId);
      if (!requisition || requisition.universityId !== args.universityId) continue;

      const approverId = approval.approverId.toString();
      if (!approverStats[approverId]) {
        approverStats[approverId] = {
          approverId,
          pending: 0,
          overdue: 0,
          totalBlocked: 0,
          avgWaitTime: 0,
        };
      }

      approverStats[approverId].pending++;
      approverStats[approverId].totalBlocked += requisition.totalAmount;

      if (approval.dueAt < now) {
        approverStats[approverId].overdue++;
      }

      approverStats[approverId].avgWaitTime += now - approval.createdAt;
    }

    // Calculate averages and get user names
    const bottlenecks = await Promise.all(
      Object.values(approverStats).map(async (stats) => {
        const user = await ctx.db.get(stats.approverId as any);
        return {
          ...stats,
          approverName: user?.name || "Unknown",
          approverEmail: user?.email,
          avgWaitTime: stats.avgWaitTime / stats.pending,
        };
      })
    );

    // Sort by pending count
    bottlenecks.sort((a, b) => b.pending - a.pending);

    return bottlenecks;
  },
});
