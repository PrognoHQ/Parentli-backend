import { Response, NextFunction } from "express";
import { AuthenticatedRequest, AppError } from "../../types";
import * as custodyService from "./service";

export async function createOrReplaceSchedule(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    const { name, days } = req.body;
    if (!name || !days) {
      throw new AppError("name and days are required.", 400);
    }

    const schedule = await custodyService.createOrReplaceSchedule(
      req.householdId,
      req.userId,
      req.body
    );
    res.status(201).json(schedule);
  } catch (err) {
    next(err);
  }
}

export async function getActiveSchedule(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId) throw new AppError("No household.", 403);
    const schedule = await custodyService.getActiveSchedule(req.householdId);
    res.json(schedule);
  } catch (err) {
    next(err);
  }
}

export async function getHandoffPreferences(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId) throw new AppError("No household.", 403);
    const prefs = await custodyService.getHandoffPreferences(req.householdId);
    res.json(prefs);
  } catch (err) {
    next(err);
  }
}

export async function upsertHandoffPreferences(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId) throw new AppError("No household.", 403);
    const prefs = await custodyService.upsertHandoffPreferences(
      req.householdId,
      req.body
    );
    res.json(prefs);
  } catch (err) {
    next(err);
  }
}
