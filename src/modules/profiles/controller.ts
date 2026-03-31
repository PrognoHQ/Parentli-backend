import { Response, NextFunction } from "express";
import { AuthenticatedRequest, AppError } from "../../types";
import * as profileService from "./service";

export async function getMe(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) throw new AppError("Not authenticated.", 401);
    const profile = await profileService.getProfile(req.userId);
    res.json(profile);
  } catch (err) {
    next(err);
  }
}

export async function updateMe(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) throw new AppError("Not authenticated.", 401);
    const { firstName, lastName, phone, avatarUrl } = req.body;
    const profile = await profileService.updateProfile(req.userId, {
      firstName,
      lastName,
      phone,
      avatarUrl,
    });
    res.json(profile);
  } catch (err) {
    next(err);
  }
}
