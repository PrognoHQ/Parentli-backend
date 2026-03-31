import { Response, NextFunction } from "express";
import { AuthenticatedRequest, AppError } from "../../types";
import * as onboardingService from "./service";

export async function get(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId) {
      throw new AppError("Not authenticated or no household.", 401);
    }

    const state = await onboardingService.getOnboardingState(
      req.userId,
      req.householdId
    );
    res.json(state);
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

    const { currentStep, completedSteps, isComplete, payload } = req.body;

    const state = await onboardingService.updateOnboardingState(
      req.userId,
      req.householdId,
      { currentStep, completedSteps, isComplete, payload }
    );
    res.json(state);
  } catch (err) {
    next(err);
  }
}
