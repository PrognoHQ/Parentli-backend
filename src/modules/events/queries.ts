import { prisma } from "../../lib/prisma";

// --- Row types for raw SQL results ---

interface EventRangeRow {
  id: string;
  household_id: string;
  title: string;
  emoji: string;
  child_scope: string;
  primary_child_id: string | null;
  category: string;
  health_sub_type: string | null;
  start_at: Date;
  end_at: Date;
  all_day: boolean;
  location: string | null;
  notify: boolean;
  recurrence_type: string;
  recurrence_parent_event_id: string | null;
  approval_status: string;
  approval_deadline_at: Date | null;
  created_by_profile_id: string;
  creator_first_name: string;
  child_first_name: string | null;
  child_emoji: string | null;
}

interface EventDetailRow {
  id: string;
  household_id: string;
  created_by_profile_id: string;
  updated_by_profile_id: string | null;
  title: string;
  emoji: string;
  child_scope: string;
  primary_child_id: string | null;
  category: string;
  health_sub_type: string | null;
  start_at: Date;
  end_at: Date;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  notify: boolean;
  recurrence_type: string;
  recurrence_until: Date | null;
  recurrence_parent_event_id: string | null;
  approval_status: string;
  approval_deadline_at: Date | null;
  approved_at: Date | null;
  approved_by_profile_id: string | null;
  auto_approved_at: Date | null;
  rejected_at: Date | null;
  rejected_by_profile_id: string | null;
  rejection_reason: string | null;
  rejection_counter_type: string | null;
  rejection_counter_value: string | null;
  created_at: Date;
  updated_at: Date;
  creator_first_name: string;
  child_first_name: string | null;
  child_emoji: string | null;
  checklist_items: unknown;
  timeline_entries: unknown;
  approval_request: unknown;
}

interface InboxRow {
  id: string;
  household_id: string;
  title: string;
  emoji: string;
  child_scope: string;
  primary_child_id: string | null;
  category: string;
  health_sub_type: string | null;
  start_at: Date;
  end_at: Date;
  all_day: boolean;
  approval_status: string;
  approval_deadline_at: Date | null;
  created_by_profile_id: string;
  requester_name: string;
  request_deadline: Date;
  child_first_name: string | null;
  child_emoji: string | null;
}

// --- Mapped response types ---

function mapRangeRow(row: EventRangeRow) {
  return {
    id: row.id,
    householdId: row.household_id,
    title: row.title,
    emoji: row.emoji,
    childScope: row.child_scope,
    primaryChildId: row.primary_child_id,
    category: row.category,
    healthSubType: row.health_sub_type,
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: row.all_day,
    location: row.location,
    notify: row.notify,
    recurrenceType: row.recurrence_type,
    recurrenceParentEventId: row.recurrence_parent_event_id,
    approvalStatus: row.approval_status,
    approvalDeadlineAt: row.approval_deadline_at,
    createdByProfileId: row.created_by_profile_id,
    creatorFirstName: row.creator_first_name,
    childFirstName: row.child_first_name,
    childEmoji: row.child_emoji,
  };
}

/**
 * Range query: returns events for a given date range (month or week view).
 * Includes recurrence instances. Excludes soft-deleted events.
 */
export async function getEventsForRange(
  householdId: string,
  rangeStart: Date,
  rangeEnd: Date
) {
  const rows = await prisma.$queryRaw<EventRangeRow[]>`
    SELECT
      e.id,
      e.household_id,
      e.title,
      e.emoji,
      e.child_scope,
      e.primary_child_id,
      e.category,
      e.health_sub_type,
      e.start_at,
      e.end_at,
      e.all_day,
      e.location,
      e.notify,
      e.recurrence_type,
      e.recurrence_parent_event_id,
      e.approval_status,
      e.approval_deadline_at,
      e.created_by_profile_id,
      p.first_name AS creator_first_name,
      ch.first_name AS child_first_name,
      ch.emoji AS child_emoji
    FROM events e
    LEFT JOIN profiles p ON p.id = e.created_by_profile_id
    LEFT JOIN children ch ON ch.id = e.primary_child_id
    WHERE e.household_id = ${householdId}::uuid
      AND e.is_deleted = false
      AND e.start_at < ${rangeEnd}::timestamptz
      AND e.end_at > ${rangeStart}::timestamptz
    ORDER BY e.start_at ASC
  `;

  return rows.map(mapRangeRow);
}

/**
 * Upcoming events for dashboard/home. Returns next N events from now.
 */
export async function getUpcomingEvents(householdId: string, limit: number) {
  const now = new Date();
  const rows = await prisma.$queryRaw<EventRangeRow[]>`
    SELECT
      e.id,
      e.household_id,
      e.title,
      e.emoji,
      e.child_scope,
      e.primary_child_id,
      e.category,
      e.health_sub_type,
      e.start_at,
      e.end_at,
      e.all_day,
      e.location,
      e.notify,
      e.recurrence_type,
      e.recurrence_parent_event_id,
      e.approval_status,
      e.approval_deadline_at,
      e.created_by_profile_id,
      p.first_name AS creator_first_name,
      ch.first_name AS child_first_name,
      ch.emoji AS child_emoji
    FROM events e
    LEFT JOIN profiles p ON p.id = e.created_by_profile_id
    LEFT JOIN children ch ON ch.id = e.primary_child_id
    WHERE e.household_id = ${householdId}::uuid
      AND e.is_deleted = false
      AND e.start_at >= ${now}::timestamptz
    ORDER BY e.start_at ASC
    LIMIT ${limit}
  `;

  return rows.map(mapRangeRow);
}

/**
 * Approval inbox: pending approvals targeted at a specific profile.
 */
export async function getApprovalInbox(householdId: string, profileId: string) {
  const rows = await prisma.$queryRaw<InboxRow[]>`
    SELECT
      e.id,
      e.household_id,
      e.title,
      e.emoji,
      e.child_scope,
      e.primary_child_id,
      e.category,
      e.health_sub_type,
      e.start_at,
      e.end_at,
      e.all_day,
      e.approval_status,
      e.approval_deadline_at,
      e.created_by_profile_id,
      p.first_name AS requester_name,
      ear.deadline_at AS request_deadline,
      ch.first_name AS child_first_name,
      ch.emoji AS child_emoji
    FROM events e
    JOIN event_approval_requests ear ON ear.event_id = e.id AND ear.household_id = e.household_id
    LEFT JOIN profiles p ON p.id = ear.requested_by_profile_id
    LEFT JOIN children ch ON ch.id = e.primary_child_id
    WHERE e.household_id = ${householdId}::uuid
      AND ear.requested_to_profile_id = ${profileId}::uuid
      AND ear.status = 'pending'
      AND e.is_deleted = false
    ORDER BY ear.deadline_at ASC
  `;

  return rows.map((row) => ({
    id: row.id,
    householdId: row.household_id,
    title: row.title,
    emoji: row.emoji,
    childScope: row.child_scope,
    primaryChildId: row.primary_child_id,
    category: row.category,
    healthSubType: row.health_sub_type,
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: row.all_day,
    approvalStatus: row.approval_status,
    approvalDeadlineAt: row.approval_deadline_at,
    createdByProfileId: row.created_by_profile_id,
    requesterName: row.requester_name,
    requestDeadline: row.request_deadline,
    childFirstName: row.child_first_name,
    childEmoji: row.child_emoji,
  }));
}

/**
 * Full event detail with checklist items, timeline entries, and latest approval request.
 * Uses json_agg for nested arrays (same pattern as emergency-card read model).
 */
export async function getEventDetail(eventId: string, householdId: string) {
  const rows = await prisma.$queryRaw<EventDetailRow[]>`
    SELECT
      e.*,
      p_creator.first_name AS creator_first_name,
      ch.first_name AS child_first_name,
      ch.emoji AS child_emoji,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', eci.id,
              'text', eci.text,
              'checked', eci.checked,
              'checkedAt', eci.checked_at,
              'checkedByProfileId', eci.checked_by_profile_id,
              'position', eci.position,
              'createdByProfileId', eci.created_by_profile_id
            ) ORDER BY eci.position ASC
          )
          FROM event_checklist_items eci
          WHERE eci.event_id = e.id AND eci.household_id = e.household_id
        ),
        '[]'::json
      ) AS checklist_items,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', ete.id,
              'entryType', ete.entry_type,
              'label', ete.label,
              'detail', ete.detail,
              'color', ete.color,
              'actorProfileId', ete.actor_profile_id,
              'createdAt', ete.created_at
            ) ORDER BY ete.created_at ASC
          )
          FROM event_timeline_entries ete
          WHERE ete.event_id = e.id AND ete.household_id = e.household_id
        ),
        '[]'::json
      ) AS timeline_entries,
      (
        SELECT json_build_object(
          'id', ear.id,
          'requestedByProfileId', ear.requested_by_profile_id,
          'requestedToProfileId', ear.requested_to_profile_id,
          'status', ear.status,
          'deadlineAt', ear.deadline_at,
          'resolvedAt', ear.resolved_at,
          'resolvedByProfileId', ear.resolved_by_profile_id
        )
        FROM event_approval_requests ear
        WHERE ear.event_id = e.id AND ear.household_id = e.household_id
        ORDER BY ear.created_at DESC
        LIMIT 1
      ) AS approval_request
    FROM events e
    LEFT JOIN profiles p_creator ON p_creator.id = e.created_by_profile_id
    LEFT JOIN children ch ON ch.id = e.primary_child_id
    WHERE e.id = ${eventId}::uuid
      AND e.household_id = ${householdId}::uuid
      AND e.is_deleted = false
  `;

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    id: row.id,
    householdId: row.household_id,
    createdByProfileId: row.created_by_profile_id,
    updatedByProfileId: row.updated_by_profile_id,
    title: row.title,
    emoji: row.emoji,
    childScope: row.child_scope,
    primaryChildId: row.primary_child_id,
    category: row.category,
    healthSubType: row.health_sub_type,
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: row.all_day,
    location: row.location,
    notes: row.notes,
    notify: row.notify,
    recurrenceType: row.recurrence_type,
    recurrenceUntil: row.recurrence_until,
    recurrenceParentEventId: row.recurrence_parent_event_id,
    approvalStatus: row.approval_status,
    approvalDeadlineAt: row.approval_deadline_at,
    approvedAt: row.approved_at,
    approvedByProfileId: row.approved_by_profile_id,
    autoApprovedAt: row.auto_approved_at,
    rejectedAt: row.rejected_at,
    rejectedByProfileId: row.rejected_by_profile_id,
    rejectionReason: row.rejection_reason,
    rejectionCounterType: row.rejection_counter_type,
    rejectionCounterValue: row.rejection_counter_value,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    creatorFirstName: row.creator_first_name,
    childFirstName: row.child_first_name,
    childEmoji: row.child_emoji,
    checklistItems: row.checklist_items ?? [],
    timelineEntries: row.timeline_entries ?? [],
    approvalRequest: row.approval_request ?? null,
  };
}
