import { Response, NextFunction } from "express";
import { AuthenticatedRequest, AppError } from "../../types";
import { prisma } from "../../lib/prisma";
import {
  hasParentCapability,
  hasFamilyCircleCapability,
} from "../../lib/permissions";

/**
 * Notes-specific tenant middleware.
 *
 * 1. Tries HouseholdMember lookup (parent path).
 * 2. Falls back to FamilyCircleMember lookup (FC path).
 * 3. Rejects if neither membership exists.
 */
export function notesTenantMiddleware() {
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

      if (!requestedHouseholdId) {
        return next(
          new AppError("x-household-id header is required.", 400)
        );
      }

      // Try parent membership first
      const membership = await prisma.householdMember.findUnique({
        where: {
          householdId_profileId: {
            householdId: requestedHouseholdId,
            profileId: req.userId,
          },
          status: "active",
        },
      });

      if (membership) {
        req.householdId = membership.householdId;
        req.membershipRole = membership.role;
        return next();
      }

      // Fall back to Family Circle membership
      const fcMember = await prisma.familyCircleMember.findFirst({
        where: {
          householdId: requestedHouseholdId,
          joinedProfileId: req.userId,
          status: "active",
        },
      });

      if (fcMember) {
        req.householdId = fcMember.householdId;
        req.familyCircleMemberId = fcMember.id;
        req.familyCircleRole = fcMember.role;
        return next();
      }

      return next(new AppError("No household membership found.", 403));
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Capability middleware that checks either parent or FC role.
 */
export function requireNoteCapability(capability: string) {
  return (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ): void => {
    // Parent path
    if (req.membershipRole) {
      if (hasParentCapability(req.membershipRole, capability)) {
        return next();
      }
    }

    // FC path
    if (req.familyCircleRole) {
      if (hasFamilyCircleCapability(req.familyCircleRole, capability)) {
        return next();
      }
    }

    return next(
      new AppError("You do not have permission for this action.", 403)
    );
  };
}
