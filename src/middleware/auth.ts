import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AuthenticatedRequest, AppError, JwtPayload } from "../types";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export function authMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return next(new AppError("Missing or invalid authorization header.", 401));
  }

  const token = header.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.userId = decoded.sub;
    next();
  } catch {
    next(new AppError("Invalid or expired token.", 401));
  }
}
