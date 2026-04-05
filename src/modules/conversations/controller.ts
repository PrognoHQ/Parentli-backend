import { Response, NextFunction } from "express";
import { AuthenticatedRequest, AppError } from "../../types";
import * as conversationService from "./service";

export async function getOrCreateCoparent(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    const conversation =
      await conversationService.getOrCreateCoparentConversation(
        req.householdId,
        req.userId
      );
    res.json(conversation);
  } catch (err) {
    next(err);
  }
}

export async function createGroup(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    const { name, purposeBadge, memberIds } = req.body;

    if (memberIds !== undefined && !Array.isArray(memberIds)) {
      throw new AppError("memberIds must be an array.", 400);
    }

    const conversation = await conversationService.createGroupConversation(
      req.householdId,
      req.userId,
      { name, purposeBadge, memberIds }
    );
    res.status(201).json(conversation);
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
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    const conversations = await conversationService.listConversations(
      req.householdId,
      req.userId
    );
    res.json(conversations);
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
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    const conversation = await conversationService.getConversationDetail(
      req.householdId,
      req.params.id as string,
      req.userId
    );
    res.json(conversation);
  } catch (err) {
    next(err);
  }
}
