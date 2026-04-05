import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockMessageFindFirst = vi.fn();
const mockConversationMemberFindFirst = vi.fn();
const mockReactionCreate = vi.fn();
const mockReactionDeleteMany = vi.fn();

vi.mock("../lib/prisma", () => ({
  prisma: {
    message: {
      findFirst: (...args: unknown[]) => mockMessageFindFirst(...args),
    },
    conversationMember: {
      findFirst: (...args: unknown[]) => mockConversationMemberFindFirst(...args),
    },
    messageReaction: {
      create: (...args: unknown[]) => mockReactionCreate(...args),
      deleteMany: (...args: unknown[]) => mockReactionDeleteMany(...args),
    },
  },
}));

import { addReaction, removeReaction } from "../modules/messages/reactions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HH_ID = "hh-111";
const HH_ID_OTHER = "hh-999";
const PROFILE_A = "profile-aaa";
const PROFILE_B = "profile-bbb";
const CONV_ID = "conv-111";
const MSG_ID = "msg-111";

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: MSG_ID,
    householdId: HH_ID,
    conversationId: CONV_ID,
    senderKind: "profile",
    senderProfileId: PROFILE_A,
    type: "text",
    text: "Hello",
    metadata: {},
    createdAt: new Date("2026-01-01T10:00:00Z"),
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

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// addReaction
// ---------------------------------------------------------------------------

describe("addReaction", () => {
  it("adds a reaction when actor is a valid member", async () => {
    mockMessageFindFirst.mockResolvedValue(makeMessage());
    mockConversationMemberFindFirst.mockResolvedValue(makeMember());

    const created = {
      id: "reaction-1",
      emoji: "👍",
      actorKind: "profile",
      actorProfileId: PROFILE_A,
      actorFamilyCircleMemberId: null,
      createdAt: new Date(),
    };
    mockReactionCreate.mockResolvedValue(created);

    const result = await addReaction(HH_ID, PROFILE_A, MSG_ID, "👍");

    expect(result).toEqual(created);
    expect(mockReactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          householdId: HH_ID,
          messageId: MSG_ID,
          actorKind: "profile",
          actorProfileId: PROFILE_A,
          emoji: "👍",
        }),
      })
    );
  });

  it("rejects with 404 when message not found", async () => {
    mockMessageFindFirst.mockResolvedValue(null);

    await expect(
      addReaction(HH_ID, PROFILE_A, MSG_ID, "👍")
    ).rejects.toThrow("Message not found.");
  });

  it("rejects with 404 when message is in different household", async () => {
    mockMessageFindFirst.mockResolvedValue(null);

    await expect(
      addReaction(HH_ID_OTHER, PROFILE_A, MSG_ID, "👍")
    ).rejects.toThrow("Message not found.");
  });

  it("rejects with 403 when actor is not a member", async () => {
    mockMessageFindFirst.mockResolvedValue(makeMessage());
    mockConversationMemberFindFirst.mockResolvedValue(null);

    await expect(
      addReaction(HH_ID, PROFILE_B, MSG_ID, "👍")
    ).rejects.toThrow("Not a member of this conversation.");
  });

  it("rejects with 400 when message is globally deleted", async () => {
    mockMessageFindFirst.mockResolvedValue(
      makeMessage({ metadata: { deleted: true }, text: null })
    );
    mockConversationMemberFindFirst.mockResolvedValue(makeMember());

    await expect(
      addReaction(HH_ID, PROFILE_A, MSG_ID, "👍")
    ).rejects.toThrow("Cannot react to a deleted message.");
  });

  it("rejects with 409 on duplicate reaction (P2002)", async () => {
    mockMessageFindFirst.mockResolvedValue(makeMessage());
    mockConversationMemberFindFirst.mockResolvedValue(makeMember());

    const error = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "6.0.0", meta: {} }
    );
    mockReactionCreate.mockRejectedValue(error);

    await expect(
      addReaction(HH_ID, PROFILE_A, MSG_ID, "👍")
    ).rejects.toThrow("You have already reacted with this emoji.");
  });
});

// ---------------------------------------------------------------------------
// removeReaction
// ---------------------------------------------------------------------------

describe("removeReaction", () => {
  it("removes an existing reaction", async () => {
    mockMessageFindFirst.mockResolvedValue(makeMessage());
    mockConversationMemberFindFirst.mockResolvedValue(makeMember());
    mockReactionDeleteMany.mockResolvedValue({ count: 1 });

    const result = await removeReaction(HH_ID, PROFILE_A, MSG_ID, "👍");

    expect(result).toEqual({ success: true });
    expect(mockReactionDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          messageId: MSG_ID,
          actorKind: "profile",
          actorProfileId: PROFILE_A,
          emoji: "👍",
        }),
      })
    );
  });

  it("rejects with 404 when reaction does not exist", async () => {
    mockMessageFindFirst.mockResolvedValue(makeMessage());
    mockConversationMemberFindFirst.mockResolvedValue(makeMember());
    mockReactionDeleteMany.mockResolvedValue({ count: 0 });

    await expect(
      removeReaction(HH_ID, PROFILE_A, MSG_ID, "👍")
    ).rejects.toThrow("Reaction not found.");
  });

  it("rejects with 404 when message not found", async () => {
    mockMessageFindFirst.mockResolvedValue(null);

    await expect(
      removeReaction(HH_ID, PROFILE_A, MSG_ID, "👍")
    ).rejects.toThrow("Message not found.");
  });

  it("rejects with 403 when actor is not a member", async () => {
    mockMessageFindFirst.mockResolvedValue(makeMessage());
    mockConversationMemberFindFirst.mockResolvedValue(null);

    await expect(
      removeReaction(HH_ID, PROFILE_B, MSG_ID, "👍")
    ).rejects.toThrow("Not a member of this conversation.");
  });
});
