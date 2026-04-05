import { prisma } from "../../lib/prisma";
import { AppError } from "../../types";
import { verifyConversationMembership } from "./service";

/**
 * Mark a single message as delivered for the current profile.
 * Sets delivered_at if currently null.
 */
export async function markMessageDelivered(
  householdId: string,
  profileId: string,
  messageId: string
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

  const result = await prisma.messageReceipt.updateMany({
    where: {
      messageId,
      recipientProfileId: profileId,
      deliveredAt: null,
    },
    data: {
      deliveredAt: new Date(),
    },
  });

  return { success: true, updated: result.count };
}

/**
 * Bulk mark all unread messages in a conversation as read for the current profile.
 * Also sets delivered_at if it was still null.
 * Uses raw SQL for efficiency.
 */
export async function markConversationRead(
  householdId: string,
  profileId: string,
  conversationId: string
) {
  // Verify conversation exists in this household
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, householdId, deletedAt: null },
  });

  if (!conversation) {
    throw new AppError("Conversation not found.", 404);
  }

  await verifyConversationMembership(conversationId, profileId, householdId);

  const result = await prisma.$executeRaw`
    UPDATE message_receipts mr
    SET read_at = NOW(),
        delivered_at = COALESCE(mr.delivered_at, NOW()),
        updated_at = NOW()
    FROM messages m
    WHERE mr.message_id = m.id
      AND m.conversation_id = ${conversationId}::uuid
      AND m.household_id = ${householdId}::uuid
      AND mr.recipient_profile_id = ${profileId}::uuid
      AND mr.read_at IS NULL
  `;

  return { success: true, updatedCount: result };
}
