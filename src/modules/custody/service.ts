import { prisma } from "../../lib/prisma";
import { AppError } from "../../types";
import { ParentRole } from "@prisma/client";

interface DayInput {
  weekIndex: number;
  dayIndex: number;
  assignedParentRole: "owner" | "coparent";
  isHandoffDay?: boolean;
  handoffTime?: string | null;
}

export async function createOrReplaceSchedule(
  householdId: string,
  createdByProfileId: string,
  data: {
    name: string;
    patternType?: string;
    firstDayOfWeek?: number;
    handoffTimeDefault?: string;
    effectiveFrom?: string;
    effectiveTo?: string;
    days: DayInput[];
  }
) {
  // Validate exactly 14 days
  if (!Array.isArray(data.days) || data.days.length !== 14) {
    throw new AppError("Exactly 14 day slots are required.", 400);
  }

  // Validate each day slot
  const seen = new Set<string>();
  for (const day of data.days) {
    if (day.weekIndex < 0 || day.weekIndex > 1) {
      throw new AppError(
        `Invalid weekIndex ${day.weekIndex}. Must be 0 or 1.`,
        400
      );
    }
    if (day.dayIndex < 0 || day.dayIndex > 6) {
      throw new AppError(
        `Invalid dayIndex ${day.dayIndex}. Must be 0–6.`,
        400
      );
    }
    if (day.assignedParentRole !== "owner" && day.assignedParentRole !== "coparent") {
      throw new AppError(
        `Invalid assignedParentRole "${day.assignedParentRole}". Must be "owner" or "coparent".`,
        400
      );
    }
    const key = `${day.weekIndex}-${day.dayIndex}`;
    if (seen.has(key)) {
      throw new AppError(`Duplicate day slot: week ${day.weekIndex}, day ${day.dayIndex}.`, 400);
    }
    seen.add(key);
  }

  return prisma.$transaction(async (tx) => {
    // Deactivate all existing active schedules for this household
    await tx.custodySchedule.updateMany({
      where: { householdId, isActive: true },
      data: { isActive: false },
    });

    // Create new active schedule
    const schedule = await tx.custodySchedule.create({
      data: {
        householdId,
        createdByProfileId,
        name: data.name,
        isActive: true,
        patternType: data.patternType ?? null,
        firstDayOfWeek: data.firstDayOfWeek ?? 1,
        handoffTimeDefault: data.handoffTimeDefault ?? null,
        effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : null,
        effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
      },
    });

    // Bulk create the 14 day slots
    await tx.custodyScheduleDay.createMany({
      data: data.days.map((day) => ({
        householdId,
        custodyScheduleId: schedule.id,
        weekIndex: day.weekIndex,
        dayIndex: day.dayIndex,
        assignedParentRole: day.assignedParentRole as ParentRole,
        isHandoffDay: day.isHandoffDay ?? false,
        handoffTime: day.handoffTime ?? null,
      })),
    });

    // Return schedule with days
    return tx.custodySchedule.findUnique({
      where: { id: schedule.id },
      include: {
        days: { orderBy: [{ weekIndex: "asc" }, { dayIndex: "asc" }] },
      },
    });
  });
}

export async function getActiveSchedule(householdId: string) {
  const schedule = await prisma.custodySchedule.findFirst({
    where: { householdId, isActive: true },
    include: {
      days: { orderBy: [{ weekIndex: "asc" }, { dayIndex: "asc" }] },
    },
  });
  return schedule;
}

export async function getHandoffPreferences(householdId: string) {
  return prisma.handoffPreference.findFirst({
    where: { householdId },
  });
}

export async function upsertHandoffPreferences(
  householdId: string,
  data: {
    custodyScheduleId?: string | null;
    remindersEnabled?: boolean;
    reminderDayBefore?: boolean;
    reminderTwoHoursBefore?: boolean;
    defaultLocation?: string | null;
  }
) {
  const existing = await prisma.handoffPreference.findFirst({
    where: { householdId },
  });

  if (existing) {
    return prisma.handoffPreference.update({
      where: { id: existing.id },
      data: {
        ...(data.custodyScheduleId !== undefined && {
          custodyScheduleId: data.custodyScheduleId,
        }),
        ...(data.remindersEnabled !== undefined && {
          remindersEnabled: data.remindersEnabled,
        }),
        ...(data.reminderDayBefore !== undefined && {
          reminderDayBefore: data.reminderDayBefore,
        }),
        ...(data.reminderTwoHoursBefore !== undefined && {
          reminderTwoHoursBefore: data.reminderTwoHoursBefore,
        }),
        ...(data.defaultLocation !== undefined && {
          defaultLocation: data.defaultLocation,
        }),
      },
    });
  }

  return prisma.handoffPreference.create({
    data: {
      householdId,
      custodyScheduleId: data.custodyScheduleId ?? null,
      remindersEnabled: data.remindersEnabled ?? true,
      reminderDayBefore: data.reminderDayBefore ?? true,
      reminderTwoHoursBefore: data.reminderTwoHoursBefore ?? true,
      defaultLocation: data.defaultLocation ?? null,
    },
  });
}
