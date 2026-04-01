/**
 * Role-capability permission layer.
 *
 * Parent roles (owner / coparent) come from HouseholdMember.role
 * and are resolved by tenantMiddleware onto req.membershipRole.
 *
 * Family Circle roles (viewer / contributor / carer) are stored on
 * FamilyCircleMember.role and checked explicitly in services.
 */

const PARENT_CAPABILITIES: Record<string, string[]> = {
  owner: [
    "children:read",
    "children:write",
    "medical:read",
    "medical:write",
    "school_care:read",
    "school_care:write",
    "emergency:read",
    "emergency:write",
    "custody:read",
    "custody:write",
    "family_circle:manage",
    "events:read",
    "events:write",
  ],
  coparent: [
    "children:read",
    "children:write",
    "medical:read",
    "medical:write",
    "school_care:read",
    "school_care:write",
    "emergency:read",
    "emergency:write",
    "custody:read",
    "custody:write",
    "family_circle:manage",
    "events:read",
    "events:write",
  ],
};

const FAMILY_CIRCLE_CAPABILITIES: Record<string, string[]> = {
  viewer: ["children:read"],
  contributor: ["children:read", "school_care:read"],
  carer: [
    "children:read",
    "medical:read",
    "emergency:read",
    "school_care:read",
  ],
};

export function hasParentCapability(
  role: string,
  capability: string
): boolean {
  const caps = PARENT_CAPABILITIES[role];
  return caps ? caps.includes(capability) : false;
}

export function hasFamilyCircleCapability(
  role: string,
  capability: string
): boolean {
  const caps = FAMILY_CIRCLE_CAPABILITIES[role];
  return caps ? caps.includes(capability) : false;
}

/**
 * Express middleware factory that checks the parent role on req.membershipRole.
 */
import { Response, NextFunction } from "express";
import { AuthenticatedRequest, AppError } from "../types";

export function requireCapability(capability: string) {
  return (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ): void => {
    const role = req.membershipRole;
    if (!role || !hasParentCapability(role, capability)) {
      return next(
        new AppError("You do not have permission for this action.", 403)
      );
    }
    next();
  };
}
