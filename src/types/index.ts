import { Request } from "express";

export interface AuthenticatedRequest extends Request {
  userId?: string;
  householdId?: string;
  membershipRole?: string;
  familyCircleMemberId?: string;
  familyCircleRole?: string;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export interface JwtPayload {
  sub: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface BootstrapResponse {
  profile: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    avatarUrl: string | null;
  };
  household: {
    id: string;
    name: string;
    status: string;
    timezone: string | null;
    handoffTimeDefault: string | null;
  } | null;
  membership: {
    role: string;
    status: string;
    joinedAt: string;
  } | null;
  onboarding: {
    currentStep: string;
    completedSteps: unknown;
    isComplete: boolean;
    payload: unknown;
  } | null;
  settings: unknown | null;
  categories: Array<{
    id: string;
    slug: string;
    label: string;
    emoji: string;
    color: string;
    position: number;
    isDefault: boolean;
  }>;
}
