import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../types";
import { verifyConversationMembership } from "./service";

/**
 * Add an emoji reaction to a message.
 * Duplicate identical reactions by the same actor are rejected (409).
 */
export async function addReaction(
  householdId: string,
  profileId: string,
  messageId: string,
  emoji: string
) {
  const message = await prisma.message.findFirst({
    where: { id: messageId, householdId },
  });

  if (!message) {
    throw new AppError("Message not found.", 404);
  }

  // Reject reactions on globally deleted messages
  const metadata = message.metadata as Record<string, unknown>;
  if (metadata?.deleted === true) {
    throw new AppError("Cannot react to a deleted message.", 400);
  }

  await verifyConversationMembership(
    message.conversationId,
    profileId,
    householdId
  );

  try {
    const reaction = await prisma.messageReaction.create({
      data: {
        householdId,
        messageId,
        actorKind: "profile",
        actorProfileId: profileId,
        emoji,
      },
      select: {
        id: true,
        emoji: true,
        actorKind: true,
        actorProfileId: true,
        actorFamilyCircleMemberId: true,
        createdAt: true,
      },
    });

    return reaction;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new AppError("You have already reacted with this emoji.", 409);
    }
    throw err;
  }
}

/**
 * Remove an emoji reaction from a message.
 * Returns 404 if the reaction does not exist.
 */
export async function removeReaction(
  householdId: string,
  profileId: string,
  messageId: string,
  emoji: string
) {
  const message = await prisma.message.findFirst({
    where: { id: messageId, householdId },
  });

  if (!message) {
    throw new AppError("Message not found.", 404);
  }

  await verifyConversationMembership(
    message.conversationId,
    profileId,
    householdId
  );

  const { count } = await prisma.messageReaction.deleteMany({
    where: {
      householdId,
      messageId,
      actorKind: "profile",
      actorProfileId: profileId,
      emoji,
    },
  });

  if (count === 0) {
    throw new AppError("Reaction not found.", 404);
  }

  return { success: true };
}
