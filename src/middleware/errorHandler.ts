import { Request, Response, NextFunction } from "express";
import { AppError } from "../types";
import { Prisma } from "@prisma/client";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      res.status(409).json({ error: "A record with that value already exists." });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({ error: "Record not found." });
      return;
    }
  }

  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
}
