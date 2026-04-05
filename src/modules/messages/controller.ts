import { Response, NextFunction } from "express";
import { AuthenticatedRequest, AppError } from "../../types";
import * as messageService from "./service";
import {
  sendMessageSchema,
  listMessagesQuerySchema,
  deleteMessageSchema,
} from "./validators";

export async function send(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const profileId = req.userId;
    const householdId = req.householdId;

    if (!profileId || !householdId) {
      return next(new AppError("Authentication required.", 401));
    }

    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new AppError(parsed.error.errors[0].message, 400));
    }

    const message = await messageService.sendMessage(
      householdId,
      profileId,
      parsed.data
    );

    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
}

export async function listByConversation(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const profileId = req.userId;
    const householdId = req.householdId;
    const conversationId = req.params.id;

    if (!profileId || !householdId) {
      return next(new AppError("Authentication required.", 401));
    }

    const parsed = listMessagesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return next(new AppError(parsed.error.errors[0].message, 400));
    }

    const result = await messageService.listMessages(
      householdId,
      conversationId,
      profileId,
      parsed.data
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function remove(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const profileId = req.userId;
    const householdId = req.householdId;
    const messageId = req.params.id;

    if (!profileId || !householdId) {
      return next(new AppError("Authentication required.", 401));
    }

    const parsed = deleteMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new AppError(parsed.error.errors[0].message, 400));
    }

    const result = await messageService.deleteMessage(
      householdId,
      profileId,
      messageId,
      parsed.data.mode
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
}
