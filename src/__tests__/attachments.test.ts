import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock transaction object
// ---------------------------------------------------------------------------

const mockCreateMany = vi.fn();

const tx = {
  messageAttachment: { createMany: mockCreateMany },
};

import { validateAndCreateAttachments } from "../modules/messages/attachments";

const HH_ID = "hh-111";
const MSG_ID = "msg-111";

function makeAttachment(overrides: Record<string, unknown> = {}) {
  return {
    fileName: "photo.jpg",
    fileType: "image",
    fileSize: 1024,
    fileUrl: "https://storage.example.com/photo.jpg",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateMany.mockResolvedValue({ count: 1 });
});

// ---------------------------------------------------------------------------
// Successful cases
// ---------------------------------------------------------------------------

describe("validateAndCreateAttachments — success", () => {
  it("creates attachments for valid input", async () => {
    const attachments = [makeAttachment()];

    const result = await validateAndCreateAttachments(
      tx,
      HH_ID,
      MSG_ID,
      attachments
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      householdId: HH_ID,
      messageId: MSG_ID,
      fileName: "photo.jpg",
      fileType: "image",
      fileSize: 1024,
    });
    expect(mockCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          householdId: HH_ID,
          messageId: MSG_ID,
        }),
      ]),
    });
  });

  it("creates multiple attachments (up to 5)", async () => {
    const attachments = Array.from({ length: 5 }, (_, i) =>
      makeAttachment({ fileName: `file${i}.jpg` })
    );

    const result = await validateAndCreateAttachments(
      tx,
      HH_ID,
      MSG_ID,
      attachments
    );

    expect(result).toHaveLength(5);
  });

  it("returns empty array for empty input", async () => {
    const result = await validateAndCreateAttachments(tx, HH_ID, MSG_ID, []);

    expect(result).toEqual([]);
    expect(mockCreateMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Validation failures
// ---------------------------------------------------------------------------

describe("validateAndCreateAttachments — validation", () => {
  it("rejects more than 5 attachments", async () => {
    const attachments = Array.from({ length: 6 }, (_, i) =>
      makeAttachment({ fileName: `file${i}.jpg` })
    );

    await expect(
      validateAndCreateAttachments(tx, HH_ID, MSG_ID, attachments)
    ).rejects.toThrow("Maximum 5 attachments allowed per message.");
  });

  it("rejects attachment exceeding 10 MB", async () => {
    const attachments = [makeAttachment({ fileSize: 10_485_761 })];

    await expect(
      validateAndCreateAttachments(tx, HH_ID, MSG_ID, attachments)
    ).rejects.toThrow('Attachment "photo.jpg" exceeds maximum file size of 10 MB.');
  });

  it("accepts attachment at exactly 10 MB", async () => {
    const attachments = [makeAttachment({ fileSize: 10_485_760 })];

    const result = await validateAndCreateAttachments(
      tx,
      HH_ID,
      MSG_ID,
      attachments
    );

    expect(result).toHaveLength(1);
  });
});
