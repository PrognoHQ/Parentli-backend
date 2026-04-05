import { z } from "zod";

export const createGroupConversationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  purposeBadge: z
    .enum(["coordination", "medical", "school", "general"])
    .optional(),
  memberIds: z
    .array(
      z.object({
        kind: z.enum(["profile", "family_circle"]),
        id: z.string().uuid(),
      })
    )
    .default([]),
});

export type CreateGroupConversationInput = z.infer<
  typeof createGroupConversationSchema
>;
