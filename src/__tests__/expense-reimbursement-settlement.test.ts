import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import {
  updateReimbursementSchema,
  settleExpenseSchema,
  updateSettlementSchema,
} from "../modules/expenses/validators";
import {
  hasParentCapability,
  hasFamilyCircleCapability,
} from "../lib/permissions";

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockExpenseFindFirst = vi.fn();
const mockProfileFindUnique = vi.fn();
const mockExpenseUpdateMany = vi.fn();
const mockExpenseTimelineEntryCreate = vi.fn();
const mockExpenseFindUniqueOrThrow = vi.fn();
const mockTransaction = vi.fn();

vi.mock("../lib/prisma", () => ({
  prisma: {
    expense: {
      findFirst: (...args: unknown[]) => mockExpenseFindFirst(...args),
    },
    profile: {
      findUnique: (...args: unknown[]) => mockProfileFindUnique(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

// Import workflow after mock setup
import {
  updateReimbursement,
  settleExpense,
  updateSettlement,
  normalizeReimbursementState,
} from "../modules/expenses/workflow";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HOUSEHOLD_ID = "hh-111";
const EXPENSE_ID = "exp-222";
const ACTOR_PROFILE_ID = "profile-actor";

function makeApprovedExpense(overrides: Record<string, unknown> = {}) {
  return {
    id: EXPENSE_ID,
    householdId: HOUSEHOLD_ID,
    createdByProfileId: "profile-creator",
    status: "approved",
    amount: new Prisma.Decimal("100.00"),
    reimbursable: false,
    reimbursedAmt: new Prisma.Decimal("0"),
    reimbursementStatus: "none",
    reimbursementSource: null,
    reimbursedAmtExpected: null,
    settlementMethod: null,
    settlementDate: null,
    settlementNote: null,
    settledByProfileId: null,
    settledAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function makeSettledExpense(overrides: Record<string, unknown> = {}) {
  return makeApprovedExpense({
    status: "settled",
    settlementMethod: "venmo",
    settlementDate: new Date("2026-04-01"),
    settlementNote: "Paid via Venmo",
    settledByProfileId: ACTOR_PROFILE_ID,
    settledAt: new Date(),
    ...overrides,
  });
}

function setupTransaction() {
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      expense: {
        updateMany: mockExpenseUpdateMany,
        findUniqueOrThrow: mockExpenseFindUniqueOrThrow,
      },
      expenseTimelineEntry: {
        create: mockExpenseTimelineEntryCreate,
      },
    };
    return cb(tx);
  });
}

// ---------------------------------------------------------------------------
// normalizeReimbursementState (pure function)
// ---------------------------------------------------------------------------

describe("normalizeReimbursementState", () => {
  const amount = new Prisma.Decimal("100.00");

  it("accepts none with reimbursedAmt=0", () => {
    expect(() =>
      normalizeReimbursementState({
        reimbursementStatus: "none",
        reimbursedAmt: 0,
        expenseAmount: amount,
      })
    ).not.toThrow();
  });

  it("rejects none with reimbursedAmt>0", () => {
    expect(() =>
      normalizeReimbursementState({
        reimbursementStatus: "none",
        reimbursedAmt: 50,
        expenseAmount: amount,
      })
    ).toThrow(/reimbursedAmt must be 0/);
  });

  it("rejects awaiting_reimb with reimbursedAmt>0", () => {
    expect(() =>
      normalizeReimbursementState({
        reimbursementStatus: "awaiting_reimb",
        reimbursedAmt: 10,
        expenseAmount: amount,
      })
    ).toThrow(/reimbursedAmt must be 0/);
  });

  it("accepts awaiting_reimb with reimbursedAmt=0", () => {
    expect(() =>
      normalizeReimbursementState({
        reimbursementStatus: "awaiting_reimb",
        reimbursedAmt: 0,
        expenseAmount: amount,
      })
    ).not.toThrow();
  });

  it("accepts partial with 0 < reimbursedAmt < amount", () => {
    expect(() =>
      normalizeReimbursementState({
        reimbursementStatus: "partial",
        reimbursedAmt: 50,
        expenseAmount: amount,
      })
    ).not.toThrow();
  });

  it("rejects partial with reimbursedAmt=0", () => {
    expect(() =>
      normalizeReimbursementState({
        reimbursementStatus: "partial",
        reimbursedAmt: 0,
        expenseAmount: amount,
      })
    ).toThrow(/must be greater than 0/);
  });

  it("rejects partial with reimbursedAmt >= amount", () => {
    expect(() =>
      normalizeReimbursementState({
        reimbursementStatus: "partial",
        reimbursedAmt: 100,
        expenseAmount: amount,
      })
    ).toThrow(/must be less than expense amount/);
  });

  it("accepts fully_received with reimbursedAmt>0", () => {
    expect(() =>
      normalizeReimbursementState({
        reimbursementStatus: "fully_received",
        reimbursedAmt: 100,
        expenseAmount: amount,
      })
    ).not.toThrow();
  });

  it("rejects fully_received with reimbursedAmt=0", () => {
    expect(() =>
      normalizeReimbursementState({
        reimbursementStatus: "fully_received",
        reimbursedAmt: 0,
        expenseAmount: amount,
      })
    ).toThrow(/must be greater than 0/);
  });

  it("rejects reimbursedAmt > expense amount", () => {
    expect(() =>
      normalizeReimbursementState({
        reimbursementStatus: "fully_received",
        reimbursedAmt: 150,
        expenseAmount: amount,
      })
    ).toThrow(/cannot exceed expense amount/);
  });
});

// ---------------------------------------------------------------------------
// updateReimbursement workflow
// ---------------------------------------------------------------------------

describe("updateReimbursement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTransaction();
  });

  it("updates reimbursement on approved expense", async () => {
    const expense = makeApprovedExpense();
    const updatedExpense = { ...expense, reimbursementStatus: "awaiting_reimb" };

    mockExpenseFindFirst.mockResolvedValue(expense);
    mockProfileFindUnique.mockResolvedValue({ firstName: "Jane" });
    mockExpenseUpdateMany.mockResolvedValue({ count: 1 });
    mockExpenseTimelineEntryCreate.mockResolvedValue({});
    mockExpenseFindUniqueOrThrow.mockResolvedValue(updatedExpense);

    const result = await updateReimbursement(EXPENSE_ID, HOUSEHOLD_ID, ACTOR_PROFILE_ID, {
      reimbursementStatus: "awaiting_reimb",
      reimbursedAmt: 0,
    });

    expect(result.reimbursementStatus).toBe("awaiting_reimb");
    expect(mockExpenseUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EXPENSE_ID, status: "approved" },
      })
    );
  });

  it("updates reimbursement on settled expense", async () => {
    const expense = makeSettledExpense();
    mockExpenseFindFirst.mockResolvedValue(expense);
    mockProfileFindUnique.mockResolvedValue({ firstName: "Jane" });
    mockExpenseUpdateMany.mockResolvedValue({ count: 1 });
    mockExpenseTimelineEntryCreate.mockResolvedValue({});
    mockExpenseFindUniqueOrThrow.mockResolvedValue({
      ...expense,
      reimbursementStatus: "fully_received",
    });

    await updateReimbursement(EXPENSE_ID, HOUSEHOLD_ID, ACTOR_PROFILE_ID, {
      reimbursementStatus: "fully_received",
      reimbursedAmt: 80,
    });

    expect(mockExpenseUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EXPENSE_ID, status: "settled" },
      })
    );
  });

  it("rejects reimbursement update on draft expense", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeApprovedExpense({ status: "draft" }));

    await expect(
      updateReimbursement(EXPENSE_ID, HOUSEHOLD_ID, ACTOR_PROFILE_ID, {
        reimbursementStatus: "awaiting_reimb",
        reimbursedAmt: 0,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects reimbursement update on awaiting expense", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeApprovedExpense({ status: "awaiting" }));

    await expect(
      updateReimbursement(EXPENSE_ID, HOUSEHOLD_ID, ACTOR_PROFILE_ID, {
        reimbursementStatus: "awaiting_reimb",
        reimbursedAmt: 0,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects reimbursement update on rejected expense", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeApprovedExpense({ status: "rejected" }));

    await expect(
      updateReimbursement(EXPENSE_ID, HOUSEHOLD_ID, ACTOR_PROFILE_ID, {
        reimbursementStatus: "awaiting_reimb",
        reimbursedAmt: 0,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects when expense not found", async () => {
    mockExpenseFindFirst.mockResolvedValue(null);

    await expect(
      updateReimbursement(EXPENSE_ID, HOUSEHOLD_ID, ACTOR_PROFILE_ID, {
        reimbursementStatus: "awaiting_reimb",
        reimbursedAmt: 0,
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("validates reimbursedAmt <= expense amount", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeApprovedExpense());

    await expect(
      updateReimbursement(EXPENSE_ID, HOUSEHOLD_ID, ACTOR_PROFILE_ID, {
        reimbursementStatus: "fully_received",
        reimbursedAmt: 150, // exceeds 100
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("returns 409 on concurrency conflict", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeApprovedExpense());
    mockProfileFindUnique.mockResolvedValue({ firstName: "Jane" });
    mockExpenseUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      updateReimbursement(EXPENSE_ID, HOUSEHOLD_ID, ACTOR_PROFILE_ID, {
        reimbursementStatus: "awaiting_reimb",
        reimbursedAmt: 0,
      })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(mockExpenseTimelineEntryCreate).not.toHaveBeenCalled();
  });

  it("creates timeline entry when reimbursement status changes", async () => {
    const expense = makeApprovedExpense();
    mockExpenseFindFirst.mockResolvedValue(expense);
    mockProfileFindUnique.mockResolvedValue({ firstName: "Jane" });
    mockExpenseUpdateMany.mockResolvedValue({ count: 1 });
    mockExpenseTimelineEntryCreate.mockResolvedValue({});
    mockExpenseFindUniqueOrThrow.mockResolvedValue({});

    await updateReimbursement(EXPENSE_ID, HOUSEHOLD_ID, ACTOR_PROFILE_ID, {
      reimbursementStatus: "awaiting_reimb",
      reimbursedAmt: 0,
    });

    expect(mockExpenseTimelineEntryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entryType: "reimbursement_status_updated",
          color: "gold",
        }),
      })
    );
  });

  it("creates timeline entry for amount change when status unchanged", async () => {
    const expense = makeApprovedExpense({
      reimbursementStatus: "partial",
      reimbursedAmt: new Prisma.Decimal("30"),
    });
    mockExpenseFindFirst.mockResolvedValue(expense);
    mockProfileFindUnique.mockResolvedValue({ firstName: "Jane" });
    mockExpenseUpdateMany.mockResolvedValue({ count: 1 });
    mockExpenseTimelineEntryCreate.mockResolvedValue({});
    mockExpenseFindUniqueOrThrow.mockResolvedValue({});

    await updateReimbursement(EXPENSE_ID, HOUSEHOLD_ID, ACTOR_PROFILE_ID, {
      reimbursementStatus: "partial",
      reimbursedAmt: 60,
    });

    expect(mockExpenseTimelineEntryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entryType: "reimbursement_amount_updated",
          color: "sage",
        }),
      })
    );
  });

  it("does not create timeline entry when nothing changed", async () => {
    const expense = makeApprovedExpense({
      reimbursementStatus: "awaiting_reimb",
      reimbursedAmt: new Prisma.Decimal("0"),
    });
    mockExpenseFindFirst.mockResolvedValue(expense);
    mockProfileFindUnique.mockResolvedValue({ firstName: "Jane" });
    mockExpenseUpdateMany.mockResolvedValue({ count: 1 });
    mockExpenseFindUniqueOrThrow.mockResolvedValue({});

    await updateReimbursement(EXPENSE_ID, HOUSEHOLD_ID, ACTOR_PROFILE_ID, {
      reimbursementStatus: "awaiting_reimb",
      reimbursedAmt: 0,
    });

    expect(mockExpenseTimelineEntryCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// settleExpense workflow
// ---------------------------------------------------------------------------

describe("settleExpense", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTransaction();
  });

  it("settles an approved expense", async () => {
    const expense = makeApprovedExpense();
    const settledExpense = { ...expense, status: "settled" };

    mockExpenseFindFirst.mockResolvedValue(expense);
    mockProfileFindUnique.mockResolvedValue({ firstName: "Jane" });
    mockExpenseUpdateMany.mockResolvedValue({ count: 1 });
    mockExpenseTimelineEntryCreate.mockResolvedValue({});
    mockExpenseFindUniqueOrThrow.mockResolvedValue(settledExpense);

    const result = await settleExpense(EXPENSE_ID, HOUSEHOLD_ID, ACTOR_PROFILE_ID, {
      settlementMethod: "venmo",
      settlementDate: "2026-04-01",
      settlementNote: "Paid",
    });

    expect(result.status).toBe("settled");
    expect(mockExpenseUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EXPENSE_ID, status: "approved" },
        data: expect.objectContaining({
          status: "settled",
          settlementMethod: "venmo",
          settledByProfileId: ACTOR_PROFILE_ID,
        }),
      })
    );
  });

  it("creates timeline entry with correct label", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeApprovedExpense());
    mockProfileFindUnique.mockResolvedValue({ firstName: "Jane" });
    mockExpenseUpdateMany.mockResolvedValue({ count: 1 });
    mockExpenseTimelineEntryCreate.mockResolvedValue({});
    mockExpenseFindUniqueOrThrow.mockResolvedValue({});

    await settleExpense(EXPENSE_ID, HOUSEHOLD_ID, ACTOR_PROFILE_ID, {
      settlementMethod: "bank_transfer",
      settlementDate: "2026-04-01",
    });

    expect(mockExpenseTimelineEntryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entryType: "settled",
          label: "Settled by Jane via bank transfer",
          color: "sage",
        }),
      })
    );
  });

  it("rejects settling a draft expense", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeApprovedExpense({ status: "draft" }));

    await expect(
      settleExpense(EXPENSE_ID, HOUSEHOLD_ID, ACTOR_PROFILE_ID, {
        settlementMethod: "cash",
        settlementDate: "2026-04-01",
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects settling an awaiting expense", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeApprovedExpense({ status: "awaiting" }));

    await expect(
      settleExpense(EXPENSE_ID, HOUSEHOLD_ID, ACTOR_PROFILE_ID, {
        settlementMethod: "cash",
        settlementDate: "2026-04-01",
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects settling a rejected expense", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeApprovedExpense({ status: "rejected" }));

    await expect(
      settleExpense(EXPENSE_ID, HOUSEHOLD_ID, ACTOR_PROFILE_ID, {
        settlementMethod: "cash",
        settlementDate: "2026-04-01",
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects settling an already settled expense", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeSettledExpense());

    await expect(
      settleExpense(EXPENSE_ID, HOUSEHOLD_ID, ACTOR_PROFILE_ID, {
        settlementMethod: "cash",
        settlementDate: "2026-04-01",
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects when expense not found", async () => {
    mockExpenseFindFirst.mockResolvedValue(null);

    await expect(
      settleExpense(EXPENSE_ID, HOUSEHOLD_ID, ACTOR_PROFILE_ID, {
        settlementMethod: "cash",
        settlementDate: "2026-04-01",
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("returns 409 on concurrency conflict", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeApprovedExpense());
    mockProfileFindUnique.mockResolvedValue({ firstName: "Jane" });
    mockExpenseUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      settleExpense(EXPENSE_ID, HOUSEHOLD_ID, ACTOR_PROFILE_ID, {
        settlementMethod: "cash",
        settlementDate: "2026-04-01",
      })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(mockExpenseTimelineEntryCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateSettlement workflow
// ---------------------------------------------------------------------------

describe("updateSettlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTransaction();
  });

  it("updates settlement details on settled expense", async () => {
    const expense = makeSettledExpense();
    mockExpenseFindFirst.mockResolvedValue(expense);
    mockProfileFindUnique.mockResolvedValue({ firstName: "Jane" });
    mockExpenseUpdateMany.mockResolvedValue({ count: 1 });
    mockExpenseTimelineEntryCreate.mockResolvedValue({});
    mockExpenseFindUniqueOrThrow.mockResolvedValue({
      ...expense,
      settlementNote: "Updated note",
    });

    const result = await updateSettlement(EXPENSE_ID, HOUSEHOLD_ID, ACTOR_PROFILE_ID, {
      settlementNote: "Updated note",
    });

    expect(mockExpenseUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EXPENSE_ID, status: "settled" },
      })
    );
  });

  it("creates settlement_updated timeline entry", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeSettledExpense());
    mockProfileFindUnique.mockResolvedValue({ firstName: "Jane" });
    mockExpenseUpdateMany.mockResolvedValue({ count: 1 });
    mockExpenseTimelineEntryCreate.mockResolvedValue({});
    mockExpenseFindUniqueOrThrow.mockResolvedValue({});

    await updateSettlement(EXPENSE_ID, HOUSEHOLD_ID, ACTOR_PROFILE_ID, {
      settlementMethod: "zelle",
    });

    expect(mockExpenseTimelineEntryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entryType: "settlement_updated",
          label: "Jane updated settlement details",
          color: "muted",
        }),
      })
    );
  });

  it("rejects update on non-settled expense", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeApprovedExpense());

    await expect(
      updateSettlement(EXPENSE_ID, HOUSEHOLD_ID, ACTOR_PROFILE_ID, {
        settlementNote: "Updated",
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects when expense not found", async () => {
    mockExpenseFindFirst.mockResolvedValue(null);

    await expect(
      updateSettlement(EXPENSE_ID, HOUSEHOLD_ID, ACTOR_PROFILE_ID, {
        settlementNote: "Updated",
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("returns 409 on concurrency conflict", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeSettledExpense());
    mockProfileFindUnique.mockResolvedValue({ firstName: "Jane" });
    mockExpenseUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      updateSettlement(EXPENSE_ID, HOUSEHOLD_ID, ACTOR_PROFILE_ID, {
        settlementNote: "Updated",
      })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(mockExpenseTimelineEntryCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Validator Tests
// ---------------------------------------------------------------------------

describe("updateReimbursementSchema", () => {
  it("accepts valid awaiting_reimb input", () => {
    const result = updateReimbursementSchema.safeParse({
      reimbursementStatus: "awaiting_reimb",
      reimbursedAmt: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid partial input", () => {
    const result = updateReimbursementSchema.safeParse({
      reimbursementStatus: "partial",
      reimbursedAmt: 50,
      reimbursementSource: "Health insurance",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid fully_received input", () => {
    const result = updateReimbursementSchema.safeParse({
      reimbursementStatus: "fully_received",
      reimbursedAmt: 100,
      reimbursedAmtExpected: 100,
    });
    expect(result.success).toBe(true);
  });

  it("rejects none with positive amount", () => {
    const result = updateReimbursementSchema.safeParse({
      reimbursementStatus: "none",
      reimbursedAmt: 50,
    });
    expect(result.success).toBe(false);
  });

  it("rejects partial with zero amount", () => {
    const result = updateReimbursementSchema.safeParse({
      reimbursementStatus: "partial",
      reimbursedAmt: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects reimbursedAmtExpected < reimbursedAmt", () => {
    const result = updateReimbursementSchema.safeParse({
      reimbursementStatus: "partial",
      reimbursedAmt: 50,
      reimbursedAmtExpected: 30,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const result = updateReimbursementSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects negative reimbursedAmt", () => {
    const result = updateReimbursementSchema.safeParse({
      reimbursementStatus: "none",
      reimbursedAmt: -10,
    });
    expect(result.success).toBe(false);
  });
});

describe("settleExpenseSchema", () => {
  it("accepts valid settlement input", () => {
    const result = settleExpenseSchema.safeParse({
      settlementMethod: "venmo",
      settlementDate: "2026-04-01",
      settlementNote: "Paid via Venmo",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all settlement methods", () => {
    for (const method of ["venmo", "zelle", "bank_transfer", "paypal", "cash", "other"]) {
      const result = settleExpenseSchema.safeParse({
        settlementMethod: method,
        settlementDate: "2026-04-01",
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects missing method", () => {
    const result = settleExpenseSchema.safeParse({
      settlementDate: "2026-04-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing date", () => {
    const result = settleExpenseSchema.safeParse({
      settlementMethod: "cash",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = settleExpenseSchema.safeParse({
      settlementMethod: "cash",
      settlementDate: "04/01/2026",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid settlement method", () => {
    const result = settleExpenseSchema.safeParse({
      settlementMethod: "bitcoin",
      settlementDate: "2026-04-01",
    });
    expect(result.success).toBe(false);
  });

  it("accepts null note", () => {
    const result = settleExpenseSchema.safeParse({
      settlementMethod: "cash",
      settlementDate: "2026-04-01",
      settlementNote: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("updateSettlementSchema", () => {
  it("accepts partial update with only method", () => {
    const result = updateSettlementSchema.safeParse({
      settlementMethod: "zelle",
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with only date", () => {
    const result = updateSettlementSchema.safeParse({
      settlementDate: "2026-04-02",
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with only note", () => {
    const result = updateSettlementSchema.safeParse({
      settlementNote: "Updated payment note",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty object (no fields)", () => {
    const result = updateSettlementSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = updateSettlementSchema.safeParse({
      settlementDate: "not-a-date",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Permission / Capability Tests
// ---------------------------------------------------------------------------

describe("expenses:settle capability", () => {
  it("owner has expenses:settle", () => {
    expect(hasParentCapability("owner", "expenses:settle")).toBe(true);
  });

  it("coparent has expenses:settle", () => {
    expect(hasParentCapability("coparent", "expenses:settle")).toBe(true);
  });

  it("Family Circle viewer cannot settle expenses", () => {
    expect(hasParentCapability("viewer", "expenses:settle")).toBe(false);
    expect(hasFamilyCircleCapability("viewer", "expenses:settle")).toBe(false);
  });

  it("Family Circle carer cannot settle expenses", () => {
    expect(hasParentCapability("carer", "expenses:settle")).toBe(false);
    expect(hasFamilyCircleCapability("carer", "expenses:settle")).toBe(false);
  });
});

describe("expenses:reimburse capability", () => {
  it("owner has expenses:reimburse", () => {
    expect(hasParentCapability("owner", "expenses:reimburse")).toBe(true);
  });

  it("coparent has expenses:reimburse", () => {
    expect(hasParentCapability("coparent", "expenses:reimburse")).toBe(true);
  });

  it("Family Circle viewer cannot manage reimbursements", () => {
    expect(hasParentCapability("viewer", "expenses:reimburse")).toBe(false);
    expect(hasFamilyCircleCapability("viewer", "expenses:reimburse")).toBe(false);
  });

  it("Family Circle contributor cannot manage reimbursements", () => {
    expect(hasParentCapability("contributor", "expenses:reimburse")).toBe(false);
    expect(hasFamilyCircleCapability("contributor", "expenses:reimburse")).toBe(false);
  });
});
