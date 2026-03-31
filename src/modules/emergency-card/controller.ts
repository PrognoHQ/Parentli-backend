import { Response, NextFunction } from "express";
import { AuthenticatedRequest, AppError } from "../../types";
import * as emergencyCardService from "./service";

export async function getEmergencyCard(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId) throw new AppError("No household.", 403);

    const card = await emergencyCardService.getEmergencyCardForParent(
      req.params.childId as string,
      req.householdId
    );
    res.json(card);
  } catch (err) {
    next(err);
  }
}

export async function getEmergencyCardFamily(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId) throw new AppError("No household.", 403);

    const { familyCircleMemberId } = req.query;
    if (!familyCircleMemberId || typeof familyCircleMemberId !== "string") {
      throw new AppError("familyCircleMemberId query param is required.", 400);
    }

    const card = await emergencyCardService.getEmergencyCardForFamilyCircle(
      req.params.childId as string,
      req.householdId,
      familyCircleMemberId
    );
    res.json(card);
  } catch (err) {
    next(err);
  }
}
