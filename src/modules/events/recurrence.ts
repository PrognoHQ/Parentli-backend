import { addDays, addWeeks, addMonths } from "date-fns";
import { prisma } from "../../lib/prisma";
import { Prisma } from "@prisma/client";

const MAX_RECURRENCE_WEEKS = 52;

interface RecurrenceBaseEvent {
  id: string;
  householdId: string;
  createdByProfileId: string;
  title: string;
  emoji: string;
  childScope: "both" | "single";
  primaryChildId: string | null;
  category: "activity" | "health" | "school" | "handoff" | "other";
  healthSubType: "routine" | "specialist" | "emergency" | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  notify: boolean;
  recurrenceType: "daily" | "weekly" | "biweekly" | "monthly";
  recurrenceUntil: Date | null;
}

/**
 * Generates materialized recurrence instances for a base event.
 *
 * Strategy: Option A — materialized future instances.
 * Creates concrete event rows linked via recurrence_parent_event_id.
 * Generates up to recurrence_until or MAX_RECURRENCE_WEEKS (52 weeks).
 *
 * Each generated instance inherits the base event's fields but with
 * shifted start_at/end_at. Instances are created with approvalStatus "none"
 * — approval is only relevant for the parent event. Future series editing
 * or per-instance approval can be layered on later.
 */
export async function generateRecurrenceInstances(
  baseEvent: RecurrenceBaseEvent
): Promise<string[]> {
  const { recurrenceType, recurrenceUntil, startAt, endAt } = baseEvent;

  const duration = endAt.getTime() - startAt.getTime();
  const maxDate = recurrenceUntil ?? addWeeks(startAt, MAX_RECURRENCE_WEEKS);

  const futureDates: Date[] = [];
  let currentDate = startAt;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const nextDate = advanceDate(currentDate, recurrenceType);
    if (nextDate > maxDate) break;
    futureDates.push(nextDate);
    currentDate = nextDate;

    // Safety cap: max 365 instances
    if (futureDates.length >= 365) break;
  }

  if (futureDates.length === 0) return [];

  const instanceData: Prisma.EventCreateManyInput[] = futureDates.map((date) => ({
    householdId: baseEvent.householdId,
    createdByProfileId: baseEvent.createdByProfileId,
    title: baseEvent.title,
    emoji: baseEvent.emoji,
    childScope: baseEvent.childScope,
    primaryChildId: baseEvent.primaryChildId,
    category: baseEvent.category,
    healthSubType: baseEvent.healthSubType,
    startAt: date,
    endAt: new Date(date.getTime() + duration),
    allDay: baseEvent.allDay,
    location: baseEvent.location,
    notes: baseEvent.notes,
    notify: baseEvent.notify,
    recurrenceType: baseEvent.recurrenceType,
    recurrenceUntil: baseEvent.recurrenceUntil,
    recurrenceParentEventId: baseEvent.id,
    approvalStatus: "none",
    approvalDeadlineAt: null,
  }));

  // Batch create all instances
  // We use individual creates to get IDs back (createMany doesn't return IDs in Postgres)
  const createdIds: string[] = [];

  for (const data of instanceData) {
    const instance = await prisma.event.create({ data, select: { id: true } });
    createdIds.push(instance.id);
  }

  return createdIds;
}

function advanceDate(
  date: Date,
  recurrenceType: "daily" | "weekly" | "biweekly" | "monthly"
): Date {
  switch (recurrenceType) {
    case "daily":
      return addDays(date, 1);
    case "weekly":
      return addWeeks(date, 1);
    case "biweekly":
      return addWeeks(date, 2);
    case "monthly":
      return addMonths(date, 1);
  }
}
