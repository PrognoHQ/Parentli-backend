import { Response, NextFunction } from "express";
import { AuthenticatedRequest, AppError } from "../../types";
import * as childrenService from "./service";

// ---------- children ----------

export async function create(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId)
      throw new AppError("Not authenticated or no household.", 401);

    const { firstName, dob, emoji, color, lastName, photoUrl, allergyNote } =
      req.body;
    if (!firstName || !dob || !emoji || !color) {
      throw new AppError(
        "firstName, dob, emoji, and color are required.",
        400
      );
    }

    const child = await childrenService.createChild(
      req.householdId,
      req.userId,
      { firstName, lastName, dob, emoji, color, photoUrl, allergyNote }
    );
    res.status(201).json(child);
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
    if (!req.householdId) throw new AppError("No household.", 403);
    const children = await childrenService.listChildren(req.householdId);
    res.json(children);
  } catch (err) {
    next(err);
  }
}

export async function getById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId) throw new AppError("No household.", 403);
    const child = await childrenService.getChild(req.params.id as string, req.householdId);
    res.json(child);
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
    if (!req.householdId) throw new AppError("No household.", 403);
    const child = await childrenService.updateChild(
      req.params.id as string,
      req.householdId,
      req.body
    );
    res.json(child);
  } catch (err) {
    next(err);
  }
}

// ---------- school/care ----------

export async function upsertSchoolCare(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId) throw new AppError("No household.", 403);
    const result = await childrenService.upsertSchoolCare(
      req.params.id as string,
      req.householdId,
      req.body
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getSchoolCare(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId) throw new AppError("No household.", 403);
    const result = await childrenService.getSchoolCare(
      req.params.id as string,
      req.householdId
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// ---------- medical ----------

export async function upsertMedical(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId) throw new AppError("No household.", 403);
    const result = await childrenService.upsertMedical(
      req.params.id as string,
      req.householdId,
      req.body
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getMedical(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId) throw new AppError("No household.", 403);
    const result = await childrenService.getMedical(
      req.params.id as string,
      req.householdId
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// ---------- emergency contacts ----------

export async function listEmergencyContacts(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId) throw new AppError("No household.", 403);
    const contacts = await childrenService.listEmergencyContacts(
      req.params.id as string,
      req.householdId
    );
    res.json(contacts);
  } catch (err) {
    next(err);
  }
}

export async function createEmergencyContact(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId) throw new AppError("No household.", 403);

    const { name, relationship, phone } = req.body;
    if (!name || !relationship || !phone) {
      throw new AppError("name, relationship, and phone are required.", 400);
    }

    const contact = await childrenService.createEmergencyContact(
      req.params.id as string,
      req.householdId,
      req.body
    );
    res.status(201).json(contact);
  } catch (err) {
    next(err);
  }
}

export async function updateEmergencyContact(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId) throw new AppError("No household.", 403);
    const contact = await childrenService.updateEmergencyContact(
      req.params.contactId as string,
      req.params.id as string,
      req.householdId,
      req.body
    );
    res.json(contact);
  } catch (err) {
    next(err);
  }
}

export async function deleteEmergencyContact(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId) throw new AppError("No household.", 403);
    await childrenService.deleteEmergencyContact(
      req.params.contactId as string,
      req.params.id as string,
      req.householdId
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function reorderEmergencyContacts(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId) throw new AppError("No household.", 403);

    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      throw new AppError("orderedIds must be an array.", 400);
    }

    await childrenService.reorderEmergencyContacts(
      req.params.id as string,
      req.householdId,
      orderedIds
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
