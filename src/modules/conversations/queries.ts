import { prisma } from "../../lib/prisma";

// ---------------------------------------------------------------------------
// Conversation Inbox Summary — Raw SQL + Prisma hybrid
// ---------------------------------------------------------------------------

interface ConversationSummaryRow {
  id: string;
  type: string;
  name: string | null;
  purpose_badge: string | null;
  pinned: boolean;
  created_at: Date;
  updated_at: Date;
  last_message_id: string | null;
  last_message_text: string | null;
  last_message_type: string | null;
  last_message_sender_kind: string | null;
  last_message_sender_profile_id: string | null;
  last_message_sender_fc_member_id: string | null;
  last_message_at: Date | null;
  last_message_globally_deleted: boolean | null;
  unread_count: bigint;
}

export interface ConversationSummary {
  id: string;
  type: string;
  name: string | null;
  purposeBadge: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  lastMessage: {
    id: string;
    text: string | null;
    type: string;
    senderKind: string;
    senderProfileId: string | null;
    senderFamilyCircleMemberId: string | null;
    createdAt: string;
    globallyDeleted: boolean;
  } | null;
  lastMessageAt: string | null;
  unreadCount: number;
  members: Array<{
    id: string;
    memberKind: string;
    profileId: string | null;
    familyCircleMemberId: string | null;
    role: string | null;
    profile: {
      id: string;
      firstName: string;
      lastName: string;
      avatarUrl: string | null;
    } | null;
    familyCircleMember: {
      id: string;
      name: string;
      relationship: string;
      role: string;
      avatarUrl: string | null;
    } | null;
  }>;
}

/**
 * Fetch conversation inbox summaries for a profile.
 *
 * Returns conversations the profile is an active member of, enriched with:
 * - last visible message (respecting delete-for-me)
 * - unread count (from receipts, excluding deleted-for-me and globally-deleted messages)
 * - member details (fetched via Prisma)
 */
export async function getConversationSummaries(
  householdId: string,
  profileId: string
): Promise<ConversationSummary[]> {
  const rows = await prisma.$queryRaw<ConversationSummaryRow[]>`
    SELECT
      c.id,
      c.type,
      c.name,
      c.purpose_badge,
      c.pinned,
      c.created_at,
      c.updated_at,
      lm.id AS last_message_id,
      lm.text AS last_message_text,
      lm.type AS last_message_type,
      lm.sender_kind AS last_message_sender_kind,
      lm.sender_profile_id AS last_message_sender_profile_id,
      lm.sender_family_circle_member_id AS last_message_sender_fc_member_id,
      lm.created_at AS last_message_at,
      COALESCE((lm.metadata->>'deleted')::boolean, false) AS last_message_globally_deleted,
      COALESCE(unread.cnt, 0) AS unread_count
    FROM conversations c
    INNER JOIN conversation_members cm
      ON cm.conversation_id = c.id
      AND cm.profile_id = ${profileId}::uuid
      AND cm.left_at IS NULL
    LEFT JOIN LATERAL (
      SELECT m.id, m.text, m.type, m.sender_kind, m.sender_profile_id,
             m.sender_family_circle_member_id, m.created_at, m.metadata
      FROM messages m
      WHERE m.conversation_id = c.id
        AND NOT EXISTS (
          SELECT 1 FROM message_deletions md
          WHERE md.message_id = m.id AND md.actor_profile_id = ${profileId}::uuid
        )
      ORDER BY m.created_at DESC
      LIMIT 1
    ) lm ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::bigint AS cnt
      FROM message_receipts mr
      INNER JOIN messages m ON m.id = mr.message_id
      WHERE m.conversation_id = c.id
        AND mr.recipient_profile_id = ${profileId}::uuid
        AND mr.read_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM message_deletions md
          WHERE md.message_id = m.id AND md.actor_profile_id = ${profileId}::uuid
        )
        AND COALESCE((m.metadata->>'deleted')::boolean, false) IS DISTINCT FROM true
    ) unread ON true
    WHERE c.household_id = ${householdId}::uuid
      AND c.deleted_at IS NULL
    ORDER BY c.pinned DESC, c.updated_at DESC
  `;

  if (rows.length === 0) return [];

  // Batch-fetch members for all conversations
  const conversationIds = rows.map((r) => r.id);
  const members = await prisma.conversationMember.findMany({
    where: {
      conversationId: { in: conversationIds },
      leftAt: null,
    },
    select: {
      id: true,
      conversationId: true,
      memberKind: true,
      profileId: true,
      familyCircleMemberId: true,
      role: true,
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
  });

  // Group members by conversationId
  const membersByConversation = new Map<string, typeof members>();
  for (const m of members) {
    const list = membersByConversation.get(m.conversationId) ?? [];
    list.push(m);
    membersByConversation.set(m.conversationId, list);
  }

  return rows.map((row) => {
    const convMembers = (membersByConversation.get(row.id) ?? []).map((m) => ({
      id: m.id,
      memberKind: m.memberKind,
      profileId: m.profileId,
      familyCircleMemberId: m.familyCircleMemberId,
      role: m.role,
      profile: m.profile,
      familyCircleMember: m.familyCircleMember,
    }));

    return {
      id: row.id,
      type: row.type,
      name: row.name,
      purposeBadge: row.purpose_badge,
      pinned: row.pinned,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      lastMessage: row.last_message_id
        ? {
            id: row.last_message_id,
            text: row.last_message_text,
            type: row.last_message_type!,
            senderKind: row.last_message_sender_kind!,
            senderProfileId: row.last_message_sender_profile_id,
            senderFamilyCircleMemberId: row.last_message_sender_fc_member_id,
            createdAt:
              row.last_message_at instanceof Date
                ? row.last_message_at.toISOString()
                : String(row.last_message_at),
            globallyDeleted: row.last_message_globally_deleted ?? false,
          }
        : null,
      lastMessageAt: row.last_message_at
        ? row.last_message_at instanceof Date
          ? row.last_message_at.toISOString()
          : String(row.last_message_at)
        : null,
      unreadCount: Number(row.unread_count),
      members: convMembers,
    };
  });
}
