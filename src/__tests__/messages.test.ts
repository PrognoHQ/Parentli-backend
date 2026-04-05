import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockConversationFindFirst = vi.fn();
const mockConversationMemberFindFirst = vi.fn();
const mockMessageFindFirst = vi.fn();
const mockMessageFindMany = vi.fn();
const mockMessageCount = vi.fn();
const mockMessageCreate = vi.fn();
const mockMessageUpdate = vi.fn();
const mockMessageDeletionFindMany = vi.fn();
const mockMessageDeletionUpsert = vi.fn();
const mockConversationUpdate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("../lib/prisma", () => ({
  prisma: {
    conversation: {
      findFirst: (...args: unknown[]) => mockConversationFindFirst(...args),
    },
    conversationMember: {
      findFirst: (...args: unknown[]) => mockConversationMemberFindFirst(...args),
    },
    message: {
      findFirst: (...args: unknown[]) => mockMessageFindFirst(...args),
      findMany: (...args: unknown[]) => mockMessageFindMany(...args),
      count: (...args: unknown[]) => mockMessageCount(...args),
    },
    messageDeletion: {
      findMany: (...args: unknown[]) => mockMessageDeletionFindMany(...args),
      upsert: (...args: unknown[]) => mockMessageDeletionUpsert(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

import { sendMessage, listMessages, deleteMessage } from "../modules/messages/service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HH_ID = "hh-111";
const HH_ID_OTHER = "hh-999";
const PROFILE_A = "profile-aaa";
const PROFILE_B = "profile-bbb";
const CONV_ID = "conv-111";
const MSG_ID = "msg-111";
const MSG_ID_2 = "msg-222";

function makeConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: CONV_ID,
    householdId: HH_ID,
    type: "coparent",
    deletedAt: null,
    ...overrides,
  };
}

function makeMember(overrides: Record<string, unknown> = {}) {
  return {
    id: "cm-1",
    conversationId: CONV_ID,
    householdId: HH_ID,
    profileId: PROFILE_A,
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
// sendMessage
// ---------------------------------------------------------------------------

describe("sendMessage", () => {
  it("sends a message when sender is an active member", async () => {
    mockConversationFindFirst.mockResolvedValue(makeConversation());
    mockConversationMemberFindFirst.mockResolvedValue(makeMember());
    setupTransaction();

    const created = makeMessage();
    mockMessageCreate.mockResolvedValue(created);
    mockConversationUpdate.mockResolvedValue({});

    const result = await sendMessage(HH_ID, PROFILE_A, {
      conversationId: CONV_ID,
      type: "text",
      text: "Hello",
    });

    expect(result).toEqual(created);
    // Verify conversation was looked up with householdId
    expect(mockConversationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: CONV_ID,
          householdId: HH_ID,
          deletedAt: null,
        }),
      })
    );
    // Verify membership was checked
    expect(mockConversationMemberFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          conversationId: CONV_ID,
          profileId: PROFILE_A,
          householdId: HH_ID,
          leftAt: null,
        }),
      })
    );
    // Verify sender identity is server-derived, not client-supplied
    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          senderKind: "profile",
          senderProfileId: PROFILE_A,
          householdId: HH_ID,
        }),
      })
    );
  });

  it("rejects non-member with 403", async () => {
    mockConversationFindFirst.mockResolvedValue(makeConversation());
    mockConversationMemberFindFirst.mockResolvedValue(null); // Not a member

    await expect(
      sendMessage(HH_ID, PROFILE_B, {
        conversationId: CONV_ID,
        type: "text",
        text: "Hello",
      })
    ).rejects.toThrow("Not a member of this conversation.");
  });

  it("rejects when conversation is in different household (404)", async () => {
    mockConversationFindFirst.mockResolvedValue(null); // Not found in this household

    await expect(
      sendMessage(HH_ID_OTHER, PROFILE_A, {
        conversationId: CONV_ID,
        type: "text",
        text: "Hello",
      })
    ).rejects.toThrow("Conversation not found.");
  });

  it("rejects when conversation does not exist (404)", async () => {
    mockConversationFindFirst.mockResolvedValue(null);

    await expect(
      sendMessage(HH_ID, PROFILE_A, {
        conversationId: "non-existent",
        type: "text",
        text: "Hello",
      })
    ).rejects.toThrow("Conversation not found.");
  });

  it("touches conversation updatedAt in the same transaction", async () => {
    mockConversationFindFirst.mockResolvedValue(makeConversation());
    mockConversationMemberFindFirst.mockResolvedValue(makeMember());
    setupTransaction();
    mockMessageCreate.mockResolvedValue(makeMessage());
    mockConversationUpdate.mockResolvedValue({});

    await sendMessage(HH_ID, PROFILE_A, {
      conversationId: CONV_ID,
      type: "text",
      text: "Hello",
    });

    expect(mockConversationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CONV_ID },
        data: expect.objectContaining({ updatedAt: expect.any(Date) }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// sendMessage — reply logic
// ---------------------------------------------------------------------------

describe("sendMessage — reply logic", () => {
  it("allows reply to message in the same conversation", async () => {
    mockConversationFindFirst.mockResolvedValue(makeConversation());
    mockConversationMemberFindFirst.mockResolvedValue(makeMember());
    // Reply target exists in same conversation
    mockMessageFindFirst.mockResolvedValue(
      makeMessage({ id: MSG_ID_2, conversationId: CONV_ID, householdId: HH_ID })
    );
    setupTransaction();

    const created = makeMessage({ replyToMessageId: MSG_ID_2 });
    mockMessageCreate.mockResolvedValue(created);
    mockConversationUpdate.mockResolvedValue({});

    const result = await sendMessage(HH_ID, PROFILE_A, {
      conversationId: CONV_ID,
      type: "text",
      text: "Reply!",
      replyToMessageId: MSG_ID_2,
    });

    expect(result.replyToMessageId).toBe(MSG_ID_2);
    // Verify reply target was validated in same conversation AND household
    expect(mockMessageFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: MSG_ID_2,
          conversationId: CONV_ID,
          householdId: HH_ID,
        }),
      })
    );
  });

  it("blocks reply to message in a different conversation", async () => {
    mockConversationFindFirst.mockResolvedValue(makeConversation());
    mockConversationMemberFindFirst.mockResolvedValue(makeMember());
    // Reply target NOT found (different conversation)
    mockMessageFindFirst.mockResolvedValue(null);

    await expect(
      sendMessage(HH_ID, PROFILE_A, {
        conversationId: CONV_ID,
        type: "text",
        text: "Cross-conv reply",
        replyToMessageId: "msg-in-other-conv",
      })
    ).rejects.toThrow("Reply target message not found in this conversation.");
  });

  it("blocks reply to message in a different household", async () => {
    mockConversationFindFirst.mockResolvedValue(makeConversation());
    mockConversationMemberFindFirst.mockResolvedValue(makeMember());
    // Reply target NOT found (different household)
    mockMessageFindFirst.mockResolvedValue(null);

    await expect(
      sendMessage(HH_ID, PROFILE_A, {
        conversationId: CONV_ID,
        type: "text",
        text: "Cross-household reply",
        replyToMessageId: "msg-in-other-household",
      })
    ).rejects.toThrow("Reply target message not found in this conversation.");
  });
});

// ---------------------------------------------------------------------------
// listMessages
// ---------------------------------------------------------------------------

describe("listMessages", () => {
  it("returns paginated messages for an active member", async () => {
    mockConversationFindFirst.mockResolvedValue(makeConversation());
    mockConversationMemberFindFirst.mockResolvedValue(makeMember());

    const messages = [makeMessage(), makeMessage({ id: MSG_ID_2 })];
    mockMessageFindMany.mockResolvedValue(messages);
    mockMessageCount.mockResolvedValue(2);

    const result = await listMessages(HH_ID, CONV_ID, PROFILE_A, {
      page: 1,
      limit: 20,
    });

    expect(result.data).toEqual(messages);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("rejects non-member with 403", async () => {
    mockConversationFindFirst.mockResolvedValue(makeConversation());
    mockConversationMemberFindFirst.mockResolvedValue(null);

    await expect(
      listMessages(HH_ID, CONV_ID, "non-member", { page: 1, limit: 20 })
    ).rejects.toThrow("Not a member of this conversation.");
  });

  it("rejects when conversation is in different household", async () => {
    mockConversationFindFirst.mockResolvedValue(null);

    await expect(
      listMessages(HH_ID_OTHER, CONV_ID, PROFILE_A, { page: 1, limit: 20 })
    ).rejects.toThrow("Conversation not found.");
  });

  it("uses relation filter to exclude messages deleted by requesting profile", async () => {
    mockConversationFindFirst.mockResolvedValue(makeConversation());
    mockConversationMemberFindFirst.mockResolvedValue(makeMember());

    mockMessageFindMany.mockResolvedValue([]);
    mockMessageCount.mockResolvedValue(0);

    await listMessages(HH_ID, CONV_ID, PROFILE_A, { page: 1, limit: 20 });

    // Verify the query uses Prisma relation filter to exclude deleted messages
    expect(mockMessageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          conversationId: CONV_ID,
          householdId: HH_ID,
          deletions: {
            none: {
              actorProfileId: PROFILE_A,
            },
          },
        }),
      })
    );
  });

  it("scopes deletion filter to the requesting profile only", async () => {
    mockConversationFindFirst.mockResolvedValue(makeConversation());
    mockConversationMemberFindFirst.mockResolvedValue(
      makeMember({ profileId: PROFILE_B })
    );

    mockMessageFindMany.mockResolvedValue([makeMessage()]);
    mockMessageCount.mockResolvedValue(1);

    const result = await listMessages(HH_ID, CONV_ID, PROFILE_B, {
      page: 1,
      limit: 20,
    });

    // Message should still be visible to profile B
    expect(result.data.length).toBe(1);
    // The deletion filter should be scoped to PROFILE_B only
    expect(mockMessageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletions: {
            none: {
              actorProfileId: PROFILE_B,
            },
          },
        }),
      })
    );
  });

  it("orders messages by createdAt ascending", async () => {
    mockConversationFindFirst.mockResolvedValue(makeConversation());
    mockConversationMemberFindFirst.mockResolvedValue(makeMember());
    mockMessageFindMany.mockResolvedValue([]);
    mockMessageCount.mockResolvedValue(0);

    await listMessages(HH_ID, CONV_ID, PROFILE_A, { page: 1, limit: 20 });

    expect(mockMessageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "asc" },
      })
    );
  });

  it("applies pagination offset correctly", async () => {
    mockConversationFindFirst.mockResolvedValue(makeConversation());
    mockConversationMemberFindFirst.mockResolvedValue(makeMember());
    mockMessageFindMany.mockResolvedValue([]);
    mockMessageCount.mockResolvedValue(50);

    await listMessages(HH_ID, CONV_ID, PROFILE_A, { page: 3, limit: 10 });

    expect(mockMessageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20, // (page 3 - 1) * limit 10
        take: 10,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// deleteMessage — for_me
// ---------------------------------------------------------------------------

describe("deleteMessage — for_me", () => {
  it("creates deletion record for actor only", async () => {
    mockMessageFindFirst.mockResolvedValue(
      makeMessage({ senderProfileId: PROFILE_B }) // Message sent by someone else
    );
    mockConversationMemberFindFirst.mockResolvedValue(makeMember());
    mockMessageDeletionUpsert.mockResolvedValue({});

    const result = await deleteMessage(HH_ID, PROFILE_A, MSG_ID, "for_me");

    expect(result).toEqual({ success: true, mode: "for_me" });
    expect(mockMessageDeletionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          messageId_actorProfileId: {
            messageId: MSG_ID,
            actorProfileId: PROFILE_A,
          },
        },
        create: expect.objectContaining({
          householdId: HH_ID,
          messageId: MSG_ID,
          actorKind: "profile",
          actorProfileId: PROFILE_A,
          deleteMode: "for_me",
        }),
      })
    );
  });

  it("does not modify the message text or content", async () => {
    mockMessageFindFirst.mockResolvedValue(makeMessage());
    mockConversationMemberFindFirst.mockResolvedValue(makeMember());
    mockMessageDeletionUpsert.mockResolvedValue({});

    await deleteMessage(HH_ID, PROFILE_A, MSG_ID, "for_me");

    // No transaction used for for_me
    expect(mockTransaction).not.toHaveBeenCalled();
    // Message update should not have been called
    expect(mockMessageUpdate).not.toHaveBeenCalled();
  });

  it("is idempotent (upsert with empty update)", async () => {
    mockMessageFindFirst.mockResolvedValue(makeMessage());
    mockConversationMemberFindFirst.mockResolvedValue(makeMember());
    mockMessageDeletionUpsert.mockResolvedValue({});

    await deleteMessage(HH_ID, PROFILE_A, MSG_ID, "for_me");

    expect(mockMessageDeletionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {},
      })
    );
  });

  it("allows any conversation member to delete-for-me (not just sender)", async () => {
    // Message sent by PROFILE_A, but PROFILE_B wants to hide it
    mockMessageFindFirst.mockResolvedValue(
      makeMessage({ senderProfileId: PROFILE_A })
    );
    mockConversationMemberFindFirst.mockResolvedValue(
      makeMember({ profileId: PROFILE_B })
    );
    mockMessageDeletionUpsert.mockResolvedValue({});

    const result = await deleteMessage(HH_ID, PROFILE_B, MSG_ID, "for_me");

    expect(result).toEqual({ success: true, mode: "for_me" });
  });
});

// ---------------------------------------------------------------------------
// deleteMessage — for_everyone
// ---------------------------------------------------------------------------

describe("deleteMessage — for_everyone", () => {
  it("allows sender to delete for everyone", async () => {
    mockMessageFindFirst.mockResolvedValue(
      makeMessage({ senderProfileId: PROFILE_A })
    );
    mockConversationMemberFindFirst.mockResolvedValue(makeMember());
    setupTransaction();
    mockMessageUpdate.mockResolvedValue({});
    mockMessageDeletionUpsert.mockResolvedValue({});

    const result = await deleteMessage(HH_ID, PROFILE_A, MSG_ID, "for_everyone");

    expect(result).toEqual({ success: true, mode: "for_everyone" });
    // Verify text is nulled and metadata.deleted set
    expect(mockMessageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MSG_ID },
        data: {
          text: null,
          metadata: { deleted: true },
        },
      })
    );
  });

  it("rejects non-sender with 403", async () => {
    // Message sent by PROFILE_A, PROFILE_B tries to delete for everyone
    mockMessageFindFirst.mockResolvedValue(
      makeMessage({ senderProfileId: PROFILE_A })
    );
    mockConversationMemberFindFirst.mockResolvedValue(
      makeMember({ profileId: PROFILE_B })
    );

    await expect(
      deleteMessage(HH_ID, PROFILE_B, MSG_ID, "for_everyone")
    ).rejects.toThrow("Only the sender can delete a message for everyone.");
  });

  it("nulls text and sets metadata.deleted in a transaction", async () => {
    mockMessageFindFirst.mockResolvedValue(
      makeMessage({ senderProfileId: PROFILE_A })
    );
    mockConversationMemberFindFirst.mockResolvedValue(makeMember());
    setupTransaction();
    mockMessageUpdate.mockResolvedValue({});
    mockMessageDeletionUpsert.mockResolvedValue({});

    await deleteMessage(HH_ID, PROFILE_A, MSG_ID, "for_everyone");

    expect(mockTransaction).toHaveBeenCalled();
    expect(mockMessageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { text: null, metadata: { deleted: true } },
      })
    );
    expect(mockMessageDeletionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          deleteMode: "for_everyone",
        }),
        update: expect.objectContaining({
          deleteMode: "for_everyone",
        }),
      })
    );
  });

  it("rejects when message is in different household", async () => {
    mockMessageFindFirst.mockResolvedValue(null); // Not found in this household

    await expect(
      deleteMessage(HH_ID_OTHER, PROFILE_A, MSG_ID, "for_everyone")
    ).rejects.toThrow("Message not found.");
  });
});

// ---------------------------------------------------------------------------
// Membership enforcement
// ---------------------------------------------------------------------------

describe("membership enforcement", () => {
  it("blocks send when profile has left the conversation", async () => {
    mockConversationFindFirst.mockResolvedValue(makeConversation());
    // leftAt is set — member no longer active
    mockConversationMemberFindFirst.mockResolvedValue(null);

    await expect(
      sendMessage(HH_ID, PROFILE_A, {
        conversationId: CONV_ID,
        type: "text",
        text: "I left but trying to send",
      })
    ).rejects.toThrow("Not a member of this conversation.");
  });

  it("blocks list when profile has left the conversation", async () => {
    mockConversationFindFirst.mockResolvedValue(makeConversation());
    mockConversationMemberFindFirst.mockResolvedValue(null);

    await expect(
      listMessages(HH_ID, CONV_ID, PROFILE_A, { page: 1, limit: 20 })
    ).rejects.toThrow("Not a member of this conversation.");
  });

  it("blocks delete when profile has left the conversation", async () => {
    mockMessageFindFirst.mockResolvedValue(makeMessage());
    mockConversationMemberFindFirst.mockResolvedValue(null);

    await expect(
      deleteMessage(HH_ID, PROFILE_A, MSG_ID, "for_me")
    ).rejects.toThrow("Not a member of this conversation.");
  });
});

// ---------------------------------------------------------------------------
// Tenant isolation
// ---------------------------------------------------------------------------

describe("tenant isolation", () => {
  it("cannot send to conversation in another household", async () => {
    // Conversation exists in HH_ID but we pass HH_ID_OTHER
    mockConversationFindFirst.mockResolvedValue(null);

    await expect(
      sendMessage(HH_ID_OTHER, PROFILE_A, {
        conversationId: CONV_ID,
        type: "text",
        text: "Cross-household",
      })
    ).rejects.toThrow("Conversation not found.");
  });

  it("cannot list messages from conversation in another household", async () => {
    mockConversationFindFirst.mockResolvedValue(null);

    await expect(
      listMessages(HH_ID_OTHER, CONV_ID, PROFILE_A, { page: 1, limit: 20 })
    ).rejects.toThrow("Conversation not found.");
  });

  it("cannot delete message from another household", async () => {
    mockMessageFindFirst.mockResolvedValue(null);

    await expect(
      deleteMessage(HH_ID_OTHER, PROFILE_A, MSG_ID, "for_me")
    ).rejects.toThrow("Message not found.");
  });
});
