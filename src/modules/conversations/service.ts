import { prisma } from "../../lib/prisma";
import { AppError } from "../../types";
import { Prisma } from "@prisma/client";
import { getConversationSummaries, ConversationSummary } from "./queries";

const VALID_PURPOSE_BADGES = [
  "coordination",
  "medical",
  "school",
  "general",
] as const;

const conversationWithMembers = {
  members: {
    where: { leftAt: null },
    include: {
      profile: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
        },
      },
      familyCircleMember: {
        select: {
          id: true,
          name: true,
          relationship: true,
          role: true,
          avatarUrl: true,
        },
      },
    },
  },
} as const;

export async function getOrCreateCoparentConversation(
  householdId: string,
  profileId: string
) {
  // Look for existing coparent conversation
  const existing = await prisma.conversation.findFirst({
    where: { householdId, type: "coparent", deletedAt: null },
    include: conversationWithMembers,
  });

  if (existing) return existing;

  // Create new coparent conversation in a transaction
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Get all active household members (owner + coparent only — no Family
      // Circle). This ensures FC members never have access to the co-parent thread.
      const householdMembers = await tx.householdMember.findMany({
        where: { householdId, status: "active" },
        select: { profileId: true },
      });

      if (householdMembers.length === 0) {
        throw new AppError("No active household members found.", 400);
      }

      const conversation = await tx.conversation.create({
        data: {
          householdId,
          type: "coparent",
          createdByProfileId: profileId,
        },
      });

      await tx.conversationMember.createMany({
        data: householdMembers.map((m) => ({
          householdId,
          conversationId: conversation.id,
          memberKind: "profile" as const,
          profileId: m.profileId,
        })),
      });

      return tx.conversation.findUniqueOrThrow({
        where: { id: conversation.id },
        include: conversationWithMembers,
      });
    });

    return result;
  } catch (err) {
    // Handle race condition: another request created it first
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const existing = await prisma.conversation.findFirst({
        where: { householdId, type: "coparent", deletedAt: null },
        include: conversationWithMembers,
      });
      if (existing) return existing;
    }
    throw err;
  }
}

export async function createGroupConversation(
  householdId: string,
  profileId: string,
  data: {
    name?: string;
    purposeBadge?: string;
    memberIds?: Array<{ kind: string; id: string }>;
  }
) {
  if (
    data.purposeBadge &&
    !VALID_PURPOSE_BADGES.includes(data.purposeBadge as any)
  ) {
    throw new AppError(
      `Invalid purposeBadge "${data.purposeBadge}". Must be one of: ${VALID_PURPOSE_BADGES.join(", ")}.`,
      400
    );
  }

  // Deduplicate memberIds by kind+id to prevent P2002 errors
  const seen = new Set<string>();
  const memberIds = (data.memberIds ?? []).filter((m) => {
    const key = `${m.kind}:${m.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Validate member kinds
  for (const m of memberIds) {
    if (m.kind !== "profile" && m.kind !== "family_circle") {
      throw new AppError(
        `Invalid member kind "${m.kind}". Must be "profile" or "family_circle".`,
        400
      );
    }
  }

  // Validate all members belong to the household
  const profileMembers = memberIds.filter((m) => m.kind === "profile");
  const fcMembers = memberIds.filter((m) => m.kind === "family_circle");

  if (profileMembers.length > 0) {
    const found = await prisma.householdMember.findMany({
      where: {
        householdId,
        profileId: { in: profileMembers.map((m) => m.id) },
        status: "active",
      },
      select: { profileId: true },
    });
    const foundIds = new Set(found.map((f) => f.profileId));
    for (const m of profileMembers) {
      if (!foundIds.has(m.id)) {
        throw new AppError(
          `Profile ${m.id} is not an active member of this household.`,
          400
        );
      }
    }
  }

  if (fcMembers.length > 0) {
    const found = await prisma.familyCircleMember.findMany({
      where: {
        householdId,
        id: { in: fcMembers.map((m) => m.id) },
        status: "active",
      },
      select: { id: true },
    });
    const foundIds = new Set(found.map((f) => f.id));
    for (const m of fcMembers) {
      if (!foundIds.has(m.id)) {
        throw new AppError(
          `Family Circle member ${m.id} is not an active member of this household.`,
          400
        );
      }
    }
  }

  // Ensure at least 2 active members (creator + at least one other)
  const creatorAlreadyIncluded = profileMembers.some(
    (m) => m.id === profileId
  );
  const totalMembers = memberIds.length + (creatorAlreadyIncluded ? 0 : 1);
  if (totalMembers < 2) {
    throw new AppError(
      "Group conversation must have at least 2 members.",
      400
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.create({
      data: {
        householdId,
        type: "group",
        name: data.name ?? null,
        purposeBadge: data.purposeBadge
          ? (data.purposeBadge as any)
          : null,
        createdByProfileId: profileId,
      },
    });

    const memberRows: Array<{
      householdId: string;
      conversationId: string;
      memberKind: "profile" | "family_circle";
      profileId: string | null;
      familyCircleMemberId: string | null;
    }> = [];

    if (!creatorAlreadyIncluded) {
      memberRows.push({
        householdId,
        conversationId: conversation.id,
        memberKind: "profile",
        profileId,
        familyCircleMemberId: null,
      });
    }

    for (const m of memberIds) {
      memberRows.push({
        householdId,
        conversationId: conversation.id,
        memberKind: m.kind as "profile" | "family_circle",
        profileId: m.kind === "profile" ? m.id : null,
        familyCircleMemberId: m.kind === "family_circle" ? m.id : null,
      });
    }

    await tx.conversationMember.createMany({ data: memberRows });

    return tx.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
      include: conversationWithMembers,
    });
  });

  return result;
}

export async function listConversations(
  householdId: string,
  profileId: string
): Promise<ConversationSummary[]> {
  return getConversationSummaries(householdId, profileId);
}

export async function getConversationDetail(
  householdId: string,
  conversationId: string,
  profileId: string
) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, householdId, deletedAt: null },
    include: conversationWithMembers,
  });

  if (!conversation) {
    throw new AppError("Conversation not found.", 404);
  }

  // Verify the requesting profile is an active member
  const isMember = conversation.members.some(
    (m) => m.profileId === profileId && m.leftAt === null
  );

  if (!isMember) {
    throw new AppError("Not a member of this conversation.", 403);
  }

  return conversation;
}
