import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  rejectExpenseSchema,
  EXPENSE_REJECTION_REASONS,
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

// The workflow module imports prisma, so import after mock setup
import { approveExpense, rejectExpense } from "../modules/expenses/workflow";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HOUSEHOLD_ID = "hh-111";
const EXPENSE_ID = "exp-222";
const CREATOR_PROFILE_ID = "profile-creator";
const APPROVER_PROFILE_ID = "profile-approver";
const OTHER_HOUSEHOLD_ID = "hh-999";

function makeAwaitingExpense(overrides: Record<string, unknown> = {}) {
  return {
    id: EXPENSE_ID,
    householdId: HOUSEHOLD_ID,
    createdByProfileId: CREATOR_PROFILE_ID,
    status: "awaiting",
    approvalRequired: true,
    approvedAt: null,
    approvedByProfileId: null,
    rejectedAt: null,
    rejectedByProfileId: null,
    rejectionReason: null,
    ...overrides,
  };
}

function setupTransaction() {
  // Simulate prisma.$transaction(async (tx) => { ... })
  // Execute the callback with a mock tx client
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

// ---------------------------------------------------------------------------
// approveExpense workflow
// ---------------------------------------------------------------------------

describe("approveExpense", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTransaction();
  });

  it("approves a valid awaiting expense", async () => {
    const expense = makeAwaitingExpense();
    const approvedExpense = { ...expense, status: "approved" };

    mockExpenseFindFirst.mockResolvedValue(expense);
    mockProfileFindUnique.mockResolvedValue({ firstName: "Jane" });
    mockExpenseUpdateMany.mockResolvedValue({ count: 1 });
    mockExpenseTimelineEntryCreate.mockResolvedValue({});
    mockExpenseFindUniqueOrThrow.mockResolvedValue(approvedExpense);

    const result = await approveExpense(EXPENSE_ID, HOUSEHOLD_ID, APPROVER_PROFILE_ID);

    expect(result.status).toBe("approved");

    // Verify conditional update included status check
    expect(mockExpenseUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EXPENSE_ID, status: "awaiting" },
        data: expect.objectContaining({
          status: "approved",
          approvedByProfileId: APPROVER_PROFILE_ID,
          rejectedAt: null,
          rejectedByProfileId: null,
          rejectionReason: null,
        }),
      })
    );

    // Verify timeline entry
    expect(mockExpenseTimelineEntryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          householdId: HOUSEHOLD_ID,
          expenseId: EXPENSE_ID,
          actorProfileId: APPROVER_PROFILE_ID,
          entryType: "approved",
          color: "sage",
        }),
      })
    );
  });

  it("rejects approval of expense not found (404)", async () => {
    mockExpenseFindFirst.mockResolvedValue(null);

    await expect(
      approveExpense(EXPENSE_ID, HOUSEHOLD_ID, APPROVER_PROFILE_ID)
    ).rejects.toMatchObject({ statusCode: 404, message: "Expense not found." });
  });

  it("rejects approval of expense not in household (tenant isolation)", async () => {
    mockExpenseFindFirst.mockResolvedValue(null);

    await expect(
      approveExpense(EXPENSE_ID, OTHER_HOUSEHOLD_ID, APPROVER_PROFILE_ID)
    ).rejects.toMatchObject({ statusCode: 404 });

    // Verify the query included householdId
    expect(mockExpenseFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ householdId: OTHER_HOUSEHOLD_ID }),
      })
    );
  });

  it("blocks approval of non-awaiting expense (draft)", async () => {
    mockExpenseFindFirst.mockResolvedValue(
      makeAwaitingExpense({ status: "draft" })
    );

    await expect(
      approveExpense(EXPENSE_ID, HOUSEHOLD_ID, APPROVER_PROFILE_ID)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("blocks approval of already-approved expense", async () => {
    mockExpenseFindFirst.mockResolvedValue(
      makeAwaitingExpense({ status: "approved" })
    );

    await expect(
      approveExpense(EXPENSE_ID, HOUSEHOLD_ID, APPROVER_PROFILE_ID)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("blocks approval of already-rejected expense", async () => {
    mockExpenseFindFirst.mockResolvedValue(
      makeAwaitingExpense({ status: "rejected" })
    );

    await expect(
      approveExpense(EXPENSE_ID, HOUSEHOLD_ID, APPROVER_PROFILE_ID)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("blocks approval of expense with approvalRequired=false", async () => {
    mockExpenseFindFirst.mockResolvedValue(
      makeAwaitingExpense({ approvalRequired: false })
    );

    await expect(
      approveExpense(EXPENSE_ID, HOUSEHOLD_ID, APPROVER_PROFILE_ID)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("blocks self-approval (creator cannot approve own expense)", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeAwaitingExpense());

    await expect(
      approveExpense(EXPENSE_ID, HOUSEHOLD_ID, CREATOR_PROFILE_ID)
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Cannot approve your own expense.",
    });
  });

  it("returns 409 if expense was concurrently resolved (race condition guard)", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeAwaitingExpense());
    mockProfileFindUnique.mockResolvedValue({ firstName: "Jane" });
    mockExpenseUpdateMany.mockResolvedValue({ count: 0 }); // Already resolved

    await expect(
      approveExpense(EXPENSE_ID, HOUSEHOLD_ID, APPROVER_PROFILE_ID)
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Expense was already resolved by another user.",
    });

    // Timeline entry should NOT have been created
    expect(mockExpenseTimelineEntryCreate).not.toHaveBeenCalled();
  });

  it("clears rejection metadata when approving", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeAwaitingExpense());
    mockProfileFindUnique.mockResolvedValue({ firstName: "Jane" });
    mockExpenseUpdateMany.mockResolvedValue({ count: 1 });
    mockExpenseTimelineEntryCreate.mockResolvedValue({});
    mockExpenseFindUniqueOrThrow.mockResolvedValue({});

    await approveExpense(EXPENSE_ID, HOUSEHOLD_ID, APPROVER_PROFILE_ID);

    const updateData = mockExpenseUpdateMany.mock.calls[0][0].data;
    expect(updateData.rejectedAt).toBeNull();
    expect(updateData.rejectedByProfileId).toBeNull();
    expect(updateData.rejectionReason).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// rejectExpense workflow
// ---------------------------------------------------------------------------

describe("rejectExpense", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTransaction();
  });

  it("rejects a valid awaiting expense", async () => {
    const expense = makeAwaitingExpense();
    const rejectedExpense = { ...expense, status: "rejected" };

    mockExpenseFindFirst.mockResolvedValue(expense);
    mockProfileFindUnique.mockResolvedValue({ firstName: "John" });
    mockExpenseUpdateMany.mockResolvedValue({ count: 1 });
    mockExpenseTimelineEntryCreate.mockResolvedValue({});
    mockExpenseFindUniqueOrThrow.mockResolvedValue(rejectedExpense);

    const result = await rejectExpense(
      EXPENSE_ID, HOUSEHOLD_ID, APPROVER_PROFILE_ID, "not_in_budget"
    );

    expect(result.status).toBe("rejected");

    // Verify conditional update with status check
    expect(mockExpenseUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EXPENSE_ID, status: "awaiting" },
        data: expect.objectContaining({
          status: "rejected",
          rejectedByProfileId: APPROVER_PROFILE_ID,
          rejectionReason: "not_in_budget",
          approvedAt: null,
          approvedByProfileId: null,
        }),
      })
    );
  });

  it("stores rejection reason on expense and detail in timeline", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeAwaitingExpense());
    mockProfileFindUnique.mockResolvedValue({ firstName: "John" });
    mockExpenseUpdateMany.mockResolvedValue({ count: 1 });
    mockExpenseTimelineEntryCreate.mockResolvedValue({});
    mockExpenseFindUniqueOrThrow.mockResolvedValue({});

    await rejectExpense(
      EXPENSE_ID, HOUSEHOLD_ID, APPROVER_PROFILE_ID, "other", "Custom reason text"
    );

    // Reason stored on expense
    const updateData = mockExpenseUpdateMany.mock.calls[0][0].data;
    expect(updateData.rejectionReason).toBe("other");

    // Detail stored in timeline
    expect(mockExpenseTimelineEntryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entryType: "rejected",
          detail: "other: Custom reason text",
          color: "terracotta",
        }),
      })
    );
  });

  it("blocks rejection of non-awaiting expense (approved)", async () => {
    mockExpenseFindFirst.mockResolvedValue(
      makeAwaitingExpense({ status: "approved" })
    );

    await expect(
      rejectExpense(EXPENSE_ID, HOUSEHOLD_ID, APPROVER_PROFILE_ID, "not_in_budget")
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("blocks rejection of expense with approvalRequired=false", async () => {
    mockExpenseFindFirst.mockResolvedValue(
      makeAwaitingExpense({ approvalRequired: false })
    );

    await expect(
      rejectExpense(EXPENSE_ID, HOUSEHOLD_ID, APPROVER_PROFILE_ID, "not_in_budget")
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("blocks self-rejection (creator cannot reject own expense)", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeAwaitingExpense());

    await expect(
      rejectExpense(EXPENSE_ID, HOUSEHOLD_ID, CREATOR_PROFILE_ID, "not_in_budget")
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Cannot reject your own expense.",
    });
  });

  it("returns 409 if expense was concurrently resolved (race condition guard)", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeAwaitingExpense());
    mockProfileFindUnique.mockResolvedValue({ firstName: "John" });
    mockExpenseUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      rejectExpense(EXPENSE_ID, HOUSEHOLD_ID, APPROVER_PROFILE_ID, "not_in_budget")
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(mockExpenseTimelineEntryCreate).not.toHaveBeenCalled();
  });

  it("clears approval metadata when rejecting", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeAwaitingExpense());
    mockProfileFindUnique.mockResolvedValue({ firstName: "John" });
    mockExpenseUpdateMany.mockResolvedValue({ count: 1 });
    mockExpenseTimelineEntryCreate.mockResolvedValue({});
    mockExpenseFindUniqueOrThrow.mockResolvedValue({});

    await rejectExpense(
      EXPENSE_ID, HOUSEHOLD_ID, APPROVER_PROFILE_ID, "wrong_amount"
    );

    const updateData = mockExpenseUpdateMany.mock.calls[0][0].data;
    expect(updateData.approvedAt).toBeNull();
    expect(updateData.approvedByProfileId).toBeNull();
  });

  it("rejects expense not found (404)", async () => {
    mockExpenseFindFirst.mockResolvedValue(null);

    await expect(
      rejectExpense(EXPENSE_ID, HOUSEHOLD_ID, APPROVER_PROFILE_ID, "not_in_budget")
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ---------------------------------------------------------------------------
// Permission / Capability Tests (expenses:approve)
// ---------------------------------------------------------------------------

describe("expenses:approve capability", () => {
  it("owner has expenses:approve", () => {
    expect(hasParentCapability("owner", "expenses:approve")).toBe(true);
  });

  it("coparent has expenses:approve", () => {
    expect(hasParentCapability("coparent", "expenses:approve")).toBe(true);
  });

  it("Family Circle viewer cannot approve expenses", () => {
    expect(hasParentCapability("viewer", "expenses:approve")).toBe(false);
    expect(hasFamilyCircleCapability("viewer", "expenses:approve")).toBe(false);
  });

  it("Family Circle contributor cannot approve expenses", () => {
    expect(hasParentCapability("contributor", "expenses:approve")).toBe(false);
    expect(hasFamilyCircleCapability("contributor", "expenses:approve")).toBe(false);
  });

  it("Family Circle carer cannot approve expenses", () => {
    expect(hasParentCapability("carer", "expenses:approve")).toBe(false);
    expect(hasFamilyCircleCapability("carer", "expenses:approve")).toBe(false);
  });

  it("unknown roles cannot approve expenses", () => {
    expect(hasParentCapability("guest", "expenses:approve")).toBe(false);
    expect(hasParentCapability("", "expenses:approve")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// State Machine Integrity
// ---------------------------------------------------------------------------

describe("state machine integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTransaction();
  });

  const nonAwaitingStatuses = ["draft", "approved", "rejected", "settled"];

  for (const status of nonAwaitingStatuses) {
    it(`cannot approve expense with status '${status}'`, async () => {
      mockExpenseFindFirst.mockResolvedValue(
        makeAwaitingExpense({ status })
      );

      await expect(
        approveExpense(EXPENSE_ID, HOUSEHOLD_ID, APPROVER_PROFILE_ID)
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it(`cannot reject expense with status '${status}'`, async () => {
      mockExpenseFindFirst.mockResolvedValue(
        makeAwaitingExpense({ status })
      );

      await expect(
        rejectExpense(EXPENSE_ID, HOUSEHOLD_ID, APPROVER_PROFILE_ID, "not_in_budget")
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  }

  it("cannot approve expense with approvalRequired=false even if awaiting", async () => {
    mockExpenseFindFirst.mockResolvedValue(
      makeAwaitingExpense({ status: "awaiting", approvalRequired: false })
    );

    await expect(
      approveExpense(EXPENSE_ID, HOUSEHOLD_ID, APPROVER_PROFILE_ID)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("cannot reject expense with approvalRequired=false even if awaiting", async () => {
    mockExpenseFindFirst.mockResolvedValue(
      makeAwaitingExpense({ status: "awaiting", approvalRequired: false })
    );

    await expect(
      rejectExpense(EXPENSE_ID, HOUSEHOLD_ID, APPROVER_PROFILE_ID, "not_in_budget")
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ---------------------------------------------------------------------------
// Self-resolution consistency
// ---------------------------------------------------------------------------

describe("self-resolution consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTransaction();
  });

  it("self-approval is blocked with 403", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeAwaitingExpense());

    await expect(
      approveExpense(EXPENSE_ID, HOUSEHOLD_ID, CREATOR_PROFILE_ID)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("self-rejection is blocked with 403", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeAwaitingExpense());

    await expect(
      rejectExpense(EXPENSE_ID, HOUSEHOLD_ID, CREATOR_PROFILE_ID, "not_in_budget")
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ---------------------------------------------------------------------------
// Timeline entry correctness
// ---------------------------------------------------------------------------

describe("timeline entries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTransaction();
  });

  it("approval creates timeline entry with correct type and color", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeAwaitingExpense());
    mockProfileFindUnique.mockResolvedValue({ firstName: "Jane" });
    mockExpenseUpdateMany.mockResolvedValue({ count: 1 });
    mockExpenseTimelineEntryCreate.mockResolvedValue({});
    mockExpenseFindUniqueOrThrow.mockResolvedValue({});

    await approveExpense(EXPENSE_ID, HOUSEHOLD_ID, APPROVER_PROFILE_ID);

    expect(mockExpenseTimelineEntryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          householdId: HOUSEHOLD_ID,
          expenseId: EXPENSE_ID,
          actorProfileId: APPROVER_PROFILE_ID,
          entryType: "approved",
          label: "Approved by Jane",
          color: "sage",
        }),
      })
    );
  });

  it("rejection creates timeline entry with correct type, color, and detail", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeAwaitingExpense());
    mockProfileFindUnique.mockResolvedValue({ firstName: "John" });
    mockExpenseUpdateMany.mockResolvedValue({ count: 1 });
    mockExpenseTimelineEntryCreate.mockResolvedValue({});
    mockExpenseFindUniqueOrThrow.mockResolvedValue({});

    await rejectExpense(
      EXPENSE_ID, HOUSEHOLD_ID, APPROVER_PROFILE_ID, "wrong_amount", "It was $50 not $500"
    );

    expect(mockExpenseTimelineEntryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          householdId: HOUSEHOLD_ID,
          expenseId: EXPENSE_ID,
          actorProfileId: APPROVER_PROFILE_ID,
          entryType: "rejected",
          label: "Rejected by John",
          detail: "wrong_amount: It was $50 not $500",
          color: "terracotta",
        }),
      })
    );
  });

  it("rejection without detail uses reason only as timeline detail", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeAwaitingExpense());
    mockProfileFindUnique.mockResolvedValue({ firstName: "John" });
    mockExpenseUpdateMany.mockResolvedValue({ count: 1 });
    mockExpenseTimelineEntryCreate.mockResolvedValue({});
    mockExpenseFindUniqueOrThrow.mockResolvedValue({});

    await rejectExpense(
      EXPENSE_ID, HOUSEHOLD_ID, APPROVER_PROFILE_ID, "need_to_discuss"
    );

    const entryData = mockExpenseTimelineEntryCreate.mock.calls[0][0].data;
    expect(entryData.detail).toBe("need_to_discuss");
  });

  it("approval uses fallback name when profile not found", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeAwaitingExpense());
    mockProfileFindUnique.mockResolvedValue(null);
    mockExpenseUpdateMany.mockResolvedValue({ count: 1 });
    mockExpenseTimelineEntryCreate.mockResolvedValue({});
    mockExpenseFindUniqueOrThrow.mockResolvedValue({});

    await approveExpense(EXPENSE_ID, HOUSEHOLD_ID, APPROVER_PROFILE_ID);

    const entryData = mockExpenseTimelineEntryCreate.mock.calls[0][0].data;
    expect(entryData.label).toBe("Approved by co-parent");
  });
});
