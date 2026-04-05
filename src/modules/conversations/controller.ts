import { Response, NextFunction } from "express";
import { AuthenticatedRequest, AppError } from "../../types";
import * as conversationService from "./service";
import { createGroupConversationSchema } from "./validators";

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

    const parsed = createGroupConversationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        `Invalid input: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        400
      );
    }

    const conversation = await conversationService.createGroupConversation(
      req.householdId,
      req.userId,
      parsed.data
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
