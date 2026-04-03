import { describe, it, expect } from "vitest";
import {
  rejectExpenseSchema,
  EXPENSE_REJECTION_REASONS,
} from "../modules/expenses/validators";

// ---------------------------------------------------------------------------
// Rejection Reason Validation
// ---------------------------------------------------------------------------

describe("rejectExpenseSchema", () => {
  describe("valid reasons", () => {
    for (const reason of EXPENSE_REJECTION_REASONS) {
      if (reason === "other") continue; // tested separately
      it(`accepts reason '${reason}'`, () => {
        const result = rejectExpenseSchema.safeParse({ reason });
        expect(result.success).toBe(true);
      });
    }

    it("accepts 'other' with non-empty detail", () => {
      const result = rejectExpenseSchema.safeParse({
        reason: "other",
        detail: "Custom explanation",
      });
      expect(result.success).toBe(true);
    });

    it("accepts a reason with optional detail", () => {
      const result = rejectExpenseSchema.safeParse({
        reason: "not_in_budget",
        detail: "We already spent the monthly budget",
      });
      expect(result.success).toBe(true);
    });

    it("accepts a reason with null detail", () => {
      const result = rejectExpenseSchema.safeParse({
        reason: "need_to_discuss",
        detail: null,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("invalid reasons", () => {
    it("rejects unknown reason", () => {
      const result = rejectExpenseSchema.safeParse({
        reason: "because_i_said_so",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty reason", () => {
      const result = rejectExpenseSchema.safeParse({ reason: "" });
      expect(result.success).toBe(false);
    });

    it("rejects missing reason", () => {
      const result = rejectExpenseSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("'other' reason detail requirement", () => {
    it("rejects 'other' without detail", () => {
      const result = rejectExpenseSchema.safeParse({ reason: "other" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          'detail is required when reason is "other"'
        );
      }
    });

    it("rejects 'other' with empty string detail", () => {
      const result = rejectExpenseSchema.safeParse({
        reason: "other",
        detail: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects 'other' with whitespace-only detail", () => {
      const result = rejectExpenseSchema.safeParse({
        reason: "other",
        detail: "   ",
      });
      expect(result.success).toBe(false);
    });

    it("rejects 'other' with null detail", () => {
      const result = rejectExpenseSchema.safeParse({
        reason: "other",
        detail: null,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("detail length limit", () => {
    it("rejects detail exceeding 1000 characters", () => {
      const result = rejectExpenseSchema.safeParse({
        reason: "not_in_budget",
        detail: "x".repeat(1001),
      });
      expect(result.success).toBe(false);
    });

    it("accepts detail at exactly 1000 characters", () => {
      const result = rejectExpenseSchema.safeParse({
        reason: "not_in_budget",
        detail: "x".repeat(1000),
      });
      expect(result.success).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Rejection Reason Constants
// ---------------------------------------------------------------------------

describe("EXPENSE_REJECTION_REASONS", () => {
  it("contains all expected general decline reasons", () => {
    expect(EXPENSE_REJECTION_REASONS).toContain("not_in_budget");
    expect(EXPENSE_REJECTION_REASONS).toContain("need_to_discuss");
    expect(EXPENSE_REJECTION_REASONS).toContain("wrong_amount");
    expect(EXPENSE_REJECTION_REASONS).toContain("other");
  });

  it("contains all expected backdate-specific decline reasons", () => {
    expect(EXPENSE_REJECTION_REASONS).toContain("expense_too_old_to_verify");
    expect(EXPENSE_REJECTION_REASONS).toContain("no_record");
    expect(EXPENSE_REJECTION_REASONS).toContain("already_settled_informally");
    expect(EXPENSE_REJECTION_REASONS).toContain("incorrect_amount");
  });

  it("has exactly 8 reasons", () => {
    expect(EXPENSE_REJECTION_REASONS).toHaveLength(8);
  });
});
