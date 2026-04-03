import { describe, it, expect } from "vitest";
import {
  createExpenseSchema,
  updateExpenseSchema,
  listExpensesQuerySchema,
} from "../modules/expenses/validators";

const validBase = {
  description: "School supplies",
  amount: 45.99,
  paidBy: "owner" as const,
  date: "2026-04-01",
  childScope: "both" as const,
  categoryId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
};

describe("createExpenseSchema — Phase 4B fields", () => {
  it("defaults reimbursable=false, reimbursedAmt=0, reimbursementStatus=none", () => {
    const result = createExpenseSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reimbursable).toBe(false);
      expect(result.data.reimbursedAmt).toBe(0);
      expect(result.data.reimbursementStatus).toBe("none");
    }
  });

  it("splitPct is optional (undefined triggers settings resolution)", () => {
    const result = createExpenseSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.splitPct).toBeUndefined();
    }
  });

  it("accepts explicit splitPct as custom", () => {
    const result = createExpenseSchema.safeParse({ ...validBase, splitPct: 70 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.splitPct).toBe(70);
    }
  });

  it("accepts reimbursable expense", () => {
    const result = createExpenseSchema.safeParse({
      ...validBase,
      reimbursable: true,
      reimbursedAmt: 10,
      reimbursementStatus: "partial",
    });
    expect(result.success).toBe(true);
  });

  it("rejects reimbursedAmt > amount", () => {
    const result = createExpenseSchema.safeParse({
      ...validBase,
      reimbursedAmt: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects reimbursedAmt > 0 when status=none", () => {
    const result = createExpenseSchema.safeParse({
      ...validBase,
      reimbursedAmt: 10,
      reimbursementStatus: "none",
    });
    expect(result.success).toBe(false);
  });

  it("rejects reimbursedAmt=0 when status=partial", () => {
    const result = createExpenseSchema.safeParse({
      ...validBase,
      reimbursedAmt: 0,
      reimbursementStatus: "partial",
    });
    expect(result.success).toBe(false);
  });

  it("rejects reimbursedAmt=0 when status=fully_received", () => {
    const result = createExpenseSchema.safeParse({
      ...validBase,
      reimbursedAmt: 0,
      reimbursementStatus: "fully_received",
    });
    expect(result.success).toBe(false);
  });

  it("accepts awaiting_reimb with reimbursedAmt=0", () => {
    const result = createExpenseSchema.safeParse({
      ...validBase,
      reimbursable: true,
      reimbursedAmt: 0,
      reimbursementStatus: "awaiting_reimb",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid reimbursementStatus", () => {
    const result = createExpenseSchema.safeParse({
      ...validBase,
      reimbursementStatus: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative reimbursedAmt", () => {
    const result = createExpenseSchema.safeParse({
      ...validBase,
      reimbursedAmt: -5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects splitPct > 100", () => {
    const result = createExpenseSchema.safeParse({
      ...validBase,
      splitPct: 101,
    });
    expect(result.success).toBe(false);
  });

  it("rejects splitPct < 0", () => {
    const result = createExpenseSchema.safeParse({
      ...validBase,
      splitPct: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("updateExpenseSchema — Phase 4B fields", () => {
  it("accepts partial reimbursement update", () => {
    const result = updateExpenseSchema.safeParse({
      reimbursedAmt: 20,
      reimbursementStatus: "partial",
    });
    expect(result.success).toBe(true);
  });

  it("rejects reimbursedAmt > amount when both present", () => {
    const result = updateExpenseSchema.safeParse({
      amount: 50,
      reimbursedAmt: 100,
    });
    expect(result.success).toBe(false);
  });

  it("accepts reimbursedAmt alone (cross-field check deferred to service)", () => {
    // When only reimbursedAmt is sent without amount, validator allows it
    // Service layer checks against existing amount
    const result = updateExpenseSchema.safeParse({
      reimbursedAmt: 30,
      reimbursementStatus: "partial",
    });
    expect(result.success).toBe(true);
  });

  it("rejects status=none with reimbursedAmt>0", () => {
    const result = updateExpenseSchema.safeParse({
      reimbursedAmt: 10,
      reimbursementStatus: "none",
    });
    expect(result.success).toBe(false);
  });
});

describe("listExpensesQuerySchema — includeDerived", () => {
  it("defaults includeDerived to false", () => {
    const result = listExpensesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.includeDerived).toBe(false);
    }
  });

  it("parses includeDerived=true from query string", () => {
    const result = listExpensesQuerySchema.safeParse({ includeDerived: "true" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.includeDerived).toBe(true);
    }
  });
});
