import { Response, NextFunction } from "express";
import { AuthenticatedRequest, AppError } from "../../types";
import * as familyCircleService from "./service";

function requireParentRole(req: AuthenticatedRequest): void {
  if (req.membershipRole !== "owner" && req.membershipRole !== "coparent") {
    throw new AppError(
      "Only owner or coparent can manage Family Circle members.",
      403
    );
  }
}

export async function createMember(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);
    requireParentRole(req);

    const { name, relationship, role, accessType } = req.body;
    if (!name || !relationship || !role || !accessType) {
      throw new AppError(
        "name, relationship, role, and accessType are required.",
        400
      );
    }

    const member = await familyCircleService.createMember(
      req.householdId,
      req.userId,
      req.body
    );
    res.status(201).json(member);
  } catch (err) {
    next(err);
  }
}

export async function listMembers(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId) throw new AppError("No household.", 403);
    requireParentRole(req);
    const members = await familyCircleService.listMembers(req.householdId);
    res.json(members);
  } catch (err) {
    next(err);
  }
}

export async function getMember(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId) throw new AppError("No household.", 403);
    requireParentRole(req);
    const member = await familyCircleService.getMember(
      req.params.id as string,
      req.householdId
    );
    res.json(member);
  } catch (err) {
    next(err);
  }
}

export async function updateMember(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);
    requireParentRole(req);

    const member = await familyCircleService.updateMember(
      req.params.id as string,
      req.householdId,
      req.userId,
      req.body
    );
    res.json(member);
  } catch (err) {
    next(err);
  }
}

export async function revokeMember(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);
    requireParentRole(req);

    const member = await familyCircleService.revokeMember(
      req.params.id as string,
      req.householdId,
      req.userId
    );
    res.json(member);
  } catch (err) {
    next(err);
  }
}

export async function assignChildren(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);
    requireParentRole(req);

    const { childIds } = req.body;
    if (!Array.isArray(childIds)) {
      throw new AppError("childIds must be an array.", 400);
    }

    const member = await familyCircleService.assignChildren(
      req.params.id as string,
      req.householdId,
      req.userId,
      childIds
    );
    res.json(member);
  } catch (err) {
    next(err);
  }
}

export async function getActivityLog(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId) throw new AppError("No household.", 403);
    requireParentRole(req);
    const log = await familyCircleService.getActivityLog(req.householdId);
    res.json(log);
  } catch (err) {
    next(err);
  }
}
