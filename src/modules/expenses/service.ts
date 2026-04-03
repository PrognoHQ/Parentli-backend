import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../types";
import {
  CreateExpenseInput,
  UpdateExpenseInput,
  ListExpensesQuery,
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
};

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

  const expense = await prisma.expense.create({
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
      status: data.status ?? "draft",
      splitPct: data.splitPct ?? 50,
      notes: data.notes ?? null,
    },
    include: EXPENSE_INCLUDE,
  });

  return expense;
}

export async function listExpenses(
  householdId: string,
  query: ListExpensesQuery
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

  return { data, total, page, limit };
}

export async function getExpense(id: string, householdId: string) {
  const expense = await prisma.expense.findFirst({
    where: { id, householdId, deletedAt: null },
    include: EXPENSE_INCLUDE,
  });
  return expense;
}

export async function updateExpense(
  id: string,
  householdId: string,
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
  if (data.categoryId && data.categoryId !== expense.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: data.categoryId, householdId },
    });
    if (!category) {
      throw new AppError("Category not found in this household.", 400);
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
  if (data.splitPct !== undefined) updateData.splitPct = data.splitPct;
  if (data.notes !== undefined) updateData.notes = data.notes;

  const updated = await prisma.expense.update({
    where: { id },
    data: updateData,
    include: EXPENSE_INCLUDE,
  });

  return updated;
}

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
