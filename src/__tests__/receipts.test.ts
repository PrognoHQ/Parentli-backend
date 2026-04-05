import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockConversationFindFirst = vi.fn();
const mockConversationMemberFindFirst = vi.fn();
const mockConversationMemberFindMany = vi.fn();
const mockMessageFindFirst = vi.fn();
const mockMessageFindMany = vi.fn();
const mockMessageCount = vi.fn();
const mockMessageCreate = vi.fn();
const mockMessageUpdate = vi.fn();
const mockMessageDeletionUpsert = vi.fn();
const mockConversationUpdate = vi.fn();
const mockReceiptCreateMany = vi.fn();
const mockReceiptUpdateMany = vi.fn();
const mockTransaction = vi.fn();
const mockExecuteRaw = vi.fn();

vi.mock("../lib/prisma", () => ({
  prisma: {
    conversation: {
      findFirst: (...args: unknown[]) => mockConversationFindFirst(...args),
    },
    conversationMember: {
      findFirst: (...args: unknown[]) => mockConversationMemberFindFirst(...args),
      findMany: (...args: unknown[]) => mockConversationMemberFindMany(...args),
    },
    message: {
      findFirst: (...args: unknown[]) => mockMessageFindFirst(...args),
      findMany: (...args: unknown[]) => mockMessageFindMany(...args),
      count: (...args: unknown[]) => mockMessageCount(...args),
    },
    messageReceipt: {
      createMany: (...args: unknown[]) => mockReceiptCreateMany(...args),
      updateMany: (...args: unknown[]) => mockReceiptUpdateMany(...args),
    },
    messageDeletion: {
      upsert: (...args: unknown[]) => mockMessageDeletionUpsert(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
    $executeRaw: (...args: unknown[]) => mockExecuteRaw(...args),
  },
}));

import { sendMessage } from "../modules/messages/service";
import {
  markMessageDelivered,
  markConversationRead,
} from "../modules/messages/receipts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HH_ID = "hh-111";
const HH_ID_OTHER = "hh-999";
const PROFILE_A = "profile-aaa";
const PROFILE_B = "profile-bbb";
const CONV_ID = "conv-111";
const MSG_ID = "msg-111";

function makeConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: CONV_ID,
    householdId: HH_ID,
    type: "coparent",
    deletedAt: null,
    ...overrides,
  };
}

function makeMember(
  profileId: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    id: `cm-${profileId}`,
    conversationId: CONV_ID,
    householdId: HH_ID,
    memberKind: "profile",
    profileId,
    familyCircleMemberId: null,
    leftAt: null,
    ...overrides,
  };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: MSG_ID,
    householdId: HH_ID,
    conversationId: CONV_ID,
    senderKind: "profile",
    senderProfileId: PROFILE_A,
    type: "text",
    text: "Hello",
    replyToMessageId: null,
    metadata: {},
    createdAt: new Date("2026-01-01T10:00:00Z"),
    ...overrides,
  };
}

function setupTransaction() {
  mockTransaction.mockImplementation(
    async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        message: {
          create: mockMessageCreate,
          update: mockMessageUpdate,
        },
        conversation: {
          update: mockConversationUpdate,
        },
        conversationMember: {
          findMany: mockConversationMemberFindMany,
        },
        messageReceipt: {
          createMany: mockReceiptCreateMany,
        },
        messageDeletion: {
          upsert: mockMessageDeletionUpsert,
        },
      };
      return cb(tx);
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Receipt generation on sendMessage
// ---------------------------------------------------------------------------

describe("sendMessage — receipt generation", () => {
  it("creates receipts for other members (not sender) on send", async () => {
    mockConversationFindFirst.mockResolvedValue(makeConversation());
    mockConversationMemberFindFirst.mockResolvedValue(makeMember(PROFILE_A));
    setupTransaction();

    const created = makeMessage();
    mockMessageCreate.mockResolvedValue(created);
    mockConversationUpdate.mockResolvedValue({});
    mockReceiptCreateMany.mockResolvedValue({ count: 1 });

    // Two active members: sender (A) and recipient (B)
    mockConversationMemberFindMany.mockResolvedValue([
      makeMember(PROFILE_A),
      makeMember(PROFILE_B),
    ]);

    await sendMessage(HH_ID, PROFILE_A, {
      conversationId: CONV_ID,
      type: "text",
      text: "Hello",
    });

    // Verify receipt was created only for PROFILE_B (not sender A)
    expect(mockReceiptCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            householdId: HH_ID,
            messageId: MSG_ID,
            recipientKind: "profile",
            recipientProfileId: PROFILE_B,
          }),
        ]),
      })
    );

    // Verify sender is NOT in receipts
    const createManyCall = mockReceiptCreateMany.mock.calls[0][0];
    const recipientIds = createManyCall.data.map(
      (r: { recipientProfileId: string }) => r.recipientProfileId
    );
    expect(recipientIds).not.toContain(PROFILE_A);
  });

  it("does not create receipts when sender is the only member", async () => {
    mockConversationFindFirst.mockResolvedValue(makeConversation());
    mockConversationMemberFindFirst.mockResolvedValue(makeMember(PROFILE_A));
    setupTransaction();

    const created = makeMessage();
    mockMessageCreate.mockResolvedValue(created);
    mockConversationUpdate.mockResolvedValue({});

    // Only sender is a member
    mockConversationMemberFindMany.mockResolvedValue([makeMember(PROFILE_A)]);

    await sendMessage(HH_ID, PROFILE_A, {
      conversationId: CONV_ID,
      type: "text",
      text: "Hello",
    });

    // createMany should not have been called (no recipients)
    expect(mockReceiptCreateMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// markMessageDelivered
// ---------------------------------------------------------------------------

describe("markMessageDelivered", () => {
  it("marks a message delivered for a valid recipient", async () => {
    mockMessageFindFirst.mockResolvedValue(makeMessage());
    mockConversationMemberFindFirst.mockResolvedValue(makeMember(PROFILE_B));
    mockReceiptUpdateMany.mockResolvedValue({ count: 1 });

    const result = await markMessageDelivered(HH_ID, PROFILE_B, MSG_ID);

    expect(result).toEqual({ success: true, updated: 1 });
    expect(mockReceiptUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          messageId: MSG_ID,
          recipientProfileId: PROFILE_B,
          deliveredAt: null,
        }),
      })
    );
  });

  it("rejects with 404 when message not found", async () => {
    mockMessageFindFirst.mockResolvedValue(null);

    await expect(
      markMessageDelivered(HH_ID, PROFILE_B, MSG_ID)
    ).rejects.toThrow("Message not found.");
  });

  it("rejects with 404 when message is in different household", async () => {
    mockMessageFindFirst.mockResolvedValue(null);

    await expect(
      markMessageDelivered(HH_ID_OTHER, PROFILE_B, MSG_ID)
    ).rejects.toThrow("Message not found.");
  });

  it("rejects with 403 when actor is not a member", async () => {
    mockMessageFindFirst.mockResolvedValue(makeMessage());
    mockConversationMemberFindFirst.mockResolvedValue(null);

    await expect(
      markMessageDelivered(HH_ID, PROFILE_B, MSG_ID)
    ).rejects.toThrow("Not a member of this conversation.");
  });
});

// ---------------------------------------------------------------------------
// markConversationRead
// ---------------------------------------------------------------------------

describe("markConversationRead", () => {
  it("bulk marks conversation as read for valid member", async () => {
    mockConversationFindFirst.mockResolvedValue(makeConversation());
    mockConversationMemberFindFirst.mockResolvedValue(makeMember(PROFILE_B));
    mockExecuteRaw.mockResolvedValue(3); // 3 receipts updated

    const result = await markConversationRead(HH_ID, PROFILE_B, CONV_ID);

    expect(result).toEqual({ success: true, updatedCount: 3 });
    expect(mockExecuteRaw).toHaveBeenCalled();
  });

  it("rejects with 404 when conversation not found", async () => {
    mockConversationFindFirst.mockResolvedValue(null);

    await expect(
      markConversationRead(HH_ID, PROFILE_B, CONV_ID)
    ).rejects.toThrow("Conversation not found.");
  });

  it("rejects with 404 when conversation in different household", async () => {
    mockConversationFindFirst.mockResolvedValue(null);

    await expect(
      markConversationRead(HH_ID_OTHER, PROFILE_B, CONV_ID)
    ).rejects.toThrow("Conversation not found.");
  });

  it("rejects with 403 when actor is not a member", async () => {
    mockConversationFindFirst.mockResolvedValue(makeConversation());
    mockConversationMemberFindFirst.mockResolvedValue(null);

    await expect(
      markConversationRead(HH_ID, PROFILE_B, CONV_ID)
    ).rejects.toThrow("Not a member of this conversation.");
  });
});
