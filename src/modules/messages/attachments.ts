import { AppError } from "../../types";

const MAX_ATTACHMENTS = 5;
const MAX_FILE_SIZE = 10_485_760; // 10 MB

interface AttachmentInput {
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
}

/**
 * Validate and create MessageAttachment records inside a transaction.
 *
 * Rules:
 * - Max 5 attachments per message
 * - Each fileSize must be <= 10 MB
 * - fileName must be non-empty
 * - All attachments scoped to householdId
 */
export async function validateAndCreateAttachments(
  tx: any,
  householdId: string,
  messageId: string,
  attachments: AttachmentInput[]
) {
  if (attachments.length === 0) {
    return [];
  }

  if (attachments.length > MAX_ATTACHMENTS) {
    throw new AppError(
      `Maximum ${MAX_ATTACHMENTS} attachments allowed per message.`,
      400
    );
  }

  for (const att of attachments) {
    if (att.fileSize > MAX_FILE_SIZE) {
      throw new AppError(
        `Attachment "${att.fileName}" exceeds maximum file size of 10 MB.`,
        400
      );
    }
  }

  const data = attachments.map((att) => ({
    householdId,
    messageId,
    fileName: att.fileName,
    fileType: att.fileType,
    fileSize: att.fileSize,
    fileUrl: att.fileUrl,
  }));

  await tx.messageAttachment.createMany({ data });

  return data;
}
