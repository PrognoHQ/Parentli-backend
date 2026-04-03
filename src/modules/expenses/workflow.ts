import { prisma } from "../../lib/prisma";
import { AppError } from "../../types";
import { ExpenseRejectionReason } from "./validators";

const EXPENSE_INCLUDE = {
  category: {
    select: { id: true, label: true, slug: true, emoji: true, color: true },
  },
  primaryChild: {
    select: { id: true, firstName: true, lastName: true, emoji: true },
  },
  createdByProfile: {
    select: { id: true, firstName: true, lastName: true },
  },
  approvedByProfile: {
    select: { id: true, firstName: true, lastName: true },
  },
  rejectedByProfile: {
    select: { id: true, firstName: true, lastName: true },
  },
};

// ---------------------------------------------------------------------------
// Approve
// ---------------------------------------------------------------------------

export async function approveExpense(
  expenseId: string,
  householdId: string,
  approverProfileId: string
) {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, householdId, deletedAt: null },
  });

  if (!expense) {
    throw new AppError("Expense not found.", 404);
  }

  if (expense.status !== "awaiting") {
    throw new AppError(
      `Cannot approve expense with status '${expense.status}'.`,
      400
    );
  }

  if (!expense.approvalRequired) {
    throw new AppError(
      "Cannot approve an expense that does not require approval.",
      400
    );
  }

  if (expense.createdByProfileId === approverProfileId) {
    throw new AppError("Cannot approve your own expense.", 403);
  }

  const approver = await prisma.profile.findUnique({
    where: { id: approverProfileId },
    select: { firstName: true },
  });

  const now = new Date();
  const approverName = approver?.firstName ?? "co-parent";

  const updated = await prisma.$transaction(async (tx) => {
    // Conditional update: only succeeds if expense is still awaiting
    const result = await tx.expense.updateMany({
      where: { id: expenseId, status: "awaiting" },
      data: {
        status: "approved",
        approvedAt: now,
        approvedByProfileId: approverProfileId,
        rejectedAt: null,
        rejectedByProfileId: null,
        rejectionReason: null,
      },
    });

    if (result.count === 0) {
      throw new AppError(
        "Expense was already resolved by another user.",
        409
      );
    }

    await tx.expenseTimelineEntry.create({
      data: {
        householdId,
        expenseId,
        actorProfileId: approverProfileId,
        entryType: "approved",
        label: `Approved by ${approverName}`,
        color: "sage",
      },
    });

    return tx.expense.findUniqueOrThrow({
      where: { id: expenseId },
      include: EXPENSE_INCLUDE,
    });
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Reject
// ---------------------------------------------------------------------------

export async function rejectExpense(
  expenseId: string,
  householdId: string,
  rejectorProfileId: string,
  reason: ExpenseRejectionReason,
  detail?: string | null
) {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, householdId, deletedAt: null },
  });

  if (!expense) {
    throw new AppError("Expense not found.", 404);
  }

  if (expense.status !== "awaiting") {
    throw new AppError(
      `Cannot reject expense with status '${expense.status}'.`,
      400
    );
  }

  if (!expense.approvalRequired) {
    throw new AppError(
      "Cannot reject an expense that does not require approval.",
      400
    );
  }

  if (expense.createdByProfileId === rejectorProfileId) {
    throw new AppError("Cannot reject your own expense.", 403);
  }

  const rejector = await prisma.profile.findUnique({
    where: { id: rejectorProfileId },
    select: { firstName: true },
  });

  const now = new Date();
  const rejectorName = rejector?.firstName ?? "co-parent";

  const timelineDetail = detail
    ? `${reason}: ${detail}`
    : reason;

  const updated = await prisma.$transaction(async (tx) => {
    // Conditional update: only succeeds if expense is still awaiting
    const result = await tx.expense.updateMany({
      where: { id: expenseId, status: "awaiting" },
      data: {
        status: "rejected",
        rejectedAt: now,
        rejectedByProfileId: rejectorProfileId,
        rejectionReason: reason,
        approvedAt: null,
        approvedByProfileId: null,
      },
    });

    if (result.count === 0) {
      throw new AppError(
        "Expense was already resolved by another user.",
        409
      );
    }

    await tx.expenseTimelineEntry.create({
      data: {
        householdId,
        expenseId,
        actorProfileId: rejectorProfileId,
        entryType: "rejected",
        label: `Rejected by ${rejectorName}`,
        detail: timelineDetail,
        color: "terracotta",
      },
    });

    return tx.expense.findUniqueOrThrow({
      where: { id: expenseId },
      include: EXPENSE_INCLUDE,
    });
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Timeline Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a "submitted_for_approval" timeline entry when an expense
 * is created with approvalRequired = true.
 */
export async function createSubmittedForApprovalEntry(
  expenseId: string,
  householdId: string,
  creatorProfileId: string,
  creatorName: string
): Promise<void> {
  await prisma.expenseTimelineEntry.create({
    data: {
      householdId,
      expenseId,
      actorProfileId: creatorProfileId,
      entryType: "submitted_for_approval",
      label: `Submitted for approval by ${creatorName}`,
      color: "gold",
    },
  });
}
