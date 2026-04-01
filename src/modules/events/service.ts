import { prisma } from "../../lib/prisma";
import { AppError } from "../../types";
import { CreateEventInput, UpdateEventInput } from "./validators";
import {
  determineEventApprovalRequirement,
  createApprovalRequest,
} from "./approvals";
import { generateRecurrenceInstances } from "./recurrence";

/**
 * Creates a new event with optional checklist items and recurrence.
 * Handles approval requirement determination server-side.
 */
export async function createEvent(
  householdId: string,
  creatorProfileId: string,
  data: CreateEventInput
) {
  // Validate child ownership when child_scope = single
  if (data.childScope === "single" && data.primaryChildId) {
    const child = await prisma.child.findFirst({
      where: { id: data.primaryChildId, householdId },
    });
    if (!child) {
      throw new AppError("Child not found in this household.", 400);
    }
  }

  // Determine approval requirement from household settings
  const approvalReq = await determineEventApprovalRequirement(
    data.category,
    data.healthSubType ?? null,
    householdId,
    creatorProfileId
  );

  // Get creator name for timeline
  const creator = await prisma.profile.findUnique({
    where: { id: creatorProfileId },
    select: { firstName: true },
  });
  const creatorName = creator?.firstName ?? "Unknown";

  // Create the base event
  const event = await prisma.event.create({
    data: {
      householdId,
      createdByProfileId: creatorProfileId,
      title: data.title,
      emoji: data.emoji,
      childScope: data.childScope,
      primaryChildId: data.primaryChildId ?? null,
      category: data.category,
      healthSubType: data.healthSubType ?? null,
      startAt: new Date(data.startAt),
      endAt: new Date(data.endAt),
      allDay: data.allDay,
      location: data.location ?? null,
      notes: data.notes ?? null,
      notify: data.notify,
      recurrenceType: data.recurrenceType ?? "none",
      recurrenceUntil: data.recurrenceUntil ? new Date(data.recurrenceUntil) : null,
      approvalStatus: approvalReq.required ? "pending" : "none",
      approvalDeadlineAt: approvalReq.deadlineAt,
    },
  });

  // Create checklist items if provided
  if (data.checklistItems && data.checklistItems.length > 0) {
    await prisma.eventChecklistItem.createMany({
      data: data.checklistItems.map((item, index) => ({
        householdId,
        eventId: event.id,
        text: item.text,
        position: index,
        createdByProfileId: creatorProfileId,
      })),
    });
  }

  if (approvalReq.required) {
    // Create approval request + timeline entries + notification
    await createApprovalRequest(
      event.id,
      householdId,
      creatorProfileId,
      approvalReq.requestedToProfileId,
      approvalReq.deadlineAt!,
      creatorName
    );
  } else {
    // Just add "created" timeline entry and notification
    await prisma.$transaction([
      prisma.eventTimelineEntry.create({
        data: {
          householdId,
          eventId: event.id,
          actorProfileId: creatorProfileId,
          entryType: "created",
          label: `Created by ${creatorName}`,
          color: "sage",
        },
      }),
      prisma.eventNotification.create({
        data: {
          householdId,
          eventId: event.id,
          type: "event_created",
          payload: { creatorName },
        },
      }),
    ]);
  }

  // Generate recurrence instances if applicable
  if (data.recurrenceType && data.recurrenceType !== "none") {
    await generateRecurrenceInstances({
      id: event.id,
      householdId,
      createdByProfileId: creatorProfileId,
      title: data.title,
      emoji: data.emoji,
      childScope: data.childScope,
      primaryChildId: data.primaryChildId ?? null,
      category: data.category,
      healthSubType: data.healthSubType ?? null,
      startAt: new Date(data.startAt),
      endAt: new Date(data.endAt),
      allDay: data.allDay,
      location: data.location ?? null,
      notes: data.notes ?? null,
      notify: data.notify,
      recurrenceType: data.recurrenceType,
      recurrenceUntil: data.recurrenceUntil ? new Date(data.recurrenceUntil) : null,
      approvalStatus: approvalReq.required ? "pending" : "none",
      approvalDeadlineAt: approvalReq.deadlineAt,
    });
  }

  return event;
}

/**
 * Updates an existing event. Only updates provided fields.
 */
export async function updateEvent(
  eventId: string,
  householdId: string,
  updaterProfileId: string,
  data: UpdateEventInput
) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, householdId, isDeleted: false },
  });

  if (!event) {
    throw new AppError("Event not found.", 404);
  }

  // Validate child ownership if changing to single scope
  if (data.childScope === "single" && data.primaryChildId) {
    const child = await prisma.child.findFirst({
      where: { id: data.primaryChildId, householdId },
    });
    if (!child) {
      throw new AppError("Child not found in this household.", 400);
    }
  }

  // Validate healthSubType consistency
  const effectiveCategory = data.category ?? event.category;
  if (effectiveCategory !== "health" && data.healthSubType) {
    throw new AppError("healthSubType is only valid when category is health.", 400);
  }

  const updater = await prisma.profile.findUnique({
    where: { id: updaterProfileId },
    select: { firstName: true },
  });

  const updated = await prisma.event.update({
    where: { id: eventId },
    data: {
      ...buildUpdateData(data),
      updatedByProfileId: updaterProfileId,
    },
  });

  // Add timeline entry for the update
  await prisma.$transaction([
    prisma.eventTimelineEntry.create({
      data: {
        householdId,
        eventId,
        actorProfileId: updaterProfileId,
        entryType: "updated",
        label: `Updated by ${updater?.firstName ?? "unknown"}`,
        color: "muted",
      },
    }),
    prisma.eventNotification.create({
      data: {
        householdId,
        eventId,
        type: "event_updated",
        payload: { updaterName: updater?.firstName },
      },
    }),
  ]);

  return updated;
}

function buildUpdateData(data: UpdateEventInput) {
  const update: Record<string, unknown> = {};
  if (data.title !== undefined) update.title = data.title;
  if (data.emoji !== undefined) update.emoji = data.emoji;
  if (data.childScope !== undefined) update.childScope = data.childScope;
  if (data.primaryChildId !== undefined) update.primaryChildId = data.primaryChildId;
  if (data.category !== undefined) update.category = data.category;
  if (data.healthSubType !== undefined) update.healthSubType = data.healthSubType;
  if (data.startAt !== undefined) update.startAt = new Date(data.startAt);
  if (data.endAt !== undefined) update.endAt = new Date(data.endAt);
  if (data.allDay !== undefined) update.allDay = data.allDay;
  if (data.location !== undefined) update.location = data.location;
  if (data.notes !== undefined) update.notes = data.notes;
  if (data.notify !== undefined) update.notify = data.notify;
  return update;
}

/**
 * Soft-deletes an event by setting is_deleted = true.
 */
export async function deleteEvent(eventId: string, householdId: string) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, householdId, isDeleted: false },
  });

  if (!event) {
    throw new AppError("Event not found.", 404);
  }

  await prisma.event.update({
    where: { id: eventId },
    data: { isDeleted: true },
  });
}

// --- Checklist Operations ---

export async function addChecklistItem(
  eventId: string,
  householdId: string,
  profileId: string,
  text: string
) {
  // Verify event ownership
  const event = await prisma.event.findFirst({
    where: { id: eventId, householdId, isDeleted: false },
  });
  if (!event) throw new AppError("Event not found.", 404);

  // Get max position
  const maxItem = await prisma.eventChecklistItem.findFirst({
    where: { eventId, householdId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  return prisma.eventChecklistItem.create({
    data: {
      householdId,
      eventId,
      text,
      position: (maxItem?.position ?? -1) + 1,
      createdByProfileId: profileId,
    },
  });
}

export async function updateChecklistItemText(
  itemId: string,
  eventId: string,
  householdId: string,
  text: string
) {
  const item = await prisma.eventChecklistItem.findFirst({
    where: { id: itemId, eventId, householdId },
  });
  if (!item) throw new AppError("Checklist item not found.", 404);

  return prisma.eventChecklistItem.update({
    where: { id: itemId },
    data: { text },
  });
}

export async function toggleChecklistItem(
  itemId: string,
  eventId: string,
  householdId: string,
  profileId: string
) {
  const item = await prisma.eventChecklistItem.findFirst({
    where: { id: itemId, eventId, householdId },
  });
  if (!item) throw new AppError("Checklist item not found.", 404);

  const nowChecked = !item.checked;
  return prisma.eventChecklistItem.update({
    where: { id: itemId },
    data: {
      checked: nowChecked,
      checkedAt: nowChecked ? new Date() : null,
      checkedByProfileId: nowChecked ? profileId : null,
    },
  });
}

export async function deleteChecklistItem(
  itemId: string,
  eventId: string,
  householdId: string
) {
  const item = await prisma.eventChecklistItem.findFirst({
    where: { id: itemId, eventId, householdId },
  });
  if (!item) throw new AppError("Checklist item not found.", 404);

  await prisma.eventChecklistItem.delete({
    where: { id: itemId },
  });
}

export async function reorderChecklistItems(
  eventId: string,
  householdId: string,
  orderedIds: string[]
) {
  // Verify all items belong to this event
  const items = await prisma.eventChecklistItem.findMany({
    where: { eventId, householdId },
    select: { id: true },
  });

  const existingIds = new Set(items.map((i) => i.id));
  for (const id of orderedIds) {
    if (!existingIds.has(id)) {
      throw new AppError(`Checklist item '${id}' does not belong to this event.`, 400);
    }
  }

  // Batch update positions in a transaction
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.eventChecklistItem.update({
        where: { id },
        data: { position: index },
      })
    )
  );
}
