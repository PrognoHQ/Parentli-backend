import { Response, NextFunction } from "express";
import { AuthenticatedRequest, AppError } from "../../types";
import * as settingsService from "./service";

export async function get(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId) {
      throw new AppError("Not authenticated or no household.", 401);
    }

    const settings = await settingsService.getSettings(
      req.userId,
      req.householdId
    );
    res.json(settings);
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
    if (!req.userId || !req.householdId) {
      throw new AppError("Not authenticated or no household.", 401);
    }

    const settings = await settingsService.updateSettings(
      req.userId,
      req.householdId,
      req.body
    );
    res.json(settings);
  } catch (err) {
    next(err);
  }
}
