import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockExpenseFindFirst = vi.fn();
const mockEventFindFirst = vi.fn();
const mockNoteFindFirst = vi.fn();
const mockSharedContentCreate = vi.fn();

const tx = {
  expense: { findFirst: mockExpenseFindFirst },
  event: { findFirst: mockEventFindFirst },
  note: { findFirst: mockNoteFindFirst },
  messageSharedContent: { create: mockSharedContentCreate },
};

// We import the function directly — it operates on a transaction object, not prisma
import { validateAndCreateSharedContent } from "../modules/messages/sharedContent";

const HH_ID = "hh-111";
const MSG_ID = "msg-111";
const EXPENSE_ID = "exp-111";
const EVENT_ID = "evt-111";
const NOTE_ID = "note-111";

beforeEach(() => {
  vi.clearAllMocks();
  mockSharedContentCreate.mockImplementation(async (args: any) => ({
    id: "sc-111",
    ...args.data,
  }));
});

// ---------------------------------------------------------------------------
// Expense shared content
// ---------------------------------------------------------------------------

describe("validateAndCreateSharedContent — expense", () => {
  it("creates shared content for valid expense", async () => {
    mockExpenseFindFirst.mockResolvedValue({ id: EXPENSE_ID, householdId: HH_ID });

    const result = await validateAndCreateSharedContent(tx, HH_ID, MSG_ID, {
      contentType: "expense",
      expenseId: EXPENSE_ID,
    });

    expect(result).toMatchObject({
      householdId: HH_ID,
      messageId: MSG_ID,
      contentType: "expense",
      expenseId: EXPENSE_ID,
    });
    expect(mockExpenseFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EXPENSE_ID, householdId: HH_ID, deletedAt: null },
      })
    );
  });

  it("rejects when expense not found", async () => {
    mockExpenseFindFirst.mockResolvedValue(null);

    await expect(
      validateAndCreateSharedContent(tx, HH_ID, MSG_ID, {
        contentType: "expense",
        expenseId: EXPENSE_ID,
      })
    ).rejects.toThrow("Expense not found in this household.");
  });

  it("rejects when expenseId is missing for expense type", async () => {
    await expect(
      validateAndCreateSharedContent(tx, HH_ID, MSG_ID, {
        contentType: "expense",
      })
    ).rejects.toThrow("expenseId is required for expense shared content.");
  });

  it("rejects when extra references are provided", async () => {
    await expect(
      validateAndCreateSharedContent(tx, HH_ID, MSG_ID, {
        contentType: "expense",
        expenseId: EXPENSE_ID,
        eventId: EVENT_ID,
      })
    ).rejects.toThrow("Only expenseId should be set for expense shared content.");
  });
});

// ---------------------------------------------------------------------------
// Event shared content
// ---------------------------------------------------------------------------

describe("validateAndCreateSharedContent — event", () => {
  it("creates shared content for valid event", async () => {
    mockEventFindFirst.mockResolvedValue({ id: EVENT_ID, householdId: HH_ID });

    const result = await validateAndCreateSharedContent(tx, HH_ID, MSG_ID, {
      contentType: "event",
      eventId: EVENT_ID,
    });

    expect(result).toMatchObject({
      householdId: HH_ID,
      messageId: MSG_ID,
      contentType: "event",
      eventId: EVENT_ID,
    });
    expect(mockEventFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EVENT_ID, householdId: HH_ID, isDeleted: false },
      })
    );
  });

  it("rejects when event not found", async () => {
    mockEventFindFirst.mockResolvedValue(null);

    await expect(
      validateAndCreateSharedContent(tx, HH_ID, MSG_ID, {
        contentType: "event",
        eventId: EVENT_ID,
      })
    ).rejects.toThrow("Event not found in this household.");
  });

  it("rejects when eventId is missing for event type", async () => {
    await expect(
      validateAndCreateSharedContent(tx, HH_ID, MSG_ID, {
        contentType: "event",
      })
    ).rejects.toThrow("eventId is required for event shared content.");
  });
});

// ---------------------------------------------------------------------------
// Note shared content
// ---------------------------------------------------------------------------

describe("validateAndCreateSharedContent — note", () => {
  it("creates shared content for valid note", async () => {
    mockNoteFindFirst.mockResolvedValue({ id: NOTE_ID, householdId: HH_ID });

    const result = await validateAndCreateSharedContent(tx, HH_ID, MSG_ID, {
      contentType: "note",
      noteId: NOTE_ID,
    });

    expect(result).toMatchObject({
      householdId: HH_ID,
      messageId: MSG_ID,
      contentType: "note",
      noteId: NOTE_ID,
    });
    expect(mockNoteFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: NOTE_ID, householdId: HH_ID, deletedAt: null },
      })
    );
  });

  it("rejects when note not found", async () => {
    mockNoteFindFirst.mockResolvedValue(null);

    await expect(
      validateAndCreateSharedContent(tx, HH_ID, MSG_ID, {
        contentType: "note",
        noteId: NOTE_ID,
      })
    ).rejects.toThrow("Note not found in this household.");
  });
});

// ---------------------------------------------------------------------------
// Invalid content type
// ---------------------------------------------------------------------------

describe("validateAndCreateSharedContent — invalid", () => {
  it("rejects invalid content type", async () => {
    await expect(
      validateAndCreateSharedContent(tx, HH_ID, MSG_ID, {
        contentType: "invalid" as any,
      })
    ).rejects.toThrow("Invalid shared content type.");
  });
});
