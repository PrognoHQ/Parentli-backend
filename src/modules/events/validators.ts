import { z } from "zod";

export const createEventSchema = z.object({
  title: z.string().min(1, "Title is required"),
  emoji: z.string().min(1, "Emoji is required"),
  childScope: z.enum(["both", "single"]),
  primaryChildId: z.string().uuid().optional().nullable(),
  category: z.enum(["activity", "health", "school", "handoff", "other"]),
  healthSubType: z.enum(["routine", "specialist", "emergency"]).optional().nullable(),
  startAt: z.string().datetime({ message: "startAt must be a valid ISO datetime" }),
  endAt: z.string().datetime({ message: "endAt must be a valid ISO datetime" }),
  allDay: z.boolean().optional().default(false),
  location: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  notify: z.boolean().optional().default(true),
  recurrenceType: z.enum(["none", "daily", "weekly", "biweekly", "monthly"]).optional().default("none"),
  recurrenceUntil: z.string().datetime().optional().nullable(),
  checklistItems: z
    .array(
      z.object({
        text: z.string().min(1, "Checklist item text cannot be empty").max(500),
      })
    )
    .optional()
    .default([]),
}).superRefine((data, ctx) => {
  if (data.childScope === "single" && !data.primaryChildId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "primaryChildId is required when childScope is single",
      path: ["primaryChildId"],
    });
  }

  if (data.category !== "health" && data.healthSubType) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "healthSubType is only valid when category is health",
      path: ["healthSubType"],
    });
  }

  const startAt = new Date(data.startAt);
  const endAt = new Date(data.endAt);
  if (endAt <= startAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "endAt must be after startAt",
      path: ["endAt"],
    });
  }

  if (data.recurrenceUntil) {
    const recurrenceUntil = new Date(data.recurrenceUntil);
    if (recurrenceUntil < startAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "recurrenceUntil cannot be before startAt",
        path: ["recurrenceUntil"],
      });
    }
  }
});

export const updateEventSchema = z.object({
  title: z.string().min(1).optional(),
  emoji: z.string().min(1).optional(),
  childScope: z.enum(["both", "single"]).optional(),
  primaryChildId: z.string().uuid().optional().nullable(),
  category: z.enum(["activity", "health", "school", "handoff", "other"]).optional(),
  healthSubType: z.enum(["routine", "specialist", "emergency"]).optional().nullable(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  allDay: z.boolean().optional(),
  location: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  notify: z.boolean().optional(),
});

export const rejectEventSchema = z.object({
  rejectionReason: z.string().min(1, "Rejection reason is required"),
  rejectionCounterType: z.enum(["date", "provider"]).optional().nullable(),
  rejectionCounterValue: z.string().optional().nullable(),
});

export const checklistItemSchema = z.object({
  text: z.string().min(1, "Text is required").max(500),
});

export const reorderChecklistSchema = z.object({
  orderedIds: z.array(z.string().uuid()),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type RejectEventInput = z.infer<typeof rejectEventSchema>;
