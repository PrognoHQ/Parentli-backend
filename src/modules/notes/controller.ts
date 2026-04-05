import { Response, NextFunction } from "express";
import { AuthenticatedRequest, AppError } from "../../types";
import * as noteService from "./service";
import {
  createNoteSchema,
  updateNoteSchema,
  listNotesQuerySchema,
} from "./validators";

export async function create(
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

    const parsed = createNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new AppError(parsed.error.issues[0].message, 400));
    }

    const note = await noteService.createNote(householdId, {
      profileId,
      familyCircleMemberId: req.familyCircleMemberId,
      data: parsed.data,
    });

    res.status(201).json(note);
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
    const householdId = req.householdId;

    if (!req.userId || !householdId) {
      return next(new AppError("Authentication required.", 401));
    }

    const parsed = listNotesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return next(new AppError(parsed.error.issues[0].message, 400));
    }

    const result = await noteService.listNotes(householdId, parsed.data);

    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function get(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const householdId = req.householdId;

    if (!req.userId || !householdId) {
      return next(new AppError("Authentication required.", 401));
    }

    const noteId = req.params.id as string;
    const note = await noteService.getNote(householdId, noteId);

    res.json(note);
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
    const householdId = req.householdId;
    const profileId = req.userId;

    if (!profileId || !householdId) {
      return next(new AppError("Authentication required.", 401));
    }

    const parsed = updateNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new AppError(parsed.error.issues[0].message, 400));
    }

    const noteId = req.params.id as string;
    const note = await noteService.updateNote(householdId, noteId, {
      profileId,
      familyCircleMemberId: req.familyCircleMemberId,
      data: parsed.data,
    });

    res.json(note);
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
    const householdId = req.householdId;
    const profileId = req.userId;

    if (!profileId || !householdId) {
      return next(new AppError("Authentication required.", 401));
    }

    const noteId = req.params.id as string;
    const result = await noteService.deleteNote(householdId, noteId, {
      profileId,
      familyCircleMemberId: req.familyCircleMemberId,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}
