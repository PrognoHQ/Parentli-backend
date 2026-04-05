import { z } from "zod";

export const createNoteSchema = z.object({
  noteType: z.enum(["report", "medical", "educational", "therapy", "general"]),
  childId: z.string().uuid().optional(),
  title: z.string().min(1).max(500).optional(),
  preview: z.string().min(3).max(5000),
  fullContent: z.string().max(50000).optional(),
  tag: z.string().max(100).optional(),
  important: z.boolean().optional(),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export const updateNoteSchema = z.object({
  preview: z.string().min(3).max(5000).optional(),
  fullContent: z.string().max(50000).nullable().optional(),
  tag: z.string().max(100).nullable().optional(),
  important: z.boolean().optional(),
});

export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export const listNotesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  childId: z.string().uuid().optional(),
});

export type ListNotesQuery = z.infer<typeof listNotesQuerySchema>;
