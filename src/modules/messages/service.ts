import { prisma } from "../../lib/prisma";
import { AppError } from "../../types";
import { SendMessageInput, ListMessagesQuery } from "./validators";
import { validateAndCreateSharedContent } from "./sharedContent";
import { validateAndCreateAttachments } from "./attachments";
import { getMessagesWithReadModel } from "./queries";

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
export async function verifyConversationMembership(
  conversationId: string,
  profileId: string,
  householdId: string
) {
  const member = await prisma.conversationMember.findFirst({
    where: {
      conversationId,
      profileId,
      householdId,
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
 * Supports optional shared content and attachments.
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
  await verifyConversationMembership(data.conversationId, profileId, householdId);

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

  // Create message, shared content, attachments, receipts, and touch conversation in a transaction
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

    // Create shared content if provided
    let sharedContent = null;
    if (data.sharedContent) {
      sharedContent = await validateAndCreateSharedContent(
        tx,
        householdId,
        created.id,
        data.sharedContent
      );
    }

    // Create attachments if provided
    let attachments: any[] = [];
    if (data.attachments && data.attachments.length > 0) {
      attachments = await validateAndCreateAttachments(
        tx,
        householdId,
        created.id,
        data.attachments
      );
    }

    // Generate receipt rows for every other active conversation member (not sender)
    const members = await tx.conversationMember.findMany({
      where: {
        conversationId: data.conversationId,
        householdId,
        leftAt: null,
      },
    });

    const receiptRows = members
      .filter((m) => m.profileId !== profileId)
      .map((m) => ({
        householdId,
        messageId: created.id,
        recipientKind: m.memberKind as "profile" | "family_circle",
        recipientProfileId: m.profileId,
        recipientFamilyCircleMemberId: m.familyCircleMemberId,
      }));

    if (receiptRows.length > 0) {
      await tx.messageReceipt.createMany({ data: receiptRows });
    }

    // Touch conversation updatedAt for sort ordering
    await tx.conversation.update({
      where: { id: data.conversationId },
      data: { updatedAt: new Date() },
    });

    return { ...created, sharedContent, attachments };
  });

  return message;
}

/**
 * List messages in a conversation with the unified read model.
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
  await verifyConversationMembership(conversationId, profileId, householdId);

  return getMessagesWithReadModel(
    householdId,
    conversationId,
    profileId,
    query.page,
    query.limit
  );
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
  await verifyConversationMembership(message.conversationId, profileId, householdId);

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
