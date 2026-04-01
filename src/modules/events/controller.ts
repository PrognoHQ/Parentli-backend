import { Response, NextFunction } from "express";
import { AuthenticatedRequest, AppError } from "../../types";
import * as eventService from "./service";
import * as eventQueries from "./queries";
import * as eventApprovals from "./approvals";
import {
  createEventSchema,
  updateEventSchema,
  rejectEventSchema,
  checklistItemSchema,
  reorderChecklistSchema,
} from "./validators";

// --- Event CRUD ---

export async function create(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    const parsed = createEventSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        `Validation error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        400
      );
    }

    const event = await eventService.createEvent(
      req.householdId,
      req.userId,
      parsed.data
    );
    res.status(201).json(event);
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
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    const parsed = updateEventSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        `Validation error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        400
      );
    }

    const event = await eventService.updateEvent(
      req.params.id as string,
      req.householdId,
      req.userId,
      parsed.data
    );
    res.json(event);
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
    if (!req.householdId) throw new AppError("No household.", 403);
    await eventService.deleteEvent(req.params.id as string, req.householdId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// --- Read Models ---

export async function getDetail(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId) throw new AppError("No household.", 403);
    const event = await eventQueries.getEventDetail(req.params.id as string, req.householdId);
    if (!event) throw new AppError("Event not found.", 404);
    res.json(event);
  } catch (err) {
    next(err);
  }
}

export async function listByRange(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId) throw new AppError("No household.", 403);

    const { start, end } = req.query;
    if (!start || !end) {
      throw new AppError("start and end query parameters are required.", 400);
    }

    const rangeStart = new Date(start as string);
    const rangeEnd = new Date(end as string);
    if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
      throw new AppError("start and end must be valid ISO dates.", 400);
    }

    const events = await eventQueries.getEventsForRange(
      req.householdId,
      rangeStart,
      rangeEnd
    );
    res.json(events);
  } catch (err) {
    next(err);
  }
}

export async function getUpcoming(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId) throw new AppError("No household.", 403);
    const limit = parseInt(req.query.limit as string) || 10;
    const events = await eventQueries.getUpcomingEvents(req.householdId, limit);
    res.json(events);
  } catch (err) {
    next(err);
  }
}

export async function getInbox(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    const events = await eventQueries.getApprovalInbox(
      req.householdId,
      req.userId
    );
    res.json(events);
  } catch (err) {
    next(err);
  }
}

// --- Approval Actions ---

export async function approve(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    await eventApprovals.approveEvent(
      req.params.id as string,
      req.householdId,
      req.userId
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function reject(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    const parsed = rejectEventSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        `Validation error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        400
      );
    }

    await eventApprovals.rejectEvent(
      req.params.id as string,
      req.householdId,
      req.userId,
      parsed.data.rejectionReason,
      parsed.data.rejectionCounterType,
      parsed.data.rejectionCounterValue
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function processExpired(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await eventApprovals.processExpiredEventApprovals();
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// --- Checklist Operations ---

export async function addChecklistItem(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    const parsed = checklistItemSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        `Validation error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        400
      );
    }

    const item = await eventService.addChecklistItem(
      req.params.id as string,
      req.householdId,
      req.userId,
      parsed.data.text
    );
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
}

export async function updateChecklistItem(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId) throw new AppError("No household.", 403);

    const parsed = checklistItemSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        `Validation error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        400
      );
    }

    const item = await eventService.updateChecklistItemText(
      req.params.itemId as string,
      req.params.id as string,
      req.householdId,
      parsed.data.text
    );
    res.json(item);
  } catch (err) {
    next(err);
  }
}

export async function toggleChecklistItem(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    const item = await eventService.toggleChecklistItem(
      req.params.itemId as string,
      req.params.id as string,
      req.householdId,
      req.userId
    );
    res.json(item);
  } catch (err) {
    next(err);
  }
}

export async function deleteChecklistItem(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId) throw new AppError("No household.", 403);
    await eventService.deleteChecklistItem(
      req.params.itemId as string,
      req.params.id as string,
      req.householdId
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function reorderChecklistItems(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId) throw new AppError("No household.", 403);

    const parsed = reorderChecklistSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        `Validation error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        400
      );
    }

    await eventService.reorderChecklistItems(
      req.params.id as string,
      req.householdId,
      parsed.data.orderedIds
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
