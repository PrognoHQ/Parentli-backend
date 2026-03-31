import { Response, NextFunction } from "express";
import { AuthenticatedRequest, AppError } from "../../types";
import * as inviteService from "./service";

export async function create(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId) {
      throw new AppError("Not authenticated or no household.", 401);
    }

    const { email } = req.body;
    const invite = await inviteService.createInvite(
      req.householdId,
      req.userId,
      email
    );
    res.status(201).json(invite);
  } catch (err) {
    next(err);
  }
}

export async function validate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const code = req.params.code as string;
    if (!code) throw new AppError("Invite code is required.", 400);

    const result = await inviteService.validateInvite(code);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function accept(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) throw new AppError("Not authenticated.", 401);

    const code = req.params.code as string;
    if (!code) throw new AppError("Invite code is required.", 400);

    const result = await inviteService.acceptInvite(code, req.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
