import { Response, NextFunction } from "express";
import { AuthenticatedRequest, AppError } from "../types";
import { prisma } from "../lib/prisma";

export function tenantMiddleware(options?: { optional?: boolean }) {
  return async (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.userId) {
        return next(new AppError("Authentication required.", 401));
      }

      const requestedHouseholdId = req.headers["x-household-id"] as
        | string
        | undefined;

      if (!requestedHouseholdId && !options?.optional) {
        return next(
          new AppError("x-household-id header is required.", 400)
        );
      }

      const membership = requestedHouseholdId
        ? await prisma.householdMember.findUnique({
            where: {
              householdId_profileId: {
                householdId: requestedHouseholdId,
                profileId: req.userId,
              },
              status: "active",
            },
          })
        : null;

      if (!membership) {
        if (options?.optional) {
          return next();
        }
        return next(new AppError("No household membership found.", 403));
      }

      req.householdId = membership.householdId;
      req.membershipRole = membership.role;
      next();
    } catch (err) {
      next(err);
    }
  };
}
