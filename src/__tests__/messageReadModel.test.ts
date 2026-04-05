import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockMessageFindMany = vi.fn();
const mockMessageCount = vi.fn();
const mockExpenseFindMany = vi.fn();
const mockEventFindMany = vi.fn();
const mockNoteFindMany = vi.fn();

vi.mock("../lib/prisma", () => ({
  prisma: {
    message: {
      findMany: (...args: unknown[]) => mockMessageFindMany(...args),
      count: (...args: unknown[]) => mockMessageCount(...args),
    },
    expense: {
      findMany: (...args: unknown[]) => mockExpenseFindMany(...args),
    },
    event: {
      findMany: (...args: unknown[]) => mockEventFindMany(...args),
    },
    note: {
      findMany: (...args: unknown[]) => mockNoteFindMany(...args),
    },
  },
}));

import { getMessagesWithReadModel } from "../modules/messages/queries";

const HH_ID = "hh-111";
const CONV_ID = "conv-111";
const PROFILE_A = "profile-aaa";
const PROFILE_B = "profile-bbb";

function makeRawMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-111",
    householdId: HH_ID,
    conversationId: CONV_ID,
    senderKind: "profile",
    senderProfileId: PROFILE_A,
    senderFamilyCircleMemberId: null,
    type: "text",
    text: "Hello",
    replyToMessageId: null,
    metadata: {},
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
    editedAt: null,
    senderProfile: {
      id: PROFILE_A,
      firstName: "Alice",
      lastName: "Smith",
      avatarUrl: null,
    },
    senderFamilyCircleMember: null,
    replyToMessage: null,
    reactions: [],
    attachments: [],
    sharedContent: null,
    receipts: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExpenseFindMany.mockResolvedValue([]);
  mockEventFindMany.mockResolvedValue([]);
  mockNoteFindMany.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Basic read model shape
// ---------------------------------------------------------------------------

describe("getMessagesWithReadModel — basic shape", () => {
  it("returns the unified read model shape", async () => {
    mockMessageFindMany.mockResolvedValue([makeRawMessage()]);
    mockMessageCount.mockResolvedValue(1);

    const result = await getMessagesWithReadModel(HH_ID, CONV_ID, PROFILE_A, 1, 20);

    expect(result.data).toHaveLength(1);
    const msg = result.data[0];

    expect(msg).toMatchObject({
      id: "msg-111",
      conversationId: CONV_ID,
      type: "text",
      text: "Hello",
      deleted: false,
    });

    // Sender shape
    expect(msg.sender).toMatchObject({
      id: PROFILE_A,
      kind: "profile",
      firstName: "Alice",
      lastName: "Smith",
    });

    // Empty arrays/null for optional fields
    expect(msg.reactions).toEqual([]);
    expect(msg.attachments).toEqual([]);
    expect(msg.sharedContent).toBeNull();
    expect(msg.replyTo).toBeNull();
    expect(msg.receipt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Reactions aggregation
// ---------------------------------------------------------------------------

describe("getMessagesWithReadModel — reactions", () => {
  it("aggregates reactions by emoji with current user flag", async () => {
    mockMessageFindMany.mockResolvedValue([
      makeRawMessage({
        reactions: [
          { emoji: "👍", actorProfileId: PROFILE_A, actorFamilyCircleMemberId: null },
          { emoji: "👍", actorProfileId: PROFILE_B, actorFamilyCircleMemberId: null },
          { emoji: "❤️", actorProfileId: PROFILE_B, actorFamilyCircleMemberId: null },
        ],
      }),
    ]);
    mockMessageCount.mockResolvedValue(1);

    const result = await getMessagesWithReadModel(HH_ID, CONV_ID, PROFILE_A, 1, 20);
    const msg = result.data[0];

    expect(msg.reactions).toHaveLength(2);

    const thumbsUp = msg.reactions.find((r) => r.emoji === "👍");
    expect(thumbsUp).toEqual({
      emoji: "👍",
      count: 2,
      reactedByCurrentUser: true,
    });

    const heart = msg.reactions.find((r) => r.emoji === "❤️");
    expect(heart).toEqual({
      emoji: "❤️",
      count: 1,
      reactedByCurrentUser: false,
    });
  });
});

// ---------------------------------------------------------------------------
// Delete suppression
// ---------------------------------------------------------------------------

describe("getMessagesWithReadModel — delete suppression", () => {
  it("suppresses reactions, attachments, and shared content on deleted messages", async () => {
    mockMessageFindMany.mockResolvedValue([
      makeRawMessage({
        metadata: { deleted: true },
        text: null,
        reactions: [
          { emoji: "👍", actorProfileId: PROFILE_A, actorFamilyCircleMemberId: null },
        ],
        attachments: [
          { fileName: "doc.pdf", fileType: "pdf", fileSize: 1024, fileUrl: "https://x.com/doc.pdf" },
        ],
        sharedContent: {
          contentType: "expense",
          expenseId: "exp-111",
          eventId: null,
          noteId: null,
        },
      }),
    ]);
    mockMessageCount.mockResolvedValue(1);

    const result = await getMessagesWithReadModel(HH_ID, CONV_ID, PROFILE_A, 1, 20);
    const msg = result.data[0];

    expect(msg.deleted).toBe(true);
    expect(msg.text).toBeNull();
    expect(msg.reactions).toEqual([]);
    expect(msg.attachments).toEqual([]);
    expect(msg.sharedContent).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Shared content previews
// ---------------------------------------------------------------------------

describe("getMessagesWithReadModel — shared content previews", () => {
  it("loads expense preview", async () => {
    mockMessageFindMany.mockResolvedValue([
      makeRawMessage({
        type: "expense",
        sharedContent: {
          contentType: "expense",
          expenseId: "exp-111",
          eventId: null,
          noteId: null,
        },
      }),
    ]);
    mockMessageCount.mockResolvedValue(1);
    mockExpenseFindMany.mockResolvedValue([
      {
        id: "exp-111",
        description: "Lunch",
        amount: { toString: () => "25.50" },
        status: "draft",
      },
    ]);

    const result = await getMessagesWithReadModel(HH_ID, CONV_ID, PROFILE_A, 1, 20);
    const msg = result.data[0];

    expect(msg.sharedContent).toEqual({
      type: "expense",
      preview: {
        id: "exp-111",
        description: "Lunch",
        amount: "25.50",
        status: "draft",
      },
    });
  });

  it("loads event preview with child name", async () => {
    mockMessageFindMany.mockResolvedValue([
      makeRawMessage({
        type: "event",
        sharedContent: {
          contentType: "event",
          expenseId: null,
          eventId: "evt-111",
          noteId: null,
        },
      }),
    ]);
    mockMessageCount.mockResolvedValue(1);
    mockEventFindMany.mockResolvedValue([
      {
        id: "evt-111",
        title: "Doctor visit",
        startAt: new Date("2026-03-15T14:00:00Z"),
        primaryChild: { firstName: "Emma" },
      },
    ]);

    const result = await getMessagesWithReadModel(HH_ID, CONV_ID, PROFILE_A, 1, 20);
    const msg = result.data[0];

    expect(msg.sharedContent).toEqual({
      type: "event",
      preview: {
        id: "evt-111",
        title: "Doctor visit",
        date: "2026-03-15T14:00:00.000Z",
        child: "Emma",
      },
    });
  });

  it("loads note preview with truncated text", async () => {
    const longText = "A".repeat(300);
    mockMessageFindMany.mockResolvedValue([
      makeRawMessage({
        type: "note",
        sharedContent: {
          contentType: "note",
          expenseId: null,
          eventId: null,
          noteId: "note-111",
        },
      }),
    ]);
    mockMessageCount.mockResolvedValue(1);
    mockNoteFindMany.mockResolvedValue([
      {
        id: "note-111",
        title: "School info",
        text: longText,
        child: { firstName: "Jake" },
      },
    ]);

    const result = await getMessagesWithReadModel(HH_ID, CONV_ID, PROFILE_A, 1, 20);
    const msg = result.data[0];

    expect(msg.sharedContent).toEqual({
      type: "note",
      preview: {
        id: "note-111",
        title: "School info",
        previewText: longText.substring(0, 200) + "...",
        childName: "Jake",
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Receipt state
// ---------------------------------------------------------------------------

describe("getMessagesWithReadModel — receipts", () => {
  it("returns receipt state for messages from other senders", async () => {
    mockMessageFindMany.mockResolvedValue([
      makeRawMessage({
        senderProfileId: PROFILE_B,
        senderProfile: {
          id: PROFILE_B,
          firstName: "Bob",
          lastName: "Jones",
          avatarUrl: null,
        },
        receipts: [
          { deliveredAt: new Date("2026-01-01T10:01:00Z"), readAt: null },
        ],
      }),
    ]);
    mockMessageCount.mockResolvedValue(1);

    const result = await getMessagesWithReadModel(HH_ID, CONV_ID, PROFILE_A, 1, 20);
    const msg = result.data[0];

    expect(msg.receipt).toEqual({
      delivered: true,
      read: false,
    });
  });

  it("returns null receipt for own messages", async () => {
    mockMessageFindMany.mockResolvedValue([
      makeRawMessage({
        senderProfileId: PROFILE_A,
        receipts: [
          { deliveredAt: new Date(), readAt: new Date() },
        ],
      }),
    ]);
    mockMessageCount.mockResolvedValue(1);

    const result = await getMessagesWithReadModel(HH_ID, CONV_ID, PROFILE_A, 1, 20);
    const msg = result.data[0];

    expect(msg.receipt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Reply-to shape
// ---------------------------------------------------------------------------

describe("getMessagesWithReadModel — reply-to", () => {
  it("includes reply-to with sender info", async () => {
    mockMessageFindMany.mockResolvedValue([
      makeRawMessage({
        replyToMessage: {
          id: "msg-222",
          text: "Original message",
          senderKind: "profile",
          senderProfile: {
            id: PROFILE_B,
            firstName: "Bob",
            lastName: "Jones",
          },
          senderFamilyCircleMember: null,
        },
      }),
    ]);
    mockMessageCount.mockResolvedValue(1);

    const result = await getMessagesWithReadModel(HH_ID, CONV_ID, PROFILE_A, 1, 20);
    const msg = result.data[0];

    expect(msg.replyTo).toEqual({
      id: "msg-222",
      sender: {
        id: PROFILE_B,
        firstName: "Bob",
        lastName: "Jones",
      },
      text: "Original message",
    });
  });
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

describe("getMessagesWithReadModel — pagination", () => {
  it("applies correct skip/take", async () => {
    mockMessageFindMany.mockResolvedValue([]);
    mockMessageCount.mockResolvedValue(50);

    const result = await getMessagesWithReadModel(HH_ID, CONV_ID, PROFILE_A, 3, 10);

    expect(result).toMatchObject({ total: 50, page: 3, limit: 10 });
    expect(mockMessageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 10,
      })
    );
  });
});
