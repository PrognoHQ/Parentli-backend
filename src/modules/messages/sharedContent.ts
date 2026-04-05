import { AppError } from "../../types";

interface SharedContentInput {
  contentType: "expense" | "event" | "note";
  expenseId?: string;
  eventId?: string;
  noteId?: string;
}

/**
 * Validate and create a MessageSharedContent record inside a transaction.
 *
 * Rules:
 * - Exactly one content reference must be set, matching contentType
 * - Referenced entity must exist in the same household and not be deleted
 */
export async function validateAndCreateSharedContent(
  tx: any,
  householdId: string,
  messageId: string,
  input: SharedContentInput
) {
  const { contentType, expenseId, eventId, noteId } = input;

  // Validate exactly one reference matches contentType
  if (contentType === "expense") {
    if (!expenseId) {
      throw new AppError("expenseId is required for expense shared content.", 400);
    }
    if (eventId || noteId) {
      throw new AppError("Only expenseId should be set for expense shared content.", 400);
    }

    const expense = await tx.expense.findFirst({
      where: { id: expenseId, householdId, deletedAt: null },
    });
    if (!expense) {
      throw new AppError("Expense not found in this household.", 404);
    }

    return tx.messageSharedContent.create({
      data: {
        householdId,
        messageId,
        contentType: "expense",
        expenseId,
      },
    });
  }

  if (contentType === "event") {
    if (!eventId) {
      throw new AppError("eventId is required for event shared content.", 400);
    }
    if (expenseId || noteId) {
      throw new AppError("Only eventId should be set for event shared content.", 400);
    }

    const event = await tx.event.findFirst({
      where: { id: eventId, householdId, isDeleted: false },
    });
    if (!event) {
      throw new AppError("Event not found in this household.", 404);
    }

    return tx.messageSharedContent.create({
      data: {
        householdId,
        messageId,
        contentType: "event",
        eventId,
      },
    });
  }

  if (contentType === "note") {
    if (!noteId) {
      throw new AppError("noteId is required for note shared content.", 400);
    }
    if (expenseId || eventId) {
      throw new AppError("Only noteId should be set for note shared content.", 400);
    }

    const note = await tx.note.findFirst({
      where: { id: noteId, householdId, deletedAt: null },
    });
    if (!note) {
      throw new AppError("Note not found in this household.", 404);
    }

    return tx.messageSharedContent.create({
      data: {
        householdId,
        messageId,
        contentType: "note",
        noteId,
      },
    });
  }

  throw new AppError("Invalid shared content type.", 400);
}
