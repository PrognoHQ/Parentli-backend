import crypto from "crypto";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../types";
import { DEFAULT_SETTINGS } from "../../types/settings";

const INVITE_EXPIRY_HOURS = 72;

export async function listInvites(householdId: string) {
  const invites = await prisma.coparentInvite.findMany({
    where: { householdId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      inviteCode: true,
      inviteEmail: true,
      status: true,
      expiresAt: true,
      createdAt: true,
      sender: { select: { firstName: true, lastName: true } },
      acceptor: { select: { firstName: true, lastName: true } },
    },
  });

  return invites.map((inv) => ({
    id: inv.id,
    inviteCode: inv.inviteCode,
    inviteEmail: inv.inviteEmail,
    status: new Date() > inv.expiresAt && inv.status === "pending" ? "expired" : inv.status,
    expiresAt: inv.expiresAt,
    createdAt: inv.createdAt,
    invitedBy: `${inv.sender.firstName} ${inv.sender.lastName}`,
    acceptedBy: inv.acceptor
      ? `${inv.acceptor.firstName} ${inv.acceptor.lastName}`
      : null,
  }));
}

export async function revokeInvite(code: string, householdId: string) {
  const invite = await prisma.coparentInvite.findUnique({
    where: { inviteCode: code },
  });

  if (!invite || invite.householdId !== householdId) {
    throw new AppError("Invite not found.", 404);
  }

  if (invite.status !== "pending") {
    throw new AppError(`Cannot revoke invite that is ${invite.status}.`, 400);
  }

  await prisma.coparentInvite.update({
    where: { id: invite.id },
    data: { status: "revoked" },
  });

  return { success: true };
}

export async function createInvite(
  householdId: string,
  invitedByProfileId: string,
  inviteEmail?: string
) {
  const inviteCode = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);

  const invite = await prisma.coparentInvite.create({
    data: {
      householdId,
      invitedBy: invitedByProfileId,
      inviteCode,
      inviteEmail: inviteEmail || null,
      status: "pending",
      expiresAt,
    },
  });

  return {
    id: invite.id,
    inviteCode: invite.inviteCode,
    expiresAt: invite.expiresAt,
    status: invite.status,
  };
}

export async function validateInvite(code: string) {
  const invite = await prisma.coparentInvite.findUnique({
    where: { inviteCode: code },
    include: {
      household: { select: { id: true, name: true } },
      sender: { select: { firstName: true, lastName: true } },
    },
  });

  if (!invite) {
    return { valid: false, reason: "not_found" as const };
  }

  if (invite.status === "revoked") {
    return { valid: false, reason: "revoked" as const };
  }

  if (invite.status === "accepted") {
    return { valid: false, reason: "already_accepted" as const };
  }

  if (new Date() > invite.expiresAt) {
    await prisma.coparentInvite.update({
      where: { id: invite.id },
      data: { status: "expired" },
    });
    return { valid: false, reason: "expired" as const };
  }

  return {
    valid: true,
    reason: "valid" as const,
    householdName: invite.household.name,
    householdId: invite.household.id,
    invitedBy: `${invite.sender.firstName} ${invite.sender.lastName}`,
  };
}

export async function acceptInvite(code: string, profileId: string) {
  const invite = await prisma.coparentInvite.findUnique({
    where: { inviteCode: code },
    include: { household: true },
  });

  if (!invite) {
    throw new AppError("Invite not found.", 404);
  }

  if (invite.status !== "pending") {
    throw new AppError(`Invite is ${invite.status}.`, 400);
  }

  if (new Date() > invite.expiresAt) {
    await prisma.coparentInvite.update({
      where: { id: invite.id },
      data: { status: "expired" },
    });
    throw new AppError("Invite has expired.", 400);
  }

  const existingMember = await prisma.householdMember.findUnique({
    where: {
      householdId_profileId: {
        householdId: invite.householdId,
        profileId,
      },
    },
  });

  if (existingMember) {
    throw new AppError("User is already a member of this household.", 409);
  }

  const result = await prisma.$transaction(async (tx) => {
    const updatedInvite = await tx.coparentInvite.update({
      where: { id: invite.id },
      data: {
        status: "accepted",
        acceptedBy: profileId,
        acceptedAt: new Date(),
      },
    });

    const membership = await tx.householdMember.create({
      data: {
        householdId: invite.householdId,
        profileId,
        role: "coparent",
        status: "active",
      },
    });

    await tx.userSettings.create({
      data: {
        householdId: invite.householdId,
        profileId,
        settings: DEFAULT_SETTINGS as object,
      },
    });

    await tx.onboardingState.create({
      data: {
        householdId: invite.householdId,
        profileId,
        currentStep: "profile",
        completedSteps: [],
        isComplete: false,
        payload: {},
      },
    });

    return { invite: updatedInvite, membership };
  });

  return {
    householdId: result.membership.householdId,
    role: result.membership.role,
    status: result.membership.status,
  };
}
