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
  },
}));

import { createNote, listNotes, getNote, deleteNote } from "../modules/notes/service";

const HH_ID = "hh-111";
const HH_ID_OTHER = "hh-999";
const PROFILE_A = "profile-aaa";
const NOTE_ID = "note-111";
const CHILD_ID = "child-111";

function makeNote(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTE_ID,
    householdId: HH_ID,
    childId: null,
    createdByProfileId: PROFILE_A,
    title: "Test Note",
    text: "Note content here",
    deletedAt: null,
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
    child: null,
    createdByProfile: { id: PROFILE_A, firstName: "Alice", lastName: "Smith" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createNote
// ---------------------------------------------------------------------------

describe("createNote", () => {
  it("creates a note without child", async () => {
    mockNoteCreate.mockResolvedValue(makeNote());

    const result = await createNote(HH_ID, PROFILE_A, {
      title: "Test Note",
      text: "Note content here",
    });

    expect(result.title).toBe("Test Note");
    expect(mockNoteCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          householdId: HH_ID,
          createdByProfileId: PROFILE_A,
          title: "Test Note",
        }),
      })
    );
  });

  it("creates a note with child", async () => {
    mockChildFindFirst.mockResolvedValue({ id: CHILD_ID, householdId: HH_ID });
    mockNoteCreate.mockResolvedValue(
      makeNote({ childId: CHILD_ID, child: { id: CHILD_ID, firstName: "Emma" } })
    );

    const result = await createNote(HH_ID, PROFILE_A, {
      title: "School Info",
      text: "Details",
      childId: CHILD_ID,
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
      createNote(HH_ID, PROFILE_A, {
        title: "Note",
        text: "Content",
        childId: "non-existent",
      })
    ).rejects.toThrow("Child not found.");
  });
});

// ---------------------------------------------------------------------------
// listNotes
// ---------------------------------------------------------------------------

describe("listNotes", () => {
  it("returns paginated notes", async () => {
    const notes = [makeNote(), makeNote({ id: "note-222" })];
    mockNoteFindMany.mockResolvedValue(notes);
    mockNoteCount.mockResolvedValue(2);

    const result = await listNotes(HH_ID, { page: 1, limit: 20 });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(mockNoteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          householdId: HH_ID,
          deletedAt: null,
        }),
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
});

// ---------------------------------------------------------------------------
// getNote
// ---------------------------------------------------------------------------

describe("getNote", () => {
  it("returns a note by id", async () => {
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
// deleteNote
// ---------------------------------------------------------------------------

describe("deleteNote", () => {
  it("soft-deletes a note", async () => {
    mockNoteFindFirst.mockResolvedValue(makeNote());
    mockNoteUpdate.mockResolvedValue({ ...makeNote(), deletedAt: new Date() });

    const result = await deleteNote(HH_ID, NOTE_ID);

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

  it("throws 404 when note not found", async () => {
    mockNoteFindFirst.mockResolvedValue(null);

    await expect(deleteNote(HH_ID, "non-existent")).rejects.toThrow(
      "Note not found."
    );
  });
});
