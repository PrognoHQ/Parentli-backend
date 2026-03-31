import { prisma } from "../../lib/prisma";
import { AppError } from "../../types";
import {
  FamilyCircleRole,
  FamilyCircleAccessType,
  FamilyCircleMemberStatus,
} from "@prisma/client";

// ---------- helpers ----------

function isAccessExpired(member: {
  accessType: string;
  accessEndsAt: Date | null;
}): boolean {
  return (
    member.accessType === "custom_date" &&
    member.accessEndsAt !== null &&
    member.accessEndsAt < new Date()
  );
}

async function verifyMemberInHousehold(
  memberId: string,
  householdId: string
) {
  const member = await prisma.familyCircleMember.findFirst({
    where: { id: memberId, householdId },
  });
  if (!member) throw new AppError("Family Circle member not found.", 404);
  return member;
}

function validateAccessDates(
  accessType: string,
  accessStartsAt?: string | null,
  accessEndsAt?: string | null
) {
  if (accessType === "custom_date") {
    if (!accessEndsAt) {
      throw new AppError(
        "access_ends_at is required when access_type is custom_date.",
        400
      );
    }
    if (accessStartsAt && accessEndsAt) {
      if (new Date(accessEndsAt) <= new Date(accessStartsAt)) {
        throw new AppError(
          "access_ends_at must be after access_starts_at.",
          400
        );
      }
    }
  }
}

// ---------- activity log ----------

async function logActivity(params: {
  householdId: string;
  familyCircleMemberId: string;
  childId?: string;
  actorProfileId?: string;
  action: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.familyCircleActivityLog.create({
    data: {
      householdId: params.householdId,
      familyCircleMemberId: params.familyCircleMemberId,
      childId: params.childId ?? null,
      actorProfileId: params.actorProfileId ?? null,
      action: params.action,
      metadata: (params.metadata ?? {}) as any,
    },
  });
}

// ---------- members ----------

export async function createMember(
  householdId: string,
  invitedByProfileId: string,
  data: {
    name: string;
    email?: string;
    phone?: string;
    relationship: string;
    role: string;
    accessType: string;
    accessStartsAt?: string;
    accessEndsAt?: string;
    avatarUrl?: string;
  }
) {
  if (!["viewer", "contributor", "carer"].includes(data.role)) {
    throw new AppError(
      `Invalid role "${data.role}". Must be viewer, contributor, or carer.`,
      400
    );
  }
  if (!["ongoing", "custom_date"].includes(data.accessType)) {
    throw new AppError(
      `Invalid accessType "${data.accessType}". Must be ongoing or custom_date.`,
      400
    );
  }

  validateAccessDates(data.accessType, data.accessStartsAt, data.accessEndsAt);

  const member = await prisma.familyCircleMember.create({
    data: {
      householdId,
      invitedByProfileId,
      name: data.name,
      email: data.email ?? null,
      phone: data.phone ?? null,
      relationship: data.relationship,
      role: data.role as FamilyCircleRole,
      accessType: data.accessType as FamilyCircleAccessType,
      accessStartsAt: data.accessStartsAt
        ? new Date(data.accessStartsAt)
        : null,
      accessEndsAt: data.accessEndsAt ? new Date(data.accessEndsAt) : null,
      status: "active" as FamilyCircleMemberStatus,
      avatarUrl: data.avatarUrl ?? null,
    },
  });

  await logActivity({
    householdId,
    familyCircleMemberId: member.id,
    actorProfileId: invitedByProfileId,
    action: "member_added",
    metadata: { name: data.name, role: data.role },
  });

  return member;
}

export async function listMembers(
  householdId: string,
  statusFilter?: string
) {
  const where: Record<string, unknown> = { householdId };
  if (statusFilter) {
    where.status = statusFilter;
  }
  return prisma.familyCircleMember.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: {
      childAssignments: {
        include: {
          child: {
            select: { id: true, firstName: true, emoji: true },
          },
        },
      },
    },
  });
}

export async function getMember(id: string, householdId: string) {
  const member = await prisma.familyCircleMember.findFirst({
    where: { id, householdId },
    include: {
      childAssignments: {
        include: {
          child: {
            select: { id: true, firstName: true, emoji: true, color: true },
          },
        },
      },
    },
  });
  if (!member) throw new AppError("Family Circle member not found.", 404);
  return member;
}

export async function updateMember(
  id: string,
  householdId: string,
  actorProfileId: string,
  data: {
    name?: string;
    email?: string | null;
    phone?: string | null;
    relationship?: string;
    role?: string;
    accessType?: string;
    accessStartsAt?: string | null;
    accessEndsAt?: string | null;
    avatarUrl?: string | null;
  }
) {
  const existing = await verifyMemberInHousehold(id, householdId);

  if (
    existing.status === "revoked" ||
    existing.status === "expired" ||
    isAccessExpired(existing)
  ) {
    throw new AppError("Cannot update a revoked or expired member.", 400);
  }

  if (data.role && !["viewer", "contributor", "carer"].includes(data.role)) {
    throw new AppError(`Invalid role "${data.role}".`, 400);
  }
  if (
    data.accessType &&
    !["ongoing", "custom_date"].includes(data.accessType)
  ) {
    throw new AppError(`Invalid accessType "${data.accessType}".`, 400);
  }

  const effectiveAccessType = data.accessType ?? existing.accessType;
  const effectiveStartsAt =
    data.accessStartsAt !== undefined
      ? data.accessStartsAt
      : existing.accessStartsAt?.toISOString() ?? null;
  const effectiveEndsAt =
    data.accessEndsAt !== undefined
      ? data.accessEndsAt
      : existing.accessEndsAt?.toISOString() ?? null;

  validateAccessDates(effectiveAccessType, effectiveStartsAt, effectiveEndsAt);

  const member = await prisma.familyCircleMember.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.relationship !== undefined && { relationship: data.relationship }),
      ...(data.role !== undefined && { role: data.role as FamilyCircleRole }),
      ...(data.accessType !== undefined && {
        accessType: data.accessType as FamilyCircleAccessType,
      }),
      ...(data.accessStartsAt !== undefined && {
        accessStartsAt: data.accessStartsAt
          ? new Date(data.accessStartsAt)
          : null,
      }),
      ...(data.accessEndsAt !== undefined && {
        accessEndsAt: data.accessEndsAt ? new Date(data.accessEndsAt) : null,
      }),
      ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
    },
  });

  await logActivity({
    householdId,
    familyCircleMemberId: id,
    actorProfileId,
    action: "member_updated",
  });

  return member;
}

export async function revokeMember(
  id: string,
  householdId: string,
  actorProfileId: string
) {
  const existing = await verifyMemberInHousehold(id, householdId);

  if (existing.status === "revoked") {
    throw new AppError("Member is already revoked.", 400);
  }

  const member = await prisma.familyCircleMember.update({
    where: { id },
    data: { status: "revoked" as FamilyCircleMemberStatus },
  });

  await logActivity({
    householdId,
    familyCircleMemberId: id,
    actorProfileId,
    action: "member_revoked",
    metadata: { name: existing.name },
  });

  return member;
}

// ---------- child assignments ----------

export async function assignChildren(
  memberId: string,
  householdId: string,
  actorProfileId: string,
  childIds: string[]
) {
  const member = await verifyMemberInHousehold(memberId, householdId);

  if (
    member.status === "revoked" ||
    member.status === "expired" ||
    isAccessExpired(member)
  ) {
    throw new AppError(
      "Cannot assign children to a revoked or expired member.",
      400
    );
  }

  // Verify all children belong to the same household
  if (childIds.length > 0) {
    const children = await prisma.child.findMany({
      where: { id: { in: childIds }, householdId },
      select: { id: true },
    });
    const foundIds = new Set(children.map((c) => c.id));
    for (const cid of childIds) {
      if (!foundIds.has(cid)) {
        throw new AppError(
          `Child ${cid} not found in this household.`,
          400
        );
      }
    }
  }

  // Replace all assignments in a transaction
  await prisma.$transaction(async (tx) => {
    // Delete existing assignments
    await tx.familyCircleMemberChild.deleteMany({
      where: { familyCircleMemberId: memberId, householdId },
    });

    // Create new assignments
    if (childIds.length > 0) {
      await tx.familyCircleMemberChild.createMany({
        data: childIds.map((childId) => ({
          householdId,
          familyCircleMemberId: memberId,
          childId,
        })),
      });
    }
  });

  await logActivity({
    householdId,
    familyCircleMemberId: memberId,
    actorProfileId,
    action: "child_assignment_changed",
    metadata: { childIds },
  });

  // Return updated member with assignments
  return getMember(memberId, householdId);
}

// ---------- activity log ----------

export async function getActivityLog(householdId: string) {
  return prisma.familyCircleActivityLog.findMany({
    where: { householdId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
