import { prisma } from "../../lib/prisma";
import { AppError } from "../../types";
import { DEFAULT_SETTINGS, EventCategoryRule, UserSettings } from "../../types/settings";

interface ApprovalRequirement {
  required: boolean;
  notify: boolean;
  deadlineAt: Date | null;
  requestedToProfileId: string | null;
  approvalWindowHours: number;
}

/**
 * Determines whether an event requires approval based on household settings.
 * Reads eventCategoryRules from the creator's settings and applies
 * health-specific sub-scope logic.
 */
export async function determineEventApprovalRequirement(
  category: string,
  healthSubType: string | null | undefined,
  householdId: string,
  creatorProfileId: string
): Promise<ApprovalRequirement> {
  // Load creator's settings
  const settingsRecord = await prisma.userSettings.findUnique({
    where: { householdId_profileId: { householdId, profileId: creatorProfileId } },
  });

  const settings: UserSettings = settingsRecord?.settings
    ? { ...DEFAULT_SETTINGS, ...(settingsRecord.settings as Record<string, unknown>) } as UserSettings
    : DEFAULT_SETTINGS;

  const approvalWindowHours = settings.approvalWindowHours || 72;

  // Map category enum to settings key (capitalize first letter)
  const categoryKey = category.charAt(0).toUpperCase() + category.slice(1);
  const rule: EventCategoryRule = settings.eventCategoryRules?.[categoryKey] ?? { rule: "none" };

  if (rule.rule === "none") {
    return { required: false, notify: false, deadlineAt: null, requestedToProfileId: null, approvalWindowHours };
  }

  if (rule.rule === "notify-always") {
    return { required: false, notify: true, deadlineAt: null, requestedToProfileId: null, approvalWindowHours };
  }

  // rule.rule === "require-approval"
  // Health-specific sub-scope logic
  if (category === "health" && rule.healthScope) {
    const scope = rule.healthScope;
    const subType = healthSubType || null;

    if (scope === "specialist-only" && subType !== "specialist") {
      return { required: false, notify: false, deadlineAt: null, requestedToProfileId: null, approvalWindowHours };
    }
    if (scope === "all-except-emergency" && subType === "emergency") {
      return { required: false, notify: false, deadlineAt: null, requestedToProfileId: null, approvalWindowHours };
    }
    // scope === "all" falls through to require approval
  }

  // Find the co-parent (the other active household member)
  const coparent = await prisma.householdMember.findFirst({
    where: {
      householdId,
      profileId: { not: creatorProfileId },
      status: "active",
    },
  });

  const deadlineAt = new Date(Date.now() + approvalWindowHours * 60 * 60 * 1000);

  return {
    required: true,
    notify: true,
    deadlineAt,
    requestedToProfileId: coparent?.profileId ?? null,
    approvalWindowHours,
  };
}

/**
 * Creates an approval request row, timeline entries, and notification for a pending event.
 */
export async function createApprovalRequest(
  eventId: string,
  householdId: string,
  requestedByProfileId: string,
  requestedToProfileId: string | null,
  deadlineAt: Date,
  creatorName: string
): Promise<void> {
  await prisma.$transaction([
    prisma.eventApprovalRequest.create({
      data: {
        householdId,
        eventId,
        requestedByProfileId,
        requestedToProfileId,
        status: "pending",
        deadlineAt,
      },
    }),
    prisma.eventTimelineEntry.create({
      data: {
        householdId,
        eventId,
        actorProfileId: requestedByProfileId,
        entryType: "created",
        label: `Created by ${creatorName}`,
        color: "sage",
      },
    }),
    prisma.eventTimelineEntry.create({
      data: {
        householdId,
        eventId,
        actorProfileId: requestedByProfileId,
        entryType: "approval_requested",
        label: "Approval requested",
        detail: `Waiting for co-parent response`,
        color: "gold",
      },
    }),
    prisma.eventNotification.create({
      data: {
        householdId,
        eventId,
        type: "approval_requested",
        targetProfileId: requestedToProfileId,
        payload: { creatorName },
      },
    }),
  ]);
}

/**
 * Approves a pending event. Only the co-parent (not the creator) can approve.
 */
export async function approveEvent(
  eventId: string,
  householdId: string,
  approverProfileId: string
): Promise<void> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, householdId, isDeleted: false },
  });

  if (!event) {
    throw new AppError("Event not found.", 404);
  }

  if (event.approvalStatus !== "pending") {
    throw new AppError(`Cannot approve event with status '${event.approvalStatus}'.`, 400);
  }

  if (event.createdByProfileId === approverProfileId) {
    throw new AppError("Creator cannot approve their own event.", 403);
  }

  const approver = await prisma.profile.findUnique({
    where: { id: approverProfileId },
    select: { firstName: true },
  });

  const now = new Date();

  await prisma.$transaction([
    prisma.event.update({
      where: { id: eventId },
      data: {
        approvalStatus: "approved",
        approvedAt: now,
        approvedByProfileId: approverProfileId,
      },
    }),
    prisma.eventApprovalRequest.updateMany({
      where: { eventId, householdId, status: "pending" },
      data: {
        status: "approved",
        resolvedAt: now,
        resolvedByProfileId: approverProfileId,
      },
    }),
    prisma.eventTimelineEntry.create({
      data: {
        householdId,
        eventId,
        actorProfileId: approverProfileId,
        entryType: "approved",
        label: `Approved by ${approver?.firstName ?? "co-parent"}`,
        color: "sage",
      },
    }),
    prisma.eventNotification.create({
      data: {
        householdId,
        eventId,
        type: "event_approved",
        targetProfileId: event.createdByProfileId,
        payload: { approverName: approver?.firstName },
      },
    }),
  ]);
}

/**
 * Rejects a pending event with a reason and optional counter-proposal.
 */
export async function rejectEvent(
  eventId: string,
  householdId: string,
  rejectorProfileId: string,
  rejectionReason: string,
  rejectionCounterType?: string | null,
  rejectionCounterValue?: string | null
): Promise<void> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, householdId, isDeleted: false },
  });

  if (!event) {
    throw new AppError("Event not found.", 404);
  }

  if (event.approvalStatus !== "pending") {
    throw new AppError(`Cannot reject event with status '${event.approvalStatus}'.`, 400);
  }

  if (event.createdByProfileId === rejectorProfileId) {
    throw new AppError("Creator cannot reject their own event.", 403);
  }

  const rejector = await prisma.profile.findUnique({
    where: { id: rejectorProfileId },
    select: { firstName: true },
  });

  const now = new Date();
  const rejectorName = rejector?.firstName ?? "co-parent";

  const timelineEntries = [
    prisma.eventTimelineEntry.create({
      data: {
        householdId,
        eventId,
        actorProfileId: rejectorProfileId,
        entryType: "rejected",
        label: `Declined by ${rejectorName}`,
        detail: rejectionReason,
        color: "terracotta",
      },
    }),
  ];

  if (rejectionCounterType && rejectionCounterValue) {
    timelineEntries.push(
      prisma.eventTimelineEntry.create({
        data: {
          householdId,
          eventId,
          actorProfileId: rejectorProfileId,
          entryType: "counter_proposed",
          label: `Counter-proposal: ${rejectionCounterType}`,
          detail: rejectionCounterValue,
          color: "gold",
        },
      })
    );
  }

  await prisma.$transaction([
    prisma.event.update({
      where: { id: eventId },
      data: {
        approvalStatus: "rejected",
        rejectedAt: now,
        rejectedByProfileId: rejectorProfileId,
        rejectionReason,
        rejectionCounterType: rejectionCounterType ?? null,
        rejectionCounterValue: rejectionCounterValue ?? null,
      },
    }),
    prisma.eventApprovalRequest.updateMany({
      where: { eventId, householdId, status: "pending" },
      data: {
        status: "rejected",
        resolvedAt: now,
        resolvedByProfileId: rejectorProfileId,
      },
    }),
    ...timelineEntries,
    prisma.eventNotification.create({
      data: {
        householdId,
        eventId,
        type: "event_rejected",
        targetProfileId: event.createdByProfileId,
        payload: { rejectorName, rejectionReason, rejectionCounterType, rejectionCounterValue },
      },
    }),
  ]);
}

/**
 * Processes all expired pending approval requests (tacit consent).
 * Finds requests where deadline_at < NOW() and auto-approves them.
 * Safe to call from cron, scheduler, or admin endpoint.
 */
export async function processExpiredEventApprovals(): Promise<{
  processed: number;
  eventIds: string[];
}> {
  const now = new Date();

  // Find all expired pending requests
  const expiredRequests = await prisma.eventApprovalRequest.findMany({
    where: {
      status: "pending",
      deadlineAt: { lt: now },
    },
    include: {
      event: { select: { id: true, householdId: true, createdByProfileId: true, isDeleted: true } },
    },
  });

  const processedEventIds: string[] = [];

  for (const request of expiredRequests) {
    if (request.event.isDeleted) {
      // Cancel requests for deleted events
      await prisma.eventApprovalRequest.update({
        where: { id: request.id },
        data: { status: "cancelled", resolvedAt: now },
      });
      continue;
    }

    await prisma.$transaction([
      prisma.eventApprovalRequest.update({
        where: { id: request.id },
        data: {
          status: "auto_approved",
          resolvedAt: now,
        },
      }),
      prisma.event.update({
        where: { id: request.eventId },
        data: {
          approvalStatus: "auto_approved",
          autoApprovedAt: now,
        },
      }),
      prisma.eventTimelineEntry.create({
        data: {
          householdId: request.householdId,
          eventId: request.eventId,
          entryType: "auto_approved",
          label: "Auto-approved via tacit consent",
          color: "muted",
        },
      }),
      prisma.eventNotification.create({
        data: {
          householdId: request.householdId,
          eventId: request.eventId,
          type: "event_auto_approved",
          targetProfileId: request.event.createdByProfileId,
          payload: {},
        },
      }),
    ]);

    processedEventIds.push(request.eventId);
  }

  return { processed: processedEventIds.length, eventIds: processedEventIds };
}
