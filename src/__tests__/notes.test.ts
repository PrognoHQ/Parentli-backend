import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockChildFindFirst = vi.fn();
const mockNoteCreate = vi.fn();
const mockNoteFindMany = vi.fn();
const mockNoteCount = vi.fn();
const mockNoteFindFirst = vi.fn();
const mockNoteUpdate = vi.fn();
const mockFCMemberFindUnique = vi.fn();

vi.mock("../lib/prisma", () => ({
  prisma: {
    child: {
      findFirst: (...args: unknown[]) => mockChildFindFirst(...args),
    },
    note: {
      create: (...args: unknown[]) => mockNoteCreate(...args),
      findMany: (...args: unknown[]) => mockNoteFindMany(...args),
      count: (...args: unknown[]) => mockNoteCount(...args),
      findFirst: (...args: unknown[]) => mockNoteFindFirst(...args),
      update: (...args: unknown[]) => mockNoteUpdate(...args),
    },
    familyCircleMember: {
      findUnique: (...args: unknown[]) => mockFCMemberFindUnique(...args),
    },
  },
}));

import {
  createNote,
  listNotes,
  getNote,
  updateNote,
  deleteNote,
} from "../modules/notes/service";

const HH_ID = "hh-111";
const HH_ID_OTHER = "hh-999";
const PROFILE_A = "profile-aaa";
const PROFILE_B = "profile-bbb";
const FC_MEMBER_A = "fc-member-aaa";
const FC_MEMBER_B = "fc-member-bbb";
const NOTE_ID = "note-111";
const CHILD_ID = "child-111";

function makeNote(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTE_ID,
    householdId: HH_ID,
    authorKind: "profile",
    authorProfileId: PROFILE_A,
    authorFamilyCircleMemberId: null,
    noteType: "general",
    tag: null,
    childId: null,
    title: null,
    preview: "Test note content",
    fullContent: null,
    important: false,
    isFamilyCircle: false,
    relationshipLabel: null,
    hasAttachments: false,
    deletedAt: null,
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
    authorProfile: {
      id: PROFILE_A,
      firstName: "Alice",
      lastName: "Smith",
      avatarUrl: null,
    },
    authorFamilyCircleMember: null,
    child: null,
    ...overrides,
  };
}

function makeFCNote(overrides: Record<string, unknown> = {}) {
  return makeNote({
    authorKind: "family_circle",
    authorProfileId: null,
    authorFamilyCircleMemberId: FC_MEMBER_A,
    isFamilyCircle: true,
    relationshipLabel: "Grandmother",
    authorProfile: null,
    authorFamilyCircleMember: {
      id: FC_MEMBER_A,
      name: "Grandma Jane",
      relationship: "Grandmother",
      role: "contributor",
      avatarUrl: null,
    },
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createNote
// ---------------------------------------------------------------------------

describe("createNote", () => {
  it("creates a profile-authored note without child", async () => {
    mockNoteCreate.mockResolvedValue(makeNote());

    const result = await createNote(HH_ID, {
      profileId: PROFILE_A,
      data: {
        noteType: "general" as const,
        preview: "Test note content",
      },
    });

    expect(result.authorKind).toBe("profile");
    expect(result.authorProfileId).toBe(PROFILE_A);
    expect(mockNoteCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          householdId: HH_ID,
          authorKind: "profile",
          authorProfileId: PROFILE_A,
          authorFamilyCircleMemberId: null,
          preview: "Test note content",
        }),
      })
    );
  });

  it("creates a note with child", async () => {
    mockChildFindFirst.mockResolvedValue({ id: CHILD_ID, householdId: HH_ID });
    mockNoteCreate.mockResolvedValue(
      makeNote({
        childId: CHILD_ID,
        child: { id: CHILD_ID, firstName: "Emma", emoji: null },
      })
    );

    const result = await createNote(HH_ID, {
      profileId: PROFILE_A,
      data: {
        noteType: "medical" as const,
        preview: "Child health info",
        childId: CHILD_ID,
      },
    });

    expect(result.childId).toBe(CHILD_ID);
    expect(mockChildFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CHILD_ID, householdId: HH_ID },
      })
    );
  });

  it("rejects when child not found in household", async () => {
    mockChildFindFirst.mockResolvedValue(null);

    await expect(
      createNote(HH_ID, {
        profileId: PROFILE_A,
        data: {
          noteType: "general" as const,
          preview: "Content",
          childId: "non-existent",
        },
      })
    ).rejects.toThrow("Child not found.");
  });

  it("creates a family circle authored note", async () => {
    mockFCMemberFindUnique.mockResolvedValue({
      id: FC_MEMBER_A,
      relationship: "Grandmother",
    });
    mockNoteCreate.mockResolvedValue(makeFCNote());

    const result = await createNote(HH_ID, {
      profileId: PROFILE_A,
      familyCircleMemberId: FC_MEMBER_A,
      data: {
        noteType: "general" as const,
        preview: "Note from grandma",
      },
    });

    expect(result.authorKind).toBe("family_circle");
    expect(result.authorFamilyCircleMemberId).toBe(FC_MEMBER_A);
    expect(result.isFamilyCircle).toBe(true);
    expect(result.relationshipLabel).toBe("Grandmother");

    expect(mockNoteCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          authorKind: "family_circle",
          authorProfileId: null,
          authorFamilyCircleMemberId: FC_MEMBER_A,
          isFamilyCircle: true,
          relationshipLabel: "Grandmother",
        }),
      })
    );
  });

  it("sets relationshipLabel to null when FC member has no relationship", async () => {
    mockFCMemberFindUnique.mockResolvedValue({
      id: FC_MEMBER_A,
      relationship: null,
    });
    mockNoteCreate.mockResolvedValue(
      makeFCNote({ relationshipLabel: null })
    );

    await createNote(HH_ID, {
      profileId: PROFILE_A,
      familyCircleMemberId: FC_MEMBER_A,
      data: {
        noteType: "general" as const,
        preview: "Note content",
      },
    });

    expect(mockNoteCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          relationshipLabel: null,
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// listNotes
// ---------------------------------------------------------------------------

describe("listNotes", () => {
  it("returns paginated notes excluding soft-deleted", async () => {
    const notes = [makeNote(), makeNote({ id: "note-222" })];
    mockNoteFindMany.mockResolvedValue(notes);
    mockNoteCount.mockResolvedValue(2);

    const result = await listNotes(HH_ID, { page: 1, limit: 20 });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(mockNoteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          householdId: HH_ID,
          deletedAt: null,
        }),
        orderBy: { createdAt: "desc" },
      })
    );
  });

  it("scopes queries to household", async () => {
    mockNoteFindMany.mockResolvedValue([]);
    mockNoteCount.mockResolvedValue(0);

    await listNotes(HH_ID_OTHER, { page: 1, limit: 20 });

    expect(mockNoteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          householdId: HH_ID_OTHER,
        }),
      })
    );
  });

  it("filters by childId when provided", async () => {
    mockNoteFindMany.mockResolvedValue([]);
    mockNoteCount.mockResolvedValue(0);

    await listNotes(HH_ID, { page: 1, limit: 20, childId: CHILD_ID });

    expect(mockNoteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          householdId: HH_ID,
          deletedAt: null,
          childId: CHILD_ID,
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// getNote
// ---------------------------------------------------------------------------

describe("getNote", () => {
  it("returns a note by id scoped to household", async () => {
    mockNoteFindFirst.mockResolvedValue(makeNote());

    const result = await getNote(HH_ID, NOTE_ID);

    expect(result.id).toBe(NOTE_ID);
    expect(mockNoteFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: NOTE_ID, householdId: HH_ID, deletedAt: null },
      })
    );
  });

  it("throws 404 when note not found", async () => {
    mockNoteFindFirst.mockResolvedValue(null);

    await expect(getNote(HH_ID, "non-existent")).rejects.toThrow(
      "Note not found."
    );
  });

  it("throws 404 when note is in different household", async () => {
    mockNoteFindFirst.mockResolvedValue(null);

    await expect(getNote(HH_ID_OTHER, NOTE_ID)).rejects.toThrow(
      "Note not found."
    );
  });
});

// ---------------------------------------------------------------------------
// updateNote
// ---------------------------------------------------------------------------

describe("updateNote", () => {
  it("updates a note when author is the owner (profile)", async () => {
    const note = makeNote();
    const updatedNote = makeNote({ preview: "Updated content", important: true });
    mockNoteFindFirst.mockResolvedValue(note);
    mockNoteUpdate.mockResolvedValue(updatedNote);

    const result = await updateNote(HH_ID, NOTE_ID, {
      profileId: PROFILE_A,
      data: { preview: "Updated content", important: true },
    });

    expect(result.preview).toBe("Updated content");
    expect(result.important).toBe(true);
    expect(mockNoteUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: NOTE_ID },
        data: expect.objectContaining({
          preview: "Updated content",
          important: true,
        }),
      })
    );
  });

  it("updates a note when author is the owner (family circle)", async () => {
    const note = makeFCNote();
    const updatedNote = makeFCNote({ preview: "FC updated", tag: "important" });
    mockNoteFindFirst.mockResolvedValue(note);
    mockNoteUpdate.mockResolvedValue(updatedNote);

    const result = await updateNote(HH_ID, NOTE_ID, {
      profileId: PROFILE_A,
      familyCircleMemberId: FC_MEMBER_A,
      data: { preview: "FC updated", tag: "important" },
    });

    expect(result.preview).toBe("FC updated");
    expect(result.tag).toBe("important");
  });

  it("rejects update by non-author profile", async () => {
    const note = makeNote({ authorProfileId: PROFILE_A });
    mockNoteFindFirst.mockResolvedValue(note);

    await expect(
      updateNote(HH_ID, NOTE_ID, {
        profileId: PROFILE_B,
        data: { preview: "Hacked content" },
      })
    ).rejects.toThrow("You can only modify your own notes.");
  });

  it("rejects update by non-author FC member", async () => {
    const note = makeFCNote({ authorFamilyCircleMemberId: FC_MEMBER_A });
    mockNoteFindFirst.mockResolvedValue(note);

    await expect(
      updateNote(HH_ID, NOTE_ID, {
        profileId: PROFILE_B,
        familyCircleMemberId: FC_MEMBER_B,
        data: { preview: "Hacked content" },
      })
    ).rejects.toThrow("You can only modify your own notes.");
  });

  it("rejects profile user updating FC member note", async () => {
    const note = makeFCNote();
    mockNoteFindFirst.mockResolvedValue(note);

    await expect(
      updateNote(HH_ID, NOTE_ID, {
        profileId: PROFILE_A,
        data: { preview: "Trying to edit FC note" },
      })
    ).rejects.toThrow("You can only modify your own notes.");
  });

  it("throws 404 when note not found", async () => {
    mockNoteFindFirst.mockResolvedValue(null);

    await expect(
      updateNote(HH_ID, "non-existent", {
        profileId: PROFILE_A,
        data: { preview: "Content" },
      })
    ).rejects.toThrow("Note not found.");
  });

  it("only updates provided fields", async () => {
    const note = makeNote();
    mockNoteFindFirst.mockResolvedValue(note);
    mockNoteUpdate.mockResolvedValue(makeNote({ tag: "new-tag" }));

    await updateNote(HH_ID, NOTE_ID, {
      profileId: PROFILE_A,
      data: { tag: "new-tag" },
    });

    const updateCall = mockNoteUpdate.mock.calls[0][0];
    expect(updateCall.data).toEqual({ tag: "new-tag" });
    expect(updateCall.data).not.toHaveProperty("preview");
    expect(updateCall.data).not.toHaveProperty("important");
  });
});

// ---------------------------------------------------------------------------
// deleteNote
// ---------------------------------------------------------------------------

describe("deleteNote", () => {
  it("soft-deletes a note by setting deletedAt", async () => {
    mockNoteFindFirst.mockResolvedValue(makeNote());
    mockNoteUpdate.mockResolvedValue({
      ...makeNote(),
      deletedAt: new Date(),
    });

    const result = await deleteNote(HH_ID, NOTE_ID, {
      profileId: PROFILE_A,
    });

    expect(result).toEqual({ success: true });
    expect(mockNoteUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: NOTE_ID },
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
        }),
      })
    );
  });

  it("rejects delete by non-author profile", async () => {
    mockNoteFindFirst.mockResolvedValue(makeNote({ authorProfileId: PROFILE_A }));

    await expect(
      deleteNote(HH_ID, NOTE_ID, { profileId: PROFILE_B })
    ).rejects.toThrow("You can only modify your own notes.");
  });

  it("rejects delete by non-author FC member", async () => {
    mockNoteFindFirst.mockResolvedValue(
      makeFCNote({ authorFamilyCircleMemberId: FC_MEMBER_A })
    );

    await expect(
      deleteNote(HH_ID, NOTE_ID, {
        profileId: PROFILE_B,
        familyCircleMemberId: FC_MEMBER_B,
      })
    ).rejects.toThrow("You can only modify your own notes.");
  });

  it("rejects profile user deleting FC member note", async () => {
    mockNoteFindFirst.mockResolvedValue(makeFCNote());

    await expect(
      deleteNote(HH_ID, NOTE_ID, { profileId: PROFILE_A })
    ).rejects.toThrow("You can only modify your own notes.");
  });

  it("throws 404 when note not found", async () => {
    mockNoteFindFirst.mockResolvedValue(null);

    await expect(
      deleteNote(HH_ID, "non-existent", { profileId: PROFILE_A })
    ).rejects.toThrow("Note not found.");
  });

  it("FC author can delete their own note", async () => {
    mockNoteFindFirst.mockResolvedValue(makeFCNote());
    mockNoteUpdate.mockResolvedValue({
      ...makeFCNote(),
      deletedAt: new Date(),
    });

    const result = await deleteNote(HH_ID, NOTE_ID, {
      profileId: PROFILE_A,
      familyCircleMemberId: FC_MEMBER_A,
    });

    expect(result).toEqual({ success: true });
  });
});
