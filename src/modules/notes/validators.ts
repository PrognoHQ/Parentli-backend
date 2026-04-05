import { z } from "zod";

export const createNoteSchema = z.object({
  title: z.string().min(1).max(500),
  text: z.string().min(1).max(50000),
  childId: z.string().uuid().optional(),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export const updateNoteSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  text: z.string().min(1).max(50000).optional(),
  childId: z.string().uuid().nullable().optional(),
});

export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export const listNotesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  childId: z.string().uuid().optional(),
});

export type ListNotesQuery = z.infer<typeof listNotesQuerySchema>;
