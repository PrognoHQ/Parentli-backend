import { Prisma, ReimbursementStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../types";
import {
  ExpenseRejectionReason,
  UpdateReimbursementInput,
  SettleExpenseInput,
  UpdateSettlementInput,
} from "./validators";

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
  settledByProfile: {
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

// ---------------------------------------------------------------------------
// Reimbursement State Normalization
// ---------------------------------------------------------------------------

/**
 * Validates reimbursement status/amount consistency.
 * Throws AppError(400) on violations.
 */
export function normalizeReimbursementState(params: {
  reimbursementStatus: ReimbursementStatus;
  reimbursedAmt: number;
  expenseAmount: Prisma.Decimal;
}): void {
  const { reimbursementStatus, reimbursedAmt, expenseAmount } = params;
  const amount = Number(expenseAmount);

  if (reimbursedAmt > amount) {
    throw new AppError("reimbursedAmt cannot exceed expense amount.", 400);
  }

  if (reimbursementStatus === "none" && reimbursedAmt > 0) {
    throw new AppError(
      "reimbursedAmt must be 0 when reimbursementStatus is none.",
      400
    );
  }

  if (reimbursementStatus === "awaiting_reimb" && reimbursedAmt > 0) {
    throw new AppError(
      "reimbursedAmt must be 0 when reimbursementStatus is awaiting_reimb.",
      400
    );
  }

  if (reimbursementStatus === "partial") {
    if (reimbursedAmt <= 0) {
      throw new AppError(
        "reimbursedAmt must be greater than 0 when reimbursementStatus is partial.",
        400
      );
    }
    if (reimbursedAmt >= amount) {
      throw new AppError(
        "reimbursedAmt must be less than expense amount when reimbursementStatus is partial.",
        400
      );
    }
  }

  if (reimbursementStatus === "fully_received" && reimbursedAmt <= 0) {
    throw new AppError(
      "reimbursedAmt must be greater than 0 when reimbursementStatus is fully_received.",
      400
    );
  }
}

// ---------------------------------------------------------------------------
// Reimbursement Update
// ---------------------------------------------------------------------------

const SETTLEMENT_METHOD_LABELS: Record<string, string> = {
  venmo: "Venmo",
  zelle: "Zelle",
  bank_transfer: "bank transfer",
  paypal: "PayPal",
  cash: "cash",
  other: "other",
};

export async function updateReimbursement(
  expenseId: string,
  householdId: string,
  actorProfileId: string,
  data: UpdateReimbursementInput
) {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, householdId, deletedAt: null },
  });

  if (!expense) {
    throw new AppError("Expense not found.", 404);
  }

  if (expense.status !== "approved" && expense.status !== "settled") {
    throw new AppError(
      `Cannot update reimbursement for expense with status '${expense.status}'. Only approved or settled expenses can have reimbursement updates.`,
      400
    );
  }

  normalizeReimbursementState({
    reimbursementStatus: data.reimbursementStatus as ReimbursementStatus,
    reimbursedAmt: data.reimbursedAmt,
    expenseAmount: expense.amount,
  });

  if (
    data.reimbursedAmtExpected !== undefined &&
    data.reimbursedAmtExpected !== null &&
    Number(new Prisma.Decimal(data.reimbursedAmtExpected)) > Number(expense.amount)
  ) {
    throw new AppError(
      "reimbursedAmtExpected cannot exceed expense amount.",
      400
    );
  }

  const actor = await prisma.profile.findUnique({
    where: { id: actorProfileId },
    select: { firstName: true },
  });
  const actorName = actor?.firstName ?? "co-parent";

  const statusChanged = expense.reimbursementStatus !== data.reimbursementStatus;
  const amountChanged = Number(expense.reimbursedAmt) !== data.reimbursedAmt;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.expense.updateMany({
      where: { id: expenseId, status: expense.status },
      data: {
        reimbursementStatus: data.reimbursementStatus as ReimbursementStatus,
        reimbursedAmt: new Prisma.Decimal(data.reimbursedAmt),
        reimbursementSource: data.reimbursementSource ?? expense.reimbursementSource,
        reimbursedAmtExpected:
          data.reimbursedAmtExpected !== undefined
            ? data.reimbursedAmtExpected !== null
              ? new Prisma.Decimal(data.reimbursedAmtExpected)
              : null
            : expense.reimbursedAmtExpected,
      },
    });

    if (result.count === 0) {
      throw new AppError(
        "Expense was modified by another user. Please retry.",
        409
      );
    }

    if (statusChanged) {
      const statusLabels: Record<string, string> = {
        none: "Removed reimbursement tracking",
        awaiting_reimb: "Marked as awaiting reimbursement",
        partial: "Recorded partial reimbursement",
        fully_received: "Marked as fully reimbursed",
      };
      await tx.expenseTimelineEntry.create({
        data: {
          householdId,
          expenseId,
          actorProfileId,
          entryType: "reimbursement_status_updated",
          label: `${statusLabels[data.reimbursementStatus]} by ${actorName}`,
          color: "gold",
        },
      });
    } else if (amountChanged) {
      await tx.expenseTimelineEntry.create({
        data: {
          householdId,
          expenseId,
          actorProfileId,
          entryType: "reimbursement_amount_updated",
          label: `Reimbursement amount updated to $${data.reimbursedAmt.toFixed(2)} by ${actorName}`,
          color: "sage",
        },
      });
    }

    return tx.expense.findUniqueOrThrow({
      where: { id: expenseId },
      include: EXPENSE_INCLUDE,
    });
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Settle Expense
// ---------------------------------------------------------------------------

export async function settleExpense(
  expenseId: string,
  householdId: string,
  settlerProfileId: string,
  data: SettleExpenseInput
) {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, householdId, deletedAt: null },
  });

  if (!expense) {
    throw new AppError("Expense not found.", 404);
  }

  if (expense.status !== "approved") {
    throw new AppError(
      `Cannot settle expense with status '${expense.status}'. Only approved expenses can be settled.`,
      400
    );
  }

  const settler = await prisma.profile.findUnique({
    where: { id: settlerProfileId },
    select: { firstName: true },
  });
  const settlerName = settler?.firstName ?? "co-parent";
  const methodLabel = SETTLEMENT_METHOD_LABELS[data.settlementMethod] ?? data.settlementMethod;

  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.expense.updateMany({
      where: { id: expenseId, status: "approved" },
      data: {
        status: "settled",
        settlementMethod: data.settlementMethod as any,
        settlementDate: new Date(data.settlementDate),
        settlementNote: data.settlementNote ?? null,
        settledByProfileId: settlerProfileId,
        settledAt: now,
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
        actorProfileId: settlerProfileId,
        entryType: "settled",
        label: `Settled by ${settlerName} via ${methodLabel}`,
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
// Update Settlement
// ---------------------------------------------------------------------------

export async function updateSettlement(
  expenseId: string,
  householdId: string,
  actorProfileId: string,
  data: UpdateSettlementInput
) {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, householdId, deletedAt: null },
  });

  if (!expense) {
    throw new AppError("Expense not found.", 404);
  }

  if (expense.status !== "settled") {
    throw new AppError(
      `Cannot update settlement for expense with status '${expense.status}'. Only settled expenses can have settlement updates.`,
      400
    );
  }

  const actor = await prisma.profile.findUnique({
    where: { id: actorProfileId },
    select: { firstName: true },
  });
  const actorName = actor?.firstName ?? "co-parent";

  const updateData: Record<string, any> = {};
  if (data.settlementMethod !== undefined)
    updateData.settlementMethod = data.settlementMethod;
  if (data.settlementDate !== undefined)
    updateData.settlementDate = new Date(data.settlementDate);
  if (data.settlementNote !== undefined)
    updateData.settlementNote = data.settlementNote;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.expense.updateMany({
      where: { id: expenseId, status: "settled" },
      data: updateData,
    });

    if (result.count === 0) {
      throw new AppError(
        "Expense was modified by another user. Please retry.",
        409
      );
    }

    await tx.expenseTimelineEntry.create({
      data: {
        householdId,
        expenseId,
        actorProfileId,
        entryType: "settlement_updated",
        label: `${actorName} updated settlement details`,
        color: "muted",
      },
    });

    return tx.expense.findUniqueOrThrow({
      where: { id: expenseId },
      include: EXPENSE_INCLUDE,
    });
  });

  return updated;
}
