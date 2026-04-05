import { prisma } from "../../lib/prisma";
import { AppError } from "../../types";
import { CreateNoteInput, UpdateNoteInput, ListNotesQuery } from "./validators";

export async function createNote(
  householdId: string,
  profileId: string,
  data: CreateNoteInput
) {
  if (data.childId) {
    const child = await prisma.child.findFirst({
      where: { id: data.childId, householdId },
    });
    if (!child) {
      throw new AppError("Child not found.", 404);
    }
  }

  return prisma.note.create({
    data: {
      householdId,
      createdByProfileId: profileId,
      title: data.title,
      text: data.text,
      childId: data.childId ?? null,
    },
    include: {
      child: { select: { id: true, firstName: true } },
      createdByProfile: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });
}

export async function listNotes(
  householdId: string,
  query: ListNotesQuery
) {
  const { page, limit, childId } = query;

  const where = {
    householdId,
    deletedAt: null,
    ...(childId ? { childId } : {}),
  };

  const [notes, total] = await Promise.all([
    prisma.note.findMany({
      where,
      include: {
        child: { select: { id: true, firstName: true } },
        createdByProfile: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: "desc" as const },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.note.count({ where }),
  ]);

  return { data: notes, total, page, limit };
}

export async function getNote(householdId: string, noteId: string) {
  const note = await prisma.note.findFirst({
    where: { id: noteId, householdId, deletedAt: null },
    include: {
      child: { select: { id: true, firstName: true } },
      createdByProfile: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });

  if (!note) {
    throw new AppError("Note not found.", 404);
  }

  return note;
}

export async function updateNote(
  householdId: string,
  noteId: string,
  data: UpdateNoteInput
) {
  const note = await prisma.note.findFirst({
    where: { id: noteId, householdId, deletedAt: null },
  });

  if (!note) {
    throw new AppError("Note not found.", 404);
  }

  if (data.childId !== undefined && data.childId !== null) {
    const child = await prisma.child.findFirst({
      where: { id: data.childId, householdId },
    });
    if (!child) {
      throw new AppError("Child not found.", 404);
    }
  }

  return prisma.note.update({
    where: { id: noteId },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.text !== undefined ? { text: data.text } : {}),
      ...(data.childId !== undefined ? { childId: data.childId } : {}),
    },
    include: {
      child: { select: { id: true, firstName: true } },
      createdByProfile: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });
}

export async function deleteNote(householdId: string, noteId: string) {
  const note = await prisma.note.findFirst({
    where: { id: noteId, householdId, deletedAt: null },
  });

  if (!note) {
    throw new AppError("Note not found.", 404);
  }

  await prisma.note.update({
    where: { id: noteId },
    data: { deletedAt: new Date() },
  });

  return { success: true };
}
