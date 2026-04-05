import { prisma } from "../../lib/prisma";
import { AppError } from "../../types";
import { CreateNoteInput, UpdateNoteInput, ListNotesQuery } from "./validators";

const NOTE_INCLUDE = {
  authorProfile: {
    select: { id: true, firstName: true, lastName: true, avatarUrl: true },
  },
  authorFamilyCircleMember: {
    select: {
      id: true,
      name: true,
      relationship: true,
      role: true,
      avatarUrl: true,
    },
  },
  child: {
    select: { id: true, firstName: true, emoji: true },
  },
} as const;

interface AuthorContext {
  profileId: string;
  familyCircleMemberId?: string;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createNote(
  householdId: string,
  args: AuthorContext & { data: CreateNoteInput }
) {
  const { profileId, familyCircleMemberId, data } = args;

  // Validate child belongs to household
  if (data.childId) {
    const child = await prisma.child.findFirst({
      where: { id: data.childId, householdId },
    });
    if (!child) {
      throw new AppError("Child not found.", 404);
    }
  }

  // Determine author identity
  const isFc = !!familyCircleMemberId;

  let relationshipLabel: string | null = null;
  if (isFc) {
    const fcMember = await prisma.familyCircleMember.findUnique({
      where: { id: familyCircleMemberId },
      select: { relationship: true },
    });
    relationshipLabel = fcMember?.relationship ?? null;
  }

  return prisma.note.create({
    data: {
      householdId,
      authorKind: isFc ? "family_circle" : "profile",
      authorProfileId: isFc ? null : profileId,
      authorFamilyCircleMemberId: isFc ? familyCircleMemberId : null,
      noteType: data.noteType,
      tag: data.tag ?? null,
      childId: data.childId ?? null,
      title: data.title ?? null,
      preview: data.preview,
      fullContent: data.fullContent ?? null,
      important: data.important ?? false,
      isFamilyCircle: isFc,
      relationshipLabel,
    },
    include: NOTE_INCLUDE,
  });
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

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

  const [data, total] = await Promise.all([
    prisma.note.findMany({
      where,
      select: {
        id: true,
        householdId: true,
        authorKind: true,
        noteType: true,
        tag: true,
        childId: true,
        title: true,
        preview: true,
        important: true,
        isFamilyCircle: true,
        relationshipLabel: true,
        hasAttachments: true,
        createdAt: true,
        updatedAt: true,
        authorProfile: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
        authorFamilyCircleMember: {
          select: {
            id: true,
            name: true,
            relationship: true,
            role: true,
            avatarUrl: true,
          },
        },
        child: {
          select: { id: true, firstName: true, emoji: true },
        },
      },
      orderBy: { createdAt: "desc" as const },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.note.count({ where }),
  ]);

  return { data, total, page, limit };
}

// ---------------------------------------------------------------------------
// Get Detail
// ---------------------------------------------------------------------------

export async function getNote(householdId: string, noteId: string) {
  const note = await prisma.note.findFirst({
    where: { id: noteId, householdId, deletedAt: null },
    include: NOTE_INCLUDE,
  });

  if (!note) {
    throw new AppError("Note not found.", 404);
  }

  return note;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateNote(
  householdId: string,
  noteId: string,
  args: AuthorContext & { data: UpdateNoteInput }
) {
  const { profileId, familyCircleMemberId, data } = args;

  const note = await prisma.note.findFirst({
    where: { id: noteId, householdId, deletedAt: null },
  });

  if (!note) {
    throw new AppError("Note not found.", 404);
  }

  // Ownership check
  assertOwnership(note, profileId, familyCircleMemberId);

  return prisma.note.update({
    where: { id: noteId },
    data: {
      ...(data.preview !== undefined ? { preview: data.preview } : {}),
      ...(data.fullContent !== undefined
        ? { fullContent: data.fullContent }
        : {}),
      ...(data.tag !== undefined ? { tag: data.tag } : {}),
      ...(data.important !== undefined ? { important: data.important } : {}),
    },
    include: NOTE_INCLUDE,
  });
}

// ---------------------------------------------------------------------------
// Delete (soft)
// ---------------------------------------------------------------------------

export async function deleteNote(
  householdId: string,
  noteId: string,
  author: AuthorContext
) {
  const note = await prisma.note.findFirst({
    where: { id: noteId, householdId, deletedAt: null },
  });

  if (!note) {
    throw new AppError("Note not found.", 404);
  }

  // Ownership check
  assertOwnership(note, author.profileId, author.familyCircleMemberId);

  await prisma.note.update({
    where: { id: noteId },
    data: { deletedAt: new Date() },
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertOwnership(
  note: { authorKind: string; authorProfileId: string | null; authorFamilyCircleMemberId: string | null },
  profileId: string,
  familyCircleMemberId?: string
): void {
  if (note.authorKind === "profile") {
    if (note.authorProfileId !== profileId) {
      throw new AppError("You can only modify your own notes.", 403);
    }
    return;
  }

  if (note.authorKind === "family_circle") {
    if (!familyCircleMemberId || note.authorFamilyCircleMemberId !== familyCircleMemberId) {
      throw new AppError("You can only modify your own notes.", 403);
    }
    return;
  }

  throw new AppError("You can only modify your own notes.", 403);
}
