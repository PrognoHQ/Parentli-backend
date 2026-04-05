import { prisma } from "../../lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SenderInfo {
  id: string;
  kind: "profile" | "family_circle";
  firstName?: string;
  lastName?: string;
  name?: string;
  avatarUrl?: string | null;
}

interface ReplyToInfo {
  id: string;
  sender: {
    id: string;
    firstName?: string;
    lastName?: string;
    name?: string;
  };
  text: string | null;
}

interface ReactionSummary {
  emoji: string;
  count: number;
  reactedByCurrentUser: boolean;
}

interface AttachmentInfo {
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
}

interface ExpensePreview {
  id: string;
  description: string;
  amount: string;
  status: string;
}

interface EventPreview {
  id: string;
  title: string;
  date: string;
  child: string | null;
}

interface NotePreview {
  id: string;
  title: string;
  previewText: string;
  childName: string | null;
}

interface SharedContentInfo {
  type: "expense" | "event" | "note";
  preview: ExpensePreview | EventPreview | NotePreview;
}

interface ReceiptInfo {
  delivered: boolean;
  read: boolean;
}

export interface MessageReadModel {
  id: string;
  conversationId: string;
  sender: SenderInfo;
  type: string;
  text: string | null;
  createdAt: string;
  deleted: boolean;

  replyTo: ReplyToInfo | null;
  reactions: ReactionSummary[];
  attachments: AttachmentInfo[];
  sharedContent: SharedContentInfo | null;
  receipt: ReceiptInfo | null;
}

// ---------------------------------------------------------------------------
// Main Query
// ---------------------------------------------------------------------------

/**
 * Fetch messages with the unified read model shape.
 *
 * Strategy:
 * 1. Single Prisma findMany with selective includes (sender, reply, reactions,
 *    attachments, sharedContent reference, receipts for current user)
 * 2. Batch-fetch shared content previews for all messages in the page
 * 3. Post-process into the final shape with:
 *    - Aggregated reactions (emoji → count + reactedByCurrentUser)
 *    - Delete suppression (attachments, shared content, reactions hidden)
 *    - Receipt state for current user
 */
export async function getMessagesWithReadModel(
  householdId: string,
  conversationId: string,
  profileId: string,
  page: number,
  limit: number
): Promise<{ data: MessageReadModel[]; total: number; page: number; limit: number }> {
  const where = {
    conversationId,
    householdId,
    deletions: {
      none: {
        actorProfileId: profileId,
      },
    },
  };

  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where,
      include: {
        senderProfile: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
        senderFamilyCircleMember: {
          select: { id: true, name: true, relationship: true, role: true, avatarUrl: true },
        },
        replyToMessage: {
          select: {
            id: true,
            text: true,
            senderKind: true,
            senderProfile: {
              select: { id: true, firstName: true, lastName: true },
            },
            senderFamilyCircleMember: {
              select: { id: true, name: true },
            },
          },
        },
        reactions: {
          select: {
            emoji: true,
            actorProfileId: true,
            actorFamilyCircleMemberId: true,
          },
        },
        attachments: {
          select: {
            fileName: true,
            fileType: true,
            fileSize: true,
            fileUrl: true,
          },
        },
        sharedContent: {
          select: {
            contentType: true,
            expenseId: true,
            eventId: true,
            noteId: true,
          },
        },
        receipts: {
          where: {
            recipientProfileId: profileId,
          },
          select: {
            deliveredAt: true,
            readAt: true,
          },
          take: 1,
        },
      },
      orderBy: { createdAt: "asc" as const },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.message.count({ where }),
  ]);

  // Collect shared content IDs for batch preview fetch
  const expenseIds: string[] = [];
  const eventIds: string[] = [];
  const noteIds: string[] = [];

  for (const msg of messages) {
    if (msg.sharedContent) {
      const meta = msg.metadata as Record<string, unknown>;
      if (meta?.deleted === true) continue; // skip deleted messages

      if (msg.sharedContent.expenseId) expenseIds.push(msg.sharedContent.expenseId);
      if (msg.sharedContent.eventId) eventIds.push(msg.sharedContent.eventId);
      if (msg.sharedContent.noteId) noteIds.push(msg.sharedContent.noteId);
    }
  }

  // Batch fetch previews
  const [expenses, events, notes] = await Promise.all([
    expenseIds.length > 0
      ? prisma.expense.findMany({
          where: { id: { in: expenseIds }, householdId },
          select: { id: true, description: true, amount: true, status: true },
        })
      : [],
    eventIds.length > 0
      ? prisma.event.findMany({
          where: { id: { in: eventIds }, householdId },
          select: {
            id: true,
            title: true,
            startAt: true,
            primaryChild: { select: { firstName: true } },
          },
        })
      : [],
    noteIds.length > 0
      ? prisma.note.findMany({
          where: { id: { in: noteIds }, householdId },
          select: {
            id: true,
            title: true,
            text: true,
            child: { select: { firstName: true } },
          },
        })
      : [],
  ]);

  // Index previews by ID
  const expenseMap = new Map(expenses.map((e) => [e.id, e]));
  const eventMap = new Map(events.map((e) => [e.id, e]));
  const noteMap = new Map(notes.map((n) => [n.id, n]));

  // Build read models
  const data: MessageReadModel[] = messages.map((msg) => {
    const meta = msg.metadata as Record<string, unknown>;
    const isDeleted = meta?.deleted === true;

    // Sender
    const sender: SenderInfo = msg.senderProfile
      ? {
          id: msg.senderProfile.id,
          kind: "profile",
          firstName: msg.senderProfile.firstName,
          lastName: msg.senderProfile.lastName,
          avatarUrl: msg.senderProfile.avatarUrl,
        }
      : {
          id: msg.senderFamilyCircleMember!.id,
          kind: "family_circle",
          name: msg.senderFamilyCircleMember!.name,
          avatarUrl: msg.senderFamilyCircleMember!.avatarUrl,
        };

    // Reply
    let replyTo: ReplyToInfo | null = null;
    if (msg.replyToMessage) {
      const replySender = msg.replyToMessage.senderProfile
        ? {
            id: msg.replyToMessage.senderProfile.id,
            firstName: msg.replyToMessage.senderProfile.firstName,
            lastName: msg.replyToMessage.senderProfile.lastName,
          }
        : {
            id: msg.replyToMessage.senderFamilyCircleMember!.id,
            name: msg.replyToMessage.senderFamilyCircleMember!.name,
          };
      replyTo = {
        id: msg.replyToMessage.id,
        sender: replySender,
        text: msg.replyToMessage.text,
      };
    }

    // Reactions — aggregated (suppressed if deleted)
    let reactions: ReactionSummary[] = [];
    if (!isDeleted && msg.reactions.length > 0) {
      const emojiMap = new Map<string, { count: number; reactedByCurrentUser: boolean }>();
      for (const r of msg.reactions) {
        const existing = emojiMap.get(r.emoji) ?? { count: 0, reactedByCurrentUser: false };
        existing.count++;
        if (r.actorProfileId === profileId) {
          existing.reactedByCurrentUser = true;
        }
        emojiMap.set(r.emoji, existing);
      }
      reactions = Array.from(emojiMap.entries()).map(([emoji, data]) => ({
        emoji,
        count: data.count,
        reactedByCurrentUser: data.reactedByCurrentUser,
      }));
    }

    // Attachments (suppressed if deleted)
    const attachments: AttachmentInfo[] = isDeleted ? [] : msg.attachments;

    // Shared content preview (suppressed if deleted)
    let sharedContent: SharedContentInfo | null = null;
    if (!isDeleted && msg.sharedContent) {
      const sc = msg.sharedContent;
      if (sc.contentType === "expense" && sc.expenseId) {
        const expense = expenseMap.get(sc.expenseId);
        if (expense) {
          sharedContent = {
            type: "expense",
            preview: {
              id: expense.id,
              description: expense.description,
              amount: expense.amount instanceof Decimal
                ? expense.amount.toString()
                : String(expense.amount),
              status: expense.status,
            },
          };
        }
      } else if (sc.contentType === "event" && sc.eventId) {
        const event = eventMap.get(sc.eventId);
        if (event) {
          sharedContent = {
            type: "event",
            preview: {
              id: event.id,
              title: event.title,
              date: event.startAt instanceof Date
                ? event.startAt.toISOString()
                : String(event.startAt),
              child: event.primaryChild?.firstName ?? null,
            },
          };
        }
      } else if (sc.contentType === "note" && sc.noteId) {
        const note = noteMap.get(sc.noteId);
        if (note) {
          sharedContent = {
            type: "note",
            preview: {
              id: note.id,
              title: note.title,
              previewText: note.text.length > 200
                ? note.text.substring(0, 200) + "..."
                : note.text,
              childName: note.child?.firstName ?? null,
            },
          };
        }
      }
    }

    // Receipt state for current user (only for messages NOT sent by current user)
    let receipt: ReceiptInfo | null = null;
    if (msg.senderProfileId !== profileId && msg.receipts.length > 0) {
      const r = msg.receipts[0];
      receipt = {
        delivered: r.deliveredAt !== null,
        read: r.readAt !== null,
      };
    }

    return {
      id: msg.id,
      conversationId: msg.conversationId,
      sender,
      type: msg.type,
      text: msg.text,
      createdAt: msg.createdAt instanceof Date
        ? msg.createdAt.toISOString()
        : String(msg.createdAt),
      deleted: isDeleted,
      replyTo,
      reactions,
      attachments,
      sharedContent,
      receipt,
    };
  });

  return { data, total, page, limit };
}
