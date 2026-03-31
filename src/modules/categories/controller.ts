import { Response, NextFunction } from "express";
import { AuthenticatedRequest, AppError } from "../../types";
import * as categoryService from "./service";

export async function list(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.householdId) throw new AppError("No household.", 403);
    const categories = await categoryService.listCategories(req.householdId);
    res.json(categories);
  } catch (err) {
    next(err);
  }
}

export async function create(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId || !req.householdId) {
      throw new AppError("Not authenticated or no household.", 401);
    }

    const { label, slug, emoji, color } = req.body;
    if (!label || !slug || !emoji || !color) {
      throw new AppError("label, slug, emoji, and color are required.", 400);
    }

    const category = await categoryService.createCategory(
      req.householdId,
      req.userId,
      { label, slug, emoji, color }
    );
    res.status(201).json(category);
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

    const id = req.params.id as string;
    const { label, emoji, color, position, archived } = req.body;

    const category = await categoryService.updateCategory(id, req.householdId, {
      label,
      emoji,
      color,
      position,
      archivedAt: archived === true ? new Date() : archived === false ? null : undefined,
    });
    res.json(category);
  } catch (err) {
    next(err);
  }
}
