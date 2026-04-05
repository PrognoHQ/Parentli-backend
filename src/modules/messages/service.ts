import { prisma } from "../../lib/prisma";
import { AppError } from "../../types";
import { SendMessageInput, ListMessagesQuery } from "./validators";

const senderSelect = {
  senderProfile: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
    },
  },
  senderFamilyCircleMember: {
    select: {
      id: true,
      name: true,
      relationship: true,
      role: true,
      avatarUrl: true,
    },
  },
} as const;

const replySelect = {
  replyToMessage: {
    select: {
      id: true,
      text: true,
      senderKind: true,
      senderProfile: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
        },
      },
      senderFamilyCircleMember: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
} as const;

/**
 * Verify that a profile is an active member of a conversation.
 * Returns the conversation member record or throws 403.
 */
async function verifyConversationMembership(
  conversationId: string,
  profileId: string
) {
  const member = await prisma.conversationMember.findFirst({
    where: {
      conversationId,
      profileId,
      leftAt: null,
    },
  });

  if (!member) {
    throw new AppError("Not a member of this conversation.", 403);
  }

  return member;
}

/**
 * Send a message to a conversation.
 */
export async function sendMessage(
  householdId: string,
  profileId: string,
  data: SendMessageInput
) {
  // Validate conversation exists in this household
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: data.conversationId,
      householdId,
      deletedAt: null,
    },
  });

  if (!conversation) {
    throw new AppError("Conversation not found.", 404);
  }

  // Validate sender is active member
  await verifyConversationMembership(data.conversationId, profileId);

  // Validate reply target if provided
  if (data.replyToMessageId) {
    const replyTarget = await prisma.message.findFirst({
      where: {
        id: data.replyToMessageId,
        conversationId: data.conversationId,
        householdId,
      },
    });

    if (!replyTarget) {
      throw new AppError(
        "Reply target message not found in this conversation.",
        400
      );
    }
  }

  // Create message and touch conversation updatedAt in a transaction
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        householdId,
        conversationId: data.conversationId,
        senderKind: "profile",
        senderProfileId: profileId,
        type: data.type,
        text: data.text ?? null,
        replyToMessageId: data.replyToMessageId ?? null,
      },
      include: {
        ...senderSelect,
        ...replySelect,
      },
    });

    // Touch conversation updatedAt for sort ordering
    await tx.conversation.update({
      where: { id: data.conversationId },
      data: { updatedAt: new Date() },
    });

    return created;
  });

  return message;
}

/**
 * List messages in a conversation with pagination.
 * Excludes messages deleted "for me" by the requesting profile.
 */
export async function listMessages(
  householdId: string,
  conversationId: string,
  profileId: string,
  query: ListMessagesQuery
) {
  // Validate conversation exists in this household
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      householdId,
      deletedAt: null,
    },
  });

  if (!conversation) {
    throw new AppError("Conversation not found.", 404);
  }

  // Validate requester is active member
  await verifyConversationMembership(conversationId, profileId);

  const { page, limit } = query;

  // Get message IDs deleted "for me" by this actor
  const deletedForMe = await prisma.messageDeletion.findMany({
    where: {
      actorProfileId: profileId,
      message: {
        conversationId,
        householdId,
      },
    },
    select: { messageId: true },
  });

  const deletedMessageIds = deletedForMe.map((d) => d.messageId);

  const where = {
    conversationId,
    householdId,
    ...(deletedMessageIds.length > 0
      ? { id: { notIn: deletedMessageIds } }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.message.findMany({
      where,
      include: {
        ...senderSelect,
        ...replySelect,
      },
      orderBy: { createdAt: "asc" as const },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.message.count({ where }),
  ]);

  return { data, total, page, limit };
}

/**
 * Delete a message (for me or for everyone).
 */
export async function deleteMessage(
  householdId: string,
  profileId: string,
  messageId: string,
  mode: "for_me" | "for_everyone"
) {
  // Fetch message with household validation
  const message = await prisma.message.findFirst({
    where: {
      id: messageId,
      householdId,
    },
  });

  if (!message) {
    throw new AppError("Message not found.", 404);
  }

  // Verify actor is active member of the conversation
  await verifyConversationMembership(message.conversationId, profileId);

  if (mode === "for_me") {
    // Create deletion record — idempotent via upsert on unique constraint
    await prisma.messageDeletion.upsert({
      where: {
        messageId_actorProfileId: {
          messageId,
          actorProfileId: profileId,
        },
      },
      create: {
        householdId,
        messageId,
        actorKind: "profile",
        actorProfileId: profileId,
        deleteMode: "for_me",
      },
      update: {},
    });

    return { success: true, mode: "for_me" };
  }

  // mode === "for_everyone"
  if (message.senderProfileId !== profileId) {
    throw new AppError(
      "Only the sender can delete a message for everyone.",
      403
    );
  }

  await prisma.$transaction(async (tx) => {
    // Null out text and mark as deleted in metadata
    await tx.message.update({
      where: { id: messageId },
      data: {
        text: null,
        metadata: { deleted: true },
      },
    });

    // Create deletion record
    await tx.messageDeletion.upsert({
      where: {
        messageId_actorProfileId: {
          messageId,
          actorProfileId: profileId,
        },
      },
      create: {
        householdId,
        messageId,
        actorKind: "profile",
        actorProfileId: profileId,
        deleteMode: "for_everyone",
      },
      update: {
        deleteMode: "for_everyone",
      },
    });
  });

  return { success: true, mode: "for_everyone" };
}
