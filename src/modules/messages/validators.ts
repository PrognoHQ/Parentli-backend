import { z } from "zod";

export const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  type: z
    .enum(["text", "expense", "event", "image", "file", "note"])
    .default("text"),
  text: z.string().min(1).max(10000).optional(),
  replyToMessageId: z.string().uuid().optional(),
  sharedContent: z
    .object({
      contentType: z.enum(["expense", "event", "note"]),
      expenseId: z.string().uuid().optional(),
      eventId: z.string().uuid().optional(),
      noteId: z.string().uuid().optional(),
    })
    .optional(),
  attachments: z
    .array(
      z.object({
        fileName: z.string().min(1).max(500),
        fileType: z.string().min(1).max(100),
        fileSize: z.number().int().min(1).max(10_485_760),
        fileUrl: z.string().min(1).max(2048),
      })
    )
    .max(5)
    .optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const listMessagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

export const deleteMessageSchema = z.object({
  mode: z.enum(["for_me", "for_everyone"]),
});

export type DeleteMessageInput = z.infer<typeof deleteMessageSchema>;

export const reactionSchema = z.object({
  emoji: z.string().min(1).max(32),
});
