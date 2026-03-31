import { Response, NextFunction } from "express";
import { AuthenticatedRequest, AppError } from "../../types";
import { fetchBootstrapData } from "../../lib/db";

export async function getBootstrap(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId) {
      throw new AppError("Not authenticated or no household.", 401);
    }

    const data = await fetchBootstrapData(req.userId, req.householdId);

    if (!data) {
      throw new AppError("Bootstrap data not found.", 404);
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
}
