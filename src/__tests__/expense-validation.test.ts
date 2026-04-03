import { describe, it, expect } from "vitest";
import {
  createExpenseSchema,
  updateExpenseSchema,
  listExpensesQuerySchema,
} from "../modules/expenses/validators";

const validInput = {
  description: "School supplies",
  amount: 45.99,
  paidBy: "owner" as const,
  date: "2026-04-01",
  childScope: "both" as const,
  categoryId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  splitPct: 50,
};

describe("createExpenseSchema", () => {
  it("accepts valid full input", () => {
    const result = createExpenseSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("accepts valid input with single child scope", () => {
    const result = createExpenseSchema.safeParse({
      ...validInput,
      childScope: "single",
      primaryChildId: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid input with notes", () => {
    const result = createExpenseSchema.safeParse({
      ...validInput,
      notes: "Extra supplies for art class",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null notes", () => {
    const result = createExpenseSchema.safeParse({
      ...validInput,
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  it("defaults status to draft", () => {
    const result = createExpenseSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("draft");
    }
  });

  it("splitPct is optional (undefined means resolve from settings)", () => {
    const { splitPct, ...noSplit } = validInput;
    const result = createExpenseSchema.safeParse(noSplit);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.splitPct).toBeUndefined();
    }
  });

  it("accepts awaiting status", () => {
    const result = createExpenseSchema.safeParse({
      ...validInput,
      status: "awaiting",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing description", () => {
    const { description, ...rest } = validInput;
    const result = createExpenseSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects empty description", () => {
    const result = createExpenseSchema.safeParse({
      ...validInput,
      description: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing amount", () => {
    const { amount, ...rest } = validInput;
    const result = createExpenseSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects zero amount", () => {
    const result = createExpenseSchema.safeParse({
      ...validInput,
      amount: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative amount", () => {
    const result = createExpenseSchema.safeParse({
      ...validInput,
      amount: -10,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing date", () => {
    const { date, ...rest } = validInput;
    const result = createExpenseSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = createExpenseSchema.safeParse({
      ...validInput,
      date: "04/01/2026",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing categoryId", () => {
    const { categoryId, ...rest } = validInput;
    const result = createExpenseSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects invalid categoryId format", () => {
    const result = createExpenseSchema.safeParse({
      ...validInput,
      categoryId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects splitPct below 0", () => {
    const result = createExpenseSchema.safeParse({
      ...validInput,
      splitPct: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects splitPct above 100", () => {
    const result = createExpenseSchema.safeParse({
      ...validInput,
      splitPct: 101,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer splitPct", () => {
    const result = createExpenseSchema.safeParse({
      ...validInput,
      splitPct: 50.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects childScope=single without primaryChildId", () => {
    const result = createExpenseSchema.safeParse({
      ...validInput,
      childScope: "single",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid paidBy value", () => {
    const result = createExpenseSchema.safeParse({
      ...validInput,
      paidBy: "stranger",
    });
    expect(result.success).toBe(false);
  });

  it("rejects approved status on create", () => {
    const result = createExpenseSchema.safeParse({
      ...validInput,
      status: "approved",
    });
    expect(result.success).toBe(false);
  });

  it("rejects settled status on create", () => {
    const result = createExpenseSchema.safeParse({
      ...validInput,
      status: "settled",
    });
    expect(result.success).toBe(false);
  });

  it("rejects rejected status on create", () => {
    const result = createExpenseSchema.safeParse({
      ...validInput,
      status: "rejected",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateExpenseSchema", () => {
  it("accepts partial update with just description", () => {
    const result = updateExpenseSchema.safeParse({
      description: "Updated supplies",
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with just amount", () => {
    const result = updateExpenseSchema.safeParse({ amount: 99.99 });
    expect(result.success).toBe(true);
  });

  it("accepts empty object (no changes)", () => {
    const result = updateExpenseSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects negative amount on update", () => {
    const result = updateExpenseSchema.safeParse({ amount: -5 });
    expect(result.success).toBe(false);
  });

  it("rejects splitPct above 100 on update", () => {
    const result = updateExpenseSchema.safeParse({ splitPct: 200 });
    expect(result.success).toBe(false);
  });

  it("rejects childScope=single without primaryChildId on update", () => {
    const result = updateExpenseSchema.safeParse({
      childScope: "single",
    });
    expect(result.success).toBe(false);
  });

  it("accepts childScope=single with primaryChildId on update", () => {
    const result = updateExpenseSchema.safeParse({
      childScope: "single",
      primaryChildId: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    });
    expect(result.success).toBe(true);
  });
});

describe("listExpensesQuerySchema", () => {
  it("accepts empty query (uses defaults)", () => {
    const result = listExpensesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it("coerces string page to number", () => {
    const result = listExpensesQuerySchema.safeParse({ page: "3" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
    }
  });

  it("coerces string limit to number", () => {
    const result = listExpensesQuerySchema.safeParse({ limit: "50" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it("accepts status filter", () => {
    const result = listExpensesQuerySchema.safeParse({ status: "draft" });
    expect(result.success).toBe(true);
  });

  it("accepts all status values", () => {
    for (const status of [
      "draft",
      "awaiting",
      "approved",
      "rejected",
      "settled",
    ]) {
      const result = listExpensesQuerySchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid status", () => {
    const result = listExpensesQuerySchema.safeParse({ status: "unknown" });
    expect(result.success).toBe(false);
  });

  it("rejects limit above 100", () => {
    const result = listExpensesQuerySchema.safeParse({ limit: "101" });
    expect(result.success).toBe(false);
  });

  it("rejects page below 1", () => {
    const result = listExpensesQuerySchema.safeParse({ page: "0" });
    expect(result.success).toBe(false);
  });

  it("accepts date range filters", () => {
    const result = listExpensesQuerySchema.safeParse({
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    expect(result.success).toBe(true);
  });

  it("accepts categoryId filter", () => {
    const result = listExpensesQuerySchema.safeParse({
      categoryId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    });
    expect(result.success).toBe(true);
  });
});
