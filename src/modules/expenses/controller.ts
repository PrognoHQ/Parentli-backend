import { Response, NextFunction } from "express";
import { AuthenticatedRequest, AppError } from "../../types";
import * as expenseService from "./service";
import { getBalanceSummary } from "./queries";
import {
  createExpenseSchema,
  updateExpenseSchema,
  listExpensesQuerySchema,
} from "./validators";
import { MemberRole } from "./calculations";

function getRequesterRole(req: AuthenticatedRequest): MemberRole {
  const role = req.membershipRole;
  if (role !== "owner" && role !== "coparent") {
    throw new AppError("Invalid membership role for expense operations.", 403);
  }
  return role;
}

export async function create(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    const parsed = createExpenseSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        `Validation error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        400
      );
    }

    const expense = await expenseService.createExpense(
      req.householdId,
      req.userId,
      parsed.data
    );
    res.status(201).json(expense);
  } catch (err) {
    next(err);
  }
}

export async function list(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId)
      throw new AppError("No household.", 403);

    const parsed = listExpensesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(
        `Validation error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        400
      );
    }

    const role = getRequesterRole(req);
    const result = await expenseService.listExpenses(
      req.householdId,
      parsed.data,
      role
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getDetail(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId)
      throw new AppError("No household.", 403);

    const role = getRequesterRole(req);
    const expense = await expenseService.getExpense(
      req.params.id as string,
      req.householdId,
      role
    );
    if (!expense) throw new AppError("Expense not found.", 404);
    res.json(expense);
  } catch (err) {
    next(err);
  }
}

export async function update(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    const parsed = updateExpenseSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        `Validation error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        400
      );
    }

    const expense = await expenseService.updateExpense(
      req.params.id as string,
      req.householdId,
      req.userId,
      parsed.data
    );
    res.json(expense);
  } catch (err) {
    next(err);
  }
}

export async function remove(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId) throw new AppError("No household.", 403);
    await expenseService.deleteExpense(
      req.params.id as string,
      req.householdId
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function balanceSummary(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId)
      throw new AppError("No household.", 403);

    const role = getRequesterRole(req);
    const summary = await getBalanceSummary(req.householdId, role);
    res.json(summary);
  } catch (err) {
    next(err);
  }
}
