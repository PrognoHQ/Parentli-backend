/**
 * Phase 4D2: Recurring Expense Series
 *
 * Recurrence engine + series CRUD service.
 *
 * Strategy: materialized instances. Each generated expense is a real Expense row
 * linked to an ExpenseSeries via series_id + series_instance_date.
 *
 * Monthly edge-case handling: clamp to last valid day of month.
 * Example: series starting Jan 31 → Feb 28/29 → Mar 31.
 */

import { addDays, addMonths } from "date-fns";
import { Prisma, ExpenseSeries, Expense } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../types";
import {
  resolveExpenseSplit,
  getExpensePolicySettings,
  determineBackdateCategory,
  determineExpenseApprovalRequirement,
} from "./calculations";
import type { CreateSeriesInput, UpdateSeriesInput } from "./validators";

// ---------------------------------------------------------------------------
// Date Computation (pure functions — no DB access)
// ---------------------------------------------------------------------------

/** Clamp a target day-of-month to the last valid day for a given year/month. */
function clampDayOfMonth(year: number, month: number, targetDay: number): number {
  // month is 0-based here (JS Date convention)
  const lastDay = new Date(year, month + 1, 0).getDate();
  return Math.min(targetDay, lastDay);
}

/**
 * Advance a date by one frequency step.
 * For monthly: uses the original target day-of-month with clamping.
 */
function advanceDate(
  current: Date,
  frequency: "weekly" | "biweekly" | "monthly",
  intervalCount: number,
  targetDayOfMonth?: number
): Date {
  switch (frequency) {
    case "weekly":
      return addDays(current, 7 * intervalCount);
    case "biweekly":
      return addDays(current, 14 * intervalCount);
    case "monthly": {
      const next = addMonths(current, intervalCount);
      if (targetDayOfMonth != null) {
        const clamped = clampDayOfMonth(
          next.getFullYear(),
          next.getMonth(),
          targetDayOfMonth
        );
        return new Date(next.getFullYear(), next.getMonth(), clamped);
      }
      return next;
    }
  }
}

/**
 * Compute deterministic occurrence dates for a series.
 *
 * Returns dates starting from startDate (inclusive) up to
 * min(endDate, upToDate) or maxCount occurrences.
 */
export function computeOccurrenceDates(params: {
  startDate: Date;
  frequency: "weekly" | "biweekly" | "monthly";
  intervalCount: number;
  dayOfMonth?: number | null;
  endDate?: Date | null;
  upToDate?: Date | null;
  maxCount?: number;
}): Date[] {
  const {
    startDate,
    frequency,
    intervalCount,
    dayOfMonth,
    endDate,
    upToDate,
    maxCount = 100,
  } = params;

  const dates: Date[] = [];
  let current = startDate;

  const effectiveEnd = endDate && upToDate
    ? (endDate < upToDate ? endDate : upToDate)
    : endDate ?? upToDate ?? null;

  const targetDay = dayOfMonth ?? startDate.getDate();

  for (let i = 0; i < maxCount; i++) {
    if (effectiveEnd && current > effectiveEnd) break;
    dates.push(new Date(current));
    current = advanceDate(current, frequency, intervalCount, targetDay);
  }

  return dates;
}

/** Format a Date as YYYY-MM-DD string (UTC-safe for Date-only values). */
function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD string to a local Date (midnight). */
function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// ---------------------------------------------------------------------------
// Include shape for series queries
// ---------------------------------------------------------------------------

const SERIES_INCLUDE = {
  category: {
    select: { id: true, label: true, slug: true, emoji: true, color: true },
  },
  primaryChild: {
    select: { id: true, firstName: true, lastName: true, emoji: true },
  },
  createdByProfile: {
    select: { id: true, firstName: true, lastName: true },
  },
};

// ---------------------------------------------------------------------------
// Series CRUD
// ---------------------------------------------------------------------------

export async function createSeries(
  householdId: string,
  creatorProfileId: string,
  data: CreateSeriesInput
) {
  // Validate child ownership
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

  // Resolve split
  const split = await resolveExpenseSplit(
    householdId,
    creatorProfileId,
    data.categoryId,
    data.splitPct
  );

  const startDate = parseDate(data.startDate);
  const endDate = data.endDate ? parseDate(data.endDate) : null;
  const dayOfMonth = data.frequency === "monthly" ? startDate.getDate() : null;

  // Compute first 3 occurrence dates for initial generation
  const occurrenceDates = computeOccurrenceDates({
    startDate,
    frequency: data.frequency,
    intervalCount: 1,
    dayOfMonth,
    endDate,
    maxCount: 3,
  });

  const nextGenDate =
    occurrenceDates.length > 0
      ? advanceDate(
          occurrenceDates[occurrenceDates.length - 1],
          data.frequency,
          1,
          dayOfMonth ?? undefined
        )
      : null;

  // Create series + initial instances in a transaction
  const series = await prisma.$transaction(async (tx) => {
    const created = await tx.expenseSeries.create({
      data: {
        householdId,
        createdByProfileId: creatorProfileId,
        description: data.description,
        amount: new Prisma.Decimal(data.amount),
        paidBy: data.paidBy,
        childScope: data.childScope,
        primaryChildId: data.primaryChildId ?? null,
        categoryId: data.categoryId,
        splitPct: split.splitPct,
        splitType: split.splitType,
        splitReason: split.splitReason,
        notes: data.notes ?? null,
        reimbursable: data.reimbursable ?? false,
        frequency: data.frequency,
        intervalCount: 1,
        dayOfMonth,
        startDate,
        endDate,
        nextGenerationDate: nextGenDate,
        paused: false,
      },
      include: SERIES_INCLUDE,
    });

    // Generate initial instances
    const instanceIds = await generateInstancesInTx(
      tx,
      created,
      occurrenceDates,
      householdId,
      creatorProfileId
    );

    return { ...created, generatedInstanceCount: instanceIds.length };
  });

  return series;
}

export async function listSeries(
  householdId: string,
  query: { page: number; limit: number; includeArchived: boolean }
) {
  const where: Prisma.ExpenseSeriesWhereInput = {
    householdId,
  };

  if (!query.includeArchived) {
    where.archivedAt = null;
  }

  const [data, total] = await Promise.all([
    prisma.expenseSeries.findMany({
      where,
      include: {
        ...SERIES_INCLUDE,
        _count: { select: { expenses: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.expenseSeries.count({ where }),
  ]);

  return { data, total, page: query.page, limit: query.limit };
}

export async function getSeriesDetail(seriesId: string, householdId: string) {
  const series = await prisma.expenseSeries.findFirst({
    where: { id: seriesId, householdId },
    include: SERIES_INCLUDE,
  });

  if (!series) {
    throw new AppError("Expense series not found.", 404);
  }

  // Fetch recent instances
  const instances = await prisma.expense.findMany({
    where: {
      seriesId,
      householdId,
      deletedAt: null,
    },
    select: {
      id: true,
      description: true,
      amount: true,
      date: true,
      status: true,
      seriesInstanceDate: true,
      isDetachedFromSeries: true,
    },
    orderBy: { seriesInstanceDate: "asc" },
    take: 20,
  });

  return { ...series, instances };
}

// ---------------------------------------------------------------------------
// Series Update — Single Instance vs Future
// ---------------------------------------------------------------------------

export async function updateSeriesSingleInstance(
  expenseId: string,
  householdId: string,
  creatorProfileId: string,
  data: UpdateSeriesInput
) {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, householdId, deletedAt: null },
  });

  if (!expense) {
    throw new AppError("Expense not found.", 404);
  }

  if (!expense.seriesId) {
    throw new AppError("Expense is not part of a recurring series.", 400);
  }

  // Only allow updates on draft or awaiting
  if (expense.status !== "draft" && expense.status !== "awaiting") {
    throw new AppError(
      "Cannot update expense in current status. Only draft or awaiting expenses can be updated.",
      400
    );
  }

  // Build update data from provided fields
  const updateData: Prisma.ExpenseUpdateInput = {
    isDetachedFromSeries: true,
  };

  if (data.description !== undefined) updateData.description = data.description;
  if (data.amount !== undefined)
    updateData.amount = new Prisma.Decimal(data.amount);
  if (data.paidBy !== undefined) updateData.paidBy = data.paidBy;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.reimbursable !== undefined) updateData.reimbursable = data.reimbursable;

  // Re-resolve split if splitPct or categoryId changed
  if (data.splitPct !== undefined || data.categoryId !== undefined) {
    const effectiveCategoryId = data.categoryId ?? expense.categoryId;
    const resolved = await resolveExpenseSplit(
      householdId,
      creatorProfileId,
      effectiveCategoryId,
      data.splitPct
    );
    updateData.splitPct = resolved.splitPct;
    updateData.splitType = resolved.splitType;
    updateData.splitReason = resolved.splitReason;
  }

  if (data.categoryId !== undefined) {
    const category = await prisma.category.findFirst({
      where: { id: data.categoryId, householdId },
    });
    if (!category) {
      throw new AppError("Category not found in this household.", 400);
    }
    updateData.category = { connect: { id: data.categoryId } };
  }

  if (data.childScope !== undefined) updateData.childScope = data.childScope;
  if (data.primaryChildId !== undefined) {
    if (data.primaryChildId === null) {
      updateData.primaryChild = { disconnect: true };
    } else {
      const child = await prisma.child.findFirst({
        where: { id: data.primaryChildId, householdId },
      });
      if (!child) {
        throw new AppError("Child not found in this household.", 400);
      }
      updateData.primaryChild = { connect: { id: data.primaryChildId } };
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.expense.update({
      where: { id: expenseId },
      data: updateData,
    });

    await tx.expenseTimelineEntry.create({
      data: {
        householdId,
        expenseId,
        actorProfileId: creatorProfileId,
        entryType: "detached_from_series",
        label: "Detached from recurring series (single edit)",
        color: "muted",
      },
    });

    return result;
  });

  return updated;
}

export async function updateSeriesFuture(
  seriesId: string,
  householdId: string,
  creatorProfileId: string,
  data: UpdateSeriesInput
) {
  const series = await prisma.expenseSeries.findFirst({
    where: { id: seriesId, householdId },
  });

  if (!series) {
    throw new AppError("Expense series not found.", 404);
  }

  if (series.archivedAt) {
    throw new AppError("Cannot update an archived series.", 400);
  }

  // Build series update
  const seriesUpdate: Prisma.ExpenseSeriesUpdateInput = {};
  if (data.description !== undefined) seriesUpdate.description = data.description;
  if (data.amount !== undefined)
    seriesUpdate.amount = new Prisma.Decimal(data.amount);
  if (data.paidBy !== undefined) seriesUpdate.paidBy = data.paidBy;
  if (data.notes !== undefined) seriesUpdate.notes = data.notes;
  if (data.reimbursable !== undefined) seriesUpdate.reimbursable = data.reimbursable;
  if (data.childScope !== undefined) seriesUpdate.childScope = data.childScope;
  if (data.primaryChildId !== undefined) {
    if (data.primaryChildId === null) {
      seriesUpdate.primaryChild = { disconnect: true };
    } else {
      seriesUpdate.primaryChild = { connect: { id: data.primaryChildId } };
    }
  }

  // Re-resolve split if needed
  let splitUpdate: {
    splitPct?: number;
    splitType?: string;
    splitReason?: string | null;
  } = {};
  const effectiveCategoryId = data.categoryId ?? series.categoryId;

  if (data.splitPct !== undefined || data.categoryId !== undefined) {
    const resolved = await resolveExpenseSplit(
      householdId,
      creatorProfileId,
      effectiveCategoryId,
      data.splitPct
    );
    splitUpdate = {
      splitPct: resolved.splitPct,
      splitType: resolved.splitType,
      splitReason: resolved.splitReason,
    };
    seriesUpdate.splitPct = resolved.splitPct;
    seriesUpdate.splitType = resolved.splitType as any;
    seriesUpdate.splitReason = resolved.splitReason;
  }

  if (data.categoryId !== undefined) {
    const category = await prisma.category.findFirst({
      where: { id: data.categoryId, householdId },
    });
    if (!category) {
      throw new AppError("Category not found in this household.", 400);
    }
    seriesUpdate.category = { connect: { id: data.categoryId } };
  }

  if (data.childScope !== undefined) {
    if (data.childScope === "single" && data.primaryChildId) {
      const child = await prisma.child.findFirst({
        where: { id: data.primaryChildId, householdId },
      });
      if (!child) {
        throw new AppError("Child not found in this household.", 400);
      }
    }
  }

  const today = new Date();
  const todayStr = toDateString(today);

  const result = await prisma.$transaction(async (tx) => {
    // Update series master
    if (Object.keys(seriesUpdate).length > 0) {
      await tx.expenseSeries.update({
        where: { id: seriesId },
        data: seriesUpdate,
      });
    }

    // Find future instances that are safe to update:
    // - Not detached
    // - Still in draft or awaiting status
    // - No reimbursement history
    // - Not settled
    // - Instance date is in the future
    const safeInstances = await tx.expense.findMany({
      where: {
        seriesId,
        householdId,
        deletedAt: null,
        isDetachedFromSeries: false,
        status: { in: ["draft", "awaiting"] },
        reimbursementStatus: "none",
        settlementMethod: null,
        seriesInstanceDate: { gt: new Date(todayStr) },
      },
      select: { id: true },
    });

    const safeIds = safeInstances.map((e) => e.id);

    if (safeIds.length > 0) {
      // Build expense update for future instances (unchecked for FK columns)
      const expenseUpdate: Prisma.ExpenseUncheckedUpdateManyInput = {};
      if (data.description !== undefined)
        expenseUpdate.description = data.description;
      if (data.amount !== undefined)
        expenseUpdate.amount = new Prisma.Decimal(data.amount);
      if (data.paidBy !== undefined) expenseUpdate.paidBy = data.paidBy;
      if (data.notes !== undefined) expenseUpdate.notes = data.notes;
      if (data.reimbursable !== undefined)
        expenseUpdate.reimbursable = data.reimbursable;
      if (data.childScope !== undefined)
        expenseUpdate.childScope = data.childScope;
      if (data.primaryChildId !== undefined)
        expenseUpdate.primaryChildId = data.primaryChildId;
      if (data.categoryId !== undefined)
        expenseUpdate.categoryId = data.categoryId;
      if (splitUpdate.splitPct !== undefined)
        expenseUpdate.splitPct = splitUpdate.splitPct;
      if (splitUpdate.splitType !== undefined)
        expenseUpdate.splitType = splitUpdate.splitType as any;
      if (splitUpdate.splitReason !== undefined)
        expenseUpdate.splitReason = splitUpdate.splitReason;

      if (Object.keys(expenseUpdate).length > 0) {
        await tx.expense.updateMany({
          where: { id: { in: safeIds } },
          data: expenseUpdate,
        });
      }

      // Create timeline entries for updated instances
      for (const id of safeIds) {
        await tx.expenseTimelineEntry.create({
          data: {
            householdId,
            expenseId: id,
            actorProfileId: creatorProfileId,
            entryType: "series_future_updated",
            label: "Updated by recurring series edit",
            color: "muted",
          },
        });
      }
    }

    return { updatedInstanceCount: safeIds.length };
  });

  return result;
}

// ---------------------------------------------------------------------------
// Pause / Resume / Archive
// ---------------------------------------------------------------------------

export async function pauseSeries(
  seriesId: string,
  householdId: string,
  actorProfileId: string
) {
  const series = await prisma.expenseSeries.findFirst({
    where: { id: seriesId, householdId },
  });
  if (!series) throw new AppError("Expense series not found.", 404);
  if (series.archivedAt) throw new AppError("Cannot pause an archived series.", 400);
  if (series.paused) throw new AppError("Series is already paused.", 400);

  await prisma.expenseSeries.update({
    where: { id: seriesId },
    data: { paused: true },
  });

  return { id: seriesId, paused: true };
}

export async function resumeSeries(
  seriesId: string,
  householdId: string,
  actorProfileId: string
) {
  const series = await prisma.expenseSeries.findFirst({
    where: { id: seriesId, householdId },
  });
  if (!series) throw new AppError("Expense series not found.", 404);
  if (series.archivedAt) throw new AppError("Cannot resume an archived series.", 400);
  if (!series.paused) throw new AppError("Series is not paused.", 400);

  await prisma.expenseSeries.update({
    where: { id: seriesId },
    data: { paused: false },
  });

  return { id: seriesId, paused: false };
}

export async function archiveSeries(
  seriesId: string,
  householdId: string,
  actorProfileId: string
) {
  const series = await prisma.expenseSeries.findFirst({
    where: { id: seriesId, householdId },
  });
  if (!series) throw new AppError("Expense series not found.", 404);
  if (series.archivedAt) throw new AppError("Series is already archived.", 400);

  await prisma.expenseSeries.update({
    where: { id: seriesId },
    data: { archivedAt: new Date(), paused: true },
  });

  return { id: seriesId, archivedAt: true };
}

// ---------------------------------------------------------------------------
// Instance Generation
// ---------------------------------------------------------------------------

/**
 * Generate missing instances for a series, up to upToDate or a default window.
 * Can be called standalone (outside a transaction) for catch-up generation.
 */
export async function generateSeriesInstances(
  seriesId: string,
  householdId: string,
  creatorProfileId: string,
  upToDate?: Date
) {
  const series = await prisma.expenseSeries.findFirst({
    where: { id: seriesId, householdId },
  });

  if (!series) throw new AppError("Expense series not found.", 404);
  if (series.paused) throw new AppError("Cannot generate instances for a paused series.", 400);
  if (series.archivedAt) throw new AppError("Cannot generate instances for an archived series.", 400);

  // Default: generate up to 3 instances ahead from next_generation_date or start_date
  const genStart = series.nextGenerationDate ?? series.startDate;
  const defaultEnd = upToDate ?? null;

  const allDates = computeOccurrenceDates({
    startDate: genStart,
    frequency: series.frequency,
    intervalCount: series.intervalCount,
    dayOfMonth: series.dayOfMonth,
    endDate: series.endDate,
    upToDate: defaultEnd,
    maxCount: upToDate ? 50 : 3,
  });

  if (allDates.length === 0) return { generatedCount: 0 };

  // Find existing instance dates to avoid duplicates
  const existingInstances = await prisma.expense.findMany({
    where: {
      seriesId,
      householdId,
      deletedAt: null,
      seriesInstanceDate: { not: null },
    },
    select: { seriesInstanceDate: true },
  });

  const existingDateSet = new Set(
    existingInstances
      .filter((e) => e.seriesInstanceDate)
      .map((e) => toDateString(e.seriesInstanceDate!))
  );

  const missingDates = allDates.filter(
    (d) => !existingDateSet.has(toDateString(d))
  );

  if (missingDates.length === 0) return { generatedCount: 0 };

  const result = await prisma.$transaction(async (tx) => {
    const ids = await generateInstancesInTx(
      tx,
      series,
      missingDates,
      householdId,
      creatorProfileId
    );

    // Update next_generation_date
    const lastGenerated = missingDates[missingDates.length - 1];
    const nextDate = advanceDate(
      lastGenerated,
      series.frequency,
      series.intervalCount,
      series.dayOfMonth ?? undefined
    );

    await tx.expenseSeries.update({
      where: { id: seriesId },
      data: { nextGenerationDate: nextDate },
    });

    return ids;
  });

  return { generatedCount: result.length };
}

// ---------------------------------------------------------------------------
// Internal: generate instances inside an existing transaction
// ---------------------------------------------------------------------------

async function generateInstancesInTx(
  tx: Prisma.TransactionClient,
  series: ExpenseSeries,
  dates: Date[],
  householdId: string,
  creatorProfileId: string
): Promise<string[]> {
  const createdIds: string[] = [];

  // Fetch policy for backdate/approval determination
  const policy = await getExpensePolicySettings(householdId, creatorProfileId);

  // Fetch creator name for timeline entries
  const creator = await tx.profile.findUnique({
    where: { id: creatorProfileId },
    select: { firstName: true },
  });
  const creatorName = creator?.firstName ?? "User";

  for (const date of dates) {
    const dateStr = toDateString(date);

    // Determine backdate/approval for this instance
    const backdateResult = determineBackdateCategory(
      dateStr,
      new Date(),
      policy.backdateFlagDays,
      policy.backdateApprovalDays,
      policy.maxBackdateDays
    );

    const approvalResult = determineExpenseApprovalRequirement({
      amount: Number(series.amount),
      backdateCategory: backdateResult.category,
      approvalRequired: policy.approvalRequired,
      approvalThreshold: policy.approvalThreshold,
    });

    const effectiveStatus = approvalResult.approvalRequired ? "awaiting" : "draft";

    try {
      const instance = await tx.expense.create({
        data: {
          householdId,
          createdByProfileId: creatorProfileId,
          description: series.description,
          amount: series.amount,
          paidBy: series.paidBy,
          date: new Date(dateStr),
          childScope: series.childScope,
          primaryChildId: series.primaryChildId,
          categoryId: series.categoryId,
          status: effectiveStatus,
          splitPct: series.splitPct,
          splitType: series.splitType,
          splitReason: series.splitReason,
          backdateCategory: backdateResult.category,
          approvalRequired: approvalResult.approvalRequired,
          approvalTrigger: approvalResult.approvalTrigger,
          reimbursable: series.reimbursable,
          reimbursedAmt: new Prisma.Decimal(0),
          reimbursementStatus: "none",
          notes: series.notes,
          seriesId: series.id,
          seriesInstanceDate: new Date(dateStr),
          isDetachedFromSeries: false,
        },
        select: { id: true },
      });

      createdIds.push(instance.id);

      // Timeline entry for series-generated instance
      await tx.expenseTimelineEntry.create({
        data: {
          householdId,
          expenseId: instance.id,
          actorProfileId: creatorProfileId,
          entryType: "series_created",
          label: `Generated by recurring series`,
          color: "muted",
        },
      });

      // Additional timeline if approval required
      if (approvalResult.approvalRequired) {
        await tx.expenseTimelineEntry.create({
          data: {
            householdId,
            expenseId: instance.id,
            actorProfileId: creatorProfileId,
            entryType: "submitted_for_approval",
            label: `Submitted for approval by ${creatorName}`,
            color: "gold",
          },
        });
      }
    } catch (err: any) {
      // P2002 = unique constraint violation → duplicate instance, skip
      if (err?.code === "P2002") {
        continue;
      }
      throw err;
    }
  }

  return createdIds;
}

// Re-export for testing
export { advanceDate as _advanceDate, clampDayOfMonth as _clampDayOfMonth, toDateString as _toDateString, parseDate as _parseDate };
