import { Response, NextFunction } from "express";
import { AuthenticatedRequest, AppError } from "../../types";
import * as expenseService from "./service";
import { getBalanceSummary, getApprovalInbox } from "./queries";
import {
  createExpenseSchema,
  updateExpenseSchema,
  listExpensesQuerySchema,
  rejectExpenseSchema,
  updateReimbursementSchema,
  settleExpenseSchema,
  updateSettlementSchema,
  createSeriesSchema,
  updateSeriesSchema,
  listSeriesQuerySchema,
  generateSeriesSchema,
} from "./validators";
import { MemberRole } from "./calculations";
import * as workflow from "./workflow";
import * as recurrence from "./recurrence";

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

export async function approve(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    const expense = await workflow.approveExpense(
      req.params.id as string,
      req.householdId,
      req.userId
    );
    res.json(expense);
  } catch (err) {
    next(err);
  }
}

export async function reject(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    const parsed = rejectExpenseSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        `Validation error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        400
      );
    }

    const expense = await workflow.rejectExpense(
      req.params.id as string,
      req.householdId,
      req.userId,
      parsed.data.reason,
      parsed.data.detail
    );
    res.json(expense);
  } catch (err) {
    next(err);
  }
}

export async function approvalInbox(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    getRequesterRole(req); // enforce parent-only access

    const items = await getApprovalInbox(req.householdId, req.userId);
    res.json({ data: items, total: items.length });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Reimbursement Update
// ---------------------------------------------------------------------------

export async function updateReimbursement(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    getRequesterRole(req); // enforce parent-only

    const parsed = updateReimbursementSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        `Validation error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        400
      );
    }

    const expense = await workflow.updateReimbursement(
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

// ---------------------------------------------------------------------------
// Settle
// ---------------------------------------------------------------------------

export async function settle(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    getRequesterRole(req); // enforce parent-only

    const parsed = settleExpenseSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        `Validation error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        400
      );
    }

    const expense = await workflow.settleExpense(
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

// ---------------------------------------------------------------------------
// Update Settlement
// ---------------------------------------------------------------------------

export async function updateSettlement(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    getRequesterRole(req); // enforce parent-only

    const parsed = updateSettlementSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        `Validation error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        400
      );
    }

    const expense = await workflow.updateSettlement(
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

// ---------------------------------------------------------------------------
// Recurring Expense Series (Phase 4D2)
// ---------------------------------------------------------------------------

export async function createSeriesHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    getRequesterRole(req); // enforce parent-only

    const parsed = createSeriesSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        `Validation error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        400
      );
    }

    const series = await recurrence.createSeries(
      req.householdId,
      req.userId,
      parsed.data
    );
    res.status(201).json(series);
  } catch (err) {
    next(err);
  }
}

export async function listSeriesHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId)
      throw new AppError("No household.", 403);

    getRequesterRole(req);

    const parsed = listSeriesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(
        `Validation error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        400
      );
    }

    const result = await recurrence.listSeries(req.householdId, parsed.data);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getSeriesDetailHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId)
      throw new AppError("No household.", 403);

    getRequesterRole(req);

    const detail = await recurrence.getSeriesDetail(
      req.params.seriesId as string,
      req.householdId
    );
    res.json(detail);
  } catch (err) {
    next(err);
  }
}

export async function updateSeriesHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    getRequesterRole(req);

    const parsed = updateSeriesSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        `Validation error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        400
      );
    }

    if (parsed.data.editScope === "single") {
      // For single edits, the expenseId comes from the URL
      const expenseId = req.params.expenseId as string | undefined;
      if (!expenseId) {
        throw new AppError("expenseId is required for single instance edits.", 400);
      }
      const result = await recurrence.updateSeriesSingleInstance(
        expenseId as string,
        req.householdId,
        req.userId,
        parsed.data
      );
      res.json(result);
    } else {
      // future scope — seriesId from URL
      const result = await recurrence.updateSeriesFuture(
        req.params.seriesId as string,
        req.householdId,
        req.userId,
        parsed.data
      );
      res.json(result);
    }
  } catch (err) {
    next(err);
  }
}

export async function pauseSeriesHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    getRequesterRole(req);

    const result = await recurrence.pauseSeries(
      req.params.seriesId as string,
      req.householdId,
      req.userId
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function resumeSeriesHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    getRequesterRole(req);

    const result = await recurrence.resumeSeries(
      req.params.seriesId as string,
      req.householdId,
      req.userId
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function archiveSeriesHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    getRequesterRole(req);

    const result = await recurrence.archiveSeries(
      req.params.seriesId as string,
      req.householdId,
      req.userId
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function generateSeriesHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    getRequesterRole(req);

    const parsed = generateSeriesSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        `Validation error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        400
      );
    }

    const upToDate = parsed.data.upToDate
      ? new Date(parsed.data.upToDate)
      : undefined;

    const result = await recurrence.generateSeriesInstances(
      req.params.seriesId as string,
      req.householdId,
      req.userId,
      upToDate
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}
