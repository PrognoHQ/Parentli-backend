import { Prisma, Expense, ReimbursementStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../types";
import {
  CreateExpenseInput,
  UpdateExpenseInput,
  ListExpensesQuery,
} from "./validators";
import {
  resolveExpenseSplit,
  calcShares,
  mapSharePerspective,
  MemberRole,
  PerspectiveShares,
  getExpensePolicySettings,
  determineBackdateCategory,
  determineExpenseApprovalRequirement,
} from "./calculations";


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
// Derived Read Model
// ---------------------------------------------------------------------------

interface DerivedFields {
  effectiveSplitPct: number;
  splitType: string;
  splitReason: string | null;
  net: string;
  myShare: string;
  theirShare: string;
  isHeld: boolean;
  reimbursementStatus: string;
  reimbursedAmt: string;
  reimbursementSource: string | null;
  reimbursedAmtExpected: string | null;
  settlementMethod: string | null;
  settlementDate: string | null;
  settlementNote: string | null;
}

function computeDerived(
  expense: Expense,
  requesterRole: MemberRole
): DerivedFields {
  const shares = calcShares(
    expense.amount,
    expense.reimbursable,
    expense.reimbursedAmt,
    expense.splitPct,
    expense.reimbursementStatus
  );

  const perspective = mapSharePerspective(
    expense.paidBy as MemberRole,
    requesterRole,
    shares
  );

  return {
    effectiveSplitPct: expense.splitPct,
    splitType: expense.splitType,
    splitReason: expense.splitReason,
    net: perspective.net,
    myShare: perspective.myShare,
    theirShare: perspective.theirShare,
    isHeld: perspective.isHeld,
    reimbursementStatus: expense.reimbursementStatus,
    reimbursedAmt: expense.reimbursedAmt.toFixed(2),
    reimbursementSource: expense.reimbursementSource,
    reimbursedAmtExpected: expense.reimbursedAmtExpected?.toFixed(2) ?? null,
    settlementMethod: expense.settlementMethod,
    settlementDate: expense.settlementDate
      ? expense.settlementDate.toISOString().slice(0, 10)
      : null,
    settlementNote: expense.settlementNote,
  };
}

function enrichExpense<T extends Expense>(
  expense: T,
  requesterRole: MemberRole
): T & { derived: DerivedFields } {
  return { ...expense, derived: computeDerived(expense, requesterRole) };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createExpense(
  householdId: string,
  creatorProfileId: string,
  data: CreateExpenseInput
) {
  // Validate child ownership when childScope = single
  if (data.childScope === "single" && data.primaryChildId) {
    const child = await prisma.child.findFirst({
      where: { id: data.primaryChildId, householdId },
    });
    if (!child) {
      throw new AppError("Child not found in this household.", 400);
    }
  }

  // Validate category ownership
  const category = await prisma.category.findFirst({
    where: { id: data.categoryId, householdId },
  });
  if (!category) {
    throw new AppError("Category not found in this household.", 400);
  }

  // Resolve split: custom if caller provided splitPct, otherwise from settings
  const split = await resolveExpenseSplit(
    householdId,
    creatorProfileId,
    data.categoryId,
    data.splitPct // undefined = resolve from settings
  );

  // Backdate categorization + approval determination
  const policy = await getExpensePolicySettings(householdId, creatorProfileId);

  const backdateResult = determineBackdateCategory(
    data.date,
    new Date(),
    policy.backdateFlagDays,
    policy.backdateApprovalDays,
    policy.maxBackdateDays
  );

  // Require backdateReason for backdated or significant expenses
  if (backdateResult.category !== "recent" && !data.backdateReason) {
    throw new AppError(
      "backdateReason is required for backdated or significantly backdated expenses.",
      400
    );
  }

  const approvalResult = determineExpenseApprovalRequirement({
    amount: data.amount,
    backdateCategory: backdateResult.category,
    approvalRequired: policy.approvalRequired,
    approvalThreshold: policy.approvalThreshold,
  });

  // If approval is required, force status to "awaiting"
  const effectiveStatus = approvalResult.approvalRequired
    ? "awaiting"
    : (data.status ?? "draft");

  // Fetch creator name upfront if approval is required (for timeline entry)
  let creatorName = "User";
  if (approvalResult.approvalRequired) {
    const creator = await prisma.profile.findUnique({
      where: { id: creatorProfileId },
      select: { firstName: true },
    });
    creatorName = creator?.firstName ?? "User";
  }

  const expense = await prisma.$transaction(async (tx) => {
    const created = await tx.expense.create({
      data: {
        householdId,
        createdByProfileId: creatorProfileId,
        description: data.description,
        amount: new Prisma.Decimal(data.amount),
        paidBy: data.paidBy,
        date: new Date(data.date),
        childScope: data.childScope,
        primaryChildId: data.primaryChildId ?? null,
        categoryId: data.categoryId,
        status: effectiveStatus,
        splitPct: split.splitPct,
        splitType: split.splitType,
        splitReason: split.splitReason,
        backdateCategory: backdateResult.category,
        backdateReason: data.backdateReason ?? null,
        approvalRequired: approvalResult.approvalRequired,
        approvalTrigger: approvalResult.approvalTrigger,
        reimbursable: data.reimbursable ?? false,
        reimbursedAmt: new Prisma.Decimal(data.reimbursedAmt ?? 0),
        reimbursementStatus: data.reimbursementStatus ?? "none",
        notes: data.notes ?? null,
      },
      include: EXPENSE_INCLUDE,
    });

    // Create timeline entry atomically when approval is required
    if (approvalResult.approvalRequired) {
      await tx.expenseTimelineEntry.create({
        data: {
          householdId,
          expenseId: created.id,
          actorProfileId: creatorProfileId,
          entryType: "submitted_for_approval",
          label: `Submitted for approval by ${creatorName}`,
          color: "gold",
        },
      });
    }

    return created;
  });

  return expense;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listExpenses(
  householdId: string,
  query: ListExpensesQuery,
  requesterRole?: MemberRole
) {
  const where: Prisma.ExpenseWhereInput = {
    householdId,
    deletedAt: null,
  };

  if (query.status) {
    where.status = query.status;
  }
  if (query.categoryId) {
    where.categoryId = query.categoryId;
  }
  if (query.childId) {
    where.primaryChildId = query.childId;
  }
  if (query.startDate || query.endDate) {
    where.date = {};
    if (query.startDate) {
      (where.date as Prisma.DateTimeFilter).gte = new Date(query.startDate);
    }
    if (query.endDate) {
      (where.date as Prisma.DateTimeFilter).lte = new Date(query.endDate);
    }
  }

  const page = query.page ?? 1;
  const limit = query.limit ?? 20;

  const [data, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: EXPENSE_INCLUDE,
      orderBy: { date: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.expense.count({ where }),
  ]);

  if (query.includeDerived && requesterRole) {
    const enriched = data.map((e) => enrichExpense(e, requesterRole));
    return { data: enriched, total, page, limit };
  }

  return { data, total, page, limit };
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export async function getExpense(
  id: string,
  householdId: string,
  requesterRole?: MemberRole
) {
  const expense = await prisma.expense.findFirst({
    where: { id, householdId, deletedAt: null },
    include: EXPENSE_INCLUDE,
  });

  if (!expense) return null;

  // Always include derived data on detail view
  if (requesterRole) {
    return enrichExpense(expense, requesterRole);
  }

  return expense;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateExpense(
  id: string,
  householdId: string,
  creatorProfileId: string,
  data: UpdateExpenseInput
) {
  const expense = await prisma.expense.findFirst({
    where: { id, householdId, deletedAt: null },
  });
  if (!expense) {
    throw new AppError("Expense not found.", 404);
  }

  // Only allow updates on draft or awaiting expenses
  if (expense.status !== "draft" && expense.status !== "awaiting") {
    throw new AppError(
      "Cannot update expense in current status. Only draft or awaiting expenses can be updated.",
      400
    );
  }

  // Re-validate child ownership if changing
  const newChildScope = data.childScope ?? expense.childScope;
  const newChildId =
    data.primaryChildId !== undefined
      ? data.primaryChildId
      : expense.primaryChildId;

  if (newChildScope === "single" && newChildId) {
    const child = await prisma.child.findFirst({
      where: { id: newChildId, householdId },
    });
    if (!child) {
      throw new AppError("Child not found in this household.", 400);
    }
  }

  // Re-validate category ownership if changing
  const effectiveCategoryId = data.categoryId ?? expense.categoryId;
  if (data.categoryId && data.categoryId !== expense.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: data.categoryId, householdId },
    });
    if (!category) {
      throw new AppError("Category not found in this household.", 400);
    }
  }

  // Cross-field: reimbursedAmt cannot exceed (new or existing) amount
  const effectiveAmount = data.amount !== undefined
    ? data.amount
    : Number(expense.amount);
  const effectiveReimbursedAmt = data.reimbursedAmt !== undefined
    ? data.reimbursedAmt
    : Number(expense.reimbursedAmt);

  if (effectiveReimbursedAmt > effectiveAmount) {
    throw new AppError("reimbursedAmt cannot exceed amount.", 400);
  }

  // Re-resolve split if category changed or splitPct explicitly provided
  const needsSplitResolve =
    data.splitPct !== undefined || data.categoryId !== undefined;

  let splitUpdate: {
    splitPct?: number;
    splitType?: string;
    splitReason?: string | null;
  } = {};

  if (needsSplitResolve) {
    const resolved = await resolveExpenseSplit(
      householdId,
      creatorProfileId,
      effectiveCategoryId,
      data.splitPct // undefined if only category changed → re-resolve from settings
    );
    splitUpdate = {
      splitPct: resolved.splitPct,
      splitType: resolved.splitType,
      splitReason: resolved.splitReason,
    };
  }

  // Re-evaluate backdate/approval flags when relevant fields change
  const needsBackdateReeval =
    data.date !== undefined ||
    data.amount !== undefined ||
    data.backdateReason !== undefined;

  let backdateUpdate: Prisma.ExpenseUpdateInput = {};

  if (needsBackdateReeval) {
    const policy = await getExpensePolicySettings(householdId, creatorProfileId);

    // Compute effective values for re-evaluation
    const effectiveDate = data.date ?? expense.date.toISOString().slice(0, 10);
    const effectiveAmt = data.amount ?? Number(expense.amount);
    const effectiveBackdateReason =
      data.backdateReason !== undefined
        ? data.backdateReason
        : expense.backdateReason;

    const backdateResult = determineBackdateCategory(
      effectiveDate,
      new Date(),
      policy.backdateFlagDays,
      policy.backdateApprovalDays,
      policy.maxBackdateDays
    );

    // Require backdateReason for backdated or significant expenses
    if (backdateResult.category !== "recent" && !effectiveBackdateReason) {
      throw new AppError(
        "backdateReason is required for backdated or significantly backdated expenses.",
        400
      );
    }

    const approvalResult = determineExpenseApprovalRequirement({
      amount: effectiveAmt,
      backdateCategory: backdateResult.category,
      approvalRequired: policy.approvalRequired,
      approvalThreshold: policy.approvalThreshold,
    });

    backdateUpdate = {
      backdateCategory: backdateResult.category,
      backdateReason: effectiveBackdateReason,
      approvalRequired: approvalResult.approvalRequired,
      approvalTrigger: approvalResult.approvalTrigger,
    };

    // Auto-promote draft to awaiting if approval is now required
    if (approvalResult.approvalRequired && expense.status === "draft") {
      backdateUpdate.status = "awaiting";
    }

    // Auto-demote awaiting to draft if approval is no longer required
    if (!approvalResult.approvalRequired && expense.status === "awaiting") {
      backdateUpdate.status = "draft";
    }
  }

  const updateData: Prisma.ExpenseUpdateInput = {};
  if (data.description !== undefined) updateData.description = data.description;
  if (data.amount !== undefined)
    updateData.amount = new Prisma.Decimal(data.amount);
  if (data.paidBy !== undefined) updateData.paidBy = data.paidBy;
  if (data.date !== undefined) updateData.date = new Date(data.date);
  if (data.childScope !== undefined) updateData.childScope = data.childScope;
  if (data.primaryChildId !== undefined)
    updateData.primaryChild =
      data.primaryChildId === null
        ? { disconnect: true }
        : { connect: { id: data.primaryChildId } };
  if (data.categoryId !== undefined)
    updateData.category = { connect: { id: data.categoryId } };
  if (data.status !== undefined) updateData.status = data.status;
  if (data.backdateReason !== undefined) updateData.backdateReason = data.backdateReason;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.reimbursable !== undefined) updateData.reimbursable = data.reimbursable;
  if (data.reimbursedAmt !== undefined)
    updateData.reimbursedAmt = new Prisma.Decimal(data.reimbursedAmt);
  if (data.reimbursementStatus !== undefined)
    updateData.reimbursementStatus = data.reimbursementStatus;

  // Apply split resolution
  if (splitUpdate.splitPct !== undefined) updateData.splitPct = splitUpdate.splitPct;
  if (splitUpdate.splitType !== undefined) updateData.splitType = splitUpdate.splitType as any;
  if (splitUpdate.splitReason !== undefined) updateData.splitReason = splitUpdate.splitReason;

  // Apply backdate/approval re-evaluation
  Object.assign(updateData, backdateUpdate);

  const updated = await prisma.expense.update({
    where: { id },
    data: updateData,
    include: EXPENSE_INCLUDE,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Delete (soft)
// ---------------------------------------------------------------------------

export async function deleteExpense(id: string, householdId: string) {
  const expense = await prisma.expense.findFirst({
    where: { id, householdId, deletedAt: null },
  });
  if (!expense) {
    throw new AppError("Expense not found.", 404);
  }

  await prisma.expense.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
