import { Response, NextFunction } from "express";
import { AuthenticatedRequest, AppError } from "../../types";
import * as householdService from "./service";

export async function create(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) throw new AppError("Not authenticated.", 401);

    const { name } = req.body;
    if (!name) throw new AppError("Household name is required.", 400);

    const result = await householdService.createHousehold(req.userId, name);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}
