import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import {
  hasParentCapability,
  hasFamilyCircleCapability,
} from "../lib/permissions";
import {
  generateSeriesSchema,
} from "../modules/expenses/validators";

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockSeriesCreate = vi.fn();
const mockSeriesFindFirst = vi.fn();
const mockSeriesFindMany = vi.fn();
const mockSeriesCount = vi.fn();
const mockSeriesUpdate = vi.fn();
const mockExpenseCreate = vi.fn();
const mockExpenseFindFirst = vi.fn();
const mockExpenseFindMany = vi.fn();
const mockExpenseUpdate = vi.fn();
const mockExpenseUpdateMany = vi.fn();
const mockTimelineCreate = vi.fn();
const mockChildFindFirst = vi.fn();
const mockCategoryFindFirst = vi.fn();
const mockProfileFindUnique = vi.fn();
const mockTransaction = vi.fn();
const mockSettingsFindFirst = vi.fn();
const mockUserSettingsFindUnique = vi.fn();

vi.mock("../lib/prisma", () => ({
  prisma: {
    expenseSeries: {
      create: (...args: unknown[]) => mockSeriesCreate(...args),
      findFirst: (...args: unknown[]) => mockSeriesFindFirst(...args),
      findMany: (...args: unknown[]) => mockSeriesFindMany(...args),
      count: (...args: unknown[]) => mockSeriesCount(...args),
      update: (...args: unknown[]) => mockSeriesUpdate(...args),
    },
    expense: {
      create: (...args: unknown[]) => mockExpenseCreate(...args),
      findFirst: (...args: unknown[]) => mockExpenseFindFirst(...args),
      findMany: (...args: unknown[]) => mockExpenseFindMany(...args),
      update: (...args: unknown[]) => mockExpenseUpdate(...args),
      updateMany: (...args: unknown[]) => mockExpenseUpdateMany(...args),
    },
    expenseTimelineEntry: {
      create: (...args: unknown[]) => mockTimelineCreate(...args),
    },
    child: {
      findFirst: (...args: unknown[]) => mockChildFindFirst(...args),
    },
    category: {
      findFirst: (...args: unknown[]) => mockCategoryFindFirst(...args),
    },
    profile: {
      findUnique: (...args: unknown[]) => mockProfileFindUnique(...args),
    },
    householdSettings: {
      findFirst: (...args: unknown[]) => mockSettingsFindFirst(...args),
    },
    userSettings: {
      findUnique: (...args: unknown[]) => mockUserSettingsFindUnique(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

// Import after mock setup
import {
  createSeries,
  listSeries,
  getSeriesDetail,
  updateSeriesSingleInstance,
  updateSeriesFuture,
  pauseSeries,
  resumeSeries,
  archiveSeries,
  generateSeriesInstances,
} from "../modules/expenses/recurrence";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HH_ID = "hh-111";
const OTHER_HH_ID = "hh-999";
const CREATOR_ID = "profile-creator";
const SERIES_ID = "series-001";
const EXPENSE_ID = "exp-001";

function makeSeries(overrides: Record<string, unknown> = {}) {
  return {
    id: SERIES_ID,
    householdId: HH_ID,
    createdByProfileId: CREATOR_ID,
    description: "Weekly groceries",
    amount: new Prisma.Decimal("75.50"),
    paidBy: "owner",
    childScope: "both",
    primaryChildId: null,
    categoryId: "cat-001",
    splitPct: 50,
    splitType: "default",
    splitReason: null,
    notes: null,
    reimbursable: false,
    frequency: "weekly",
    intervalCount: 1,
    dayOfMonth: null,
    startDate: new Date(2026, 1, 1), // Feb 1, 2026 (in the past)
    endDate: null,
    nextGenerationDate: new Date(2026, 1, 22), // Feb 22 (after 3 initial)
    paused: false,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeExpense(overrides: Record<string, unknown> = {}) {
  return {
    id: EXPENSE_ID,
    householdId: HH_ID,
    createdByProfileId: CREATOR_ID,
    description: "Weekly groceries",
    amount: new Prisma.Decimal("75.50"),
    paidBy: "owner",
    date: new Date(2026, 3, 1),
    childScope: "both",
    primaryChildId: null,
    categoryId: "cat-001",
    status: "draft",
    splitPct: 50,
    splitType: "default",
    splitReason: null,
    reimbursable: false,
    reimbursedAmt: new Prisma.Decimal("0"),
    reimbursementStatus: "none",
    settlementMethod: null,
    notes: null,
    seriesId: SERIES_ID,
    seriesInstanceDate: new Date(2026, 3, 1),
    isDetachedFromSeries: false,
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// =========================================================================
// 1. Series Creation + Initial Generation
// =========================================================================

describe("createSeries", () => {
  it("creates series and generates initial instances in a transaction", async () => {
    mockCategoryFindFirst.mockResolvedValue({ id: "cat-001", householdId: HH_ID });
    mockSettingsFindFirst.mockResolvedValue(null);
    mockUserSettingsFindUnique.mockResolvedValue(null);

    const createdSeries = makeSeries();
    mockTransaction.mockImplementation(async (cb: Function) => {
      const tx = {
        expenseSeries: { create: mockSeriesCreate, update: mockSeriesUpdate },
        expense: { create: mockExpenseCreate, findMany: mockExpenseFindMany },
        expenseTimelineEntry: { create: mockTimelineCreate },
        profile: { findUnique: mockProfileFindUnique },
        householdSettings: { findFirst: mockSettingsFindFirst },
        userSettings: { findUnique: mockUserSettingsFindUnique },
      };
      mockSeriesCreate.mockResolvedValue(createdSeries);
      mockProfileFindUnique.mockResolvedValue({ firstName: "Alice" });
      mockSettingsFindFirst.mockResolvedValue(null);
      mockUserSettingsFindUnique.mockResolvedValue(null);
      mockExpenseCreate
        .mockResolvedValueOnce({ id: "exp-1" })
        .mockResolvedValueOnce({ id: "exp-2" })
        .mockResolvedValueOnce({ id: "exp-3" });
      mockTimelineCreate.mockResolvedValue({});
      return cb(tx);
    });

    const result = await createSeries(HH_ID, CREATOR_ID, {
      description: "Weekly groceries",
      amount: 75.50,
      paidBy: "owner",
      childScope: "both",
      categoryId: "cat-001",
      frequency: "weekly",
      startDate: "2026-02-01",
    });

    // Verify series was created
    expect(mockSeriesCreate).toHaveBeenCalledTimes(1);
    // Verify 3 initial instances were generated
    expect(mockExpenseCreate).toHaveBeenCalledTimes(3);
    // Verify timeline entries were created for each instance
    expect(mockTimelineCreate).toHaveBeenCalled();
    // Verify result includes generatedInstanceCount
    expect(result).toHaveProperty("generatedInstanceCount", 3);
  });

  it("validates child belongs to household", async () => {
    mockChildFindFirst.mockResolvedValue(null); // child not found
    mockCategoryFindFirst.mockResolvedValue({ id: "cat-001", householdId: HH_ID });

    await expect(
      createSeries(HH_ID, CREATOR_ID, {
        description: "Test",
        amount: 50,
        paidBy: "owner",
        childScope: "single",
        primaryChildId: "child-invalid",
        categoryId: "cat-001",
        frequency: "weekly",
        startDate: "2026-04-01",
      })
    ).rejects.toThrow("Child not found in this household");
  });

  it("validates category belongs to household", async () => {
    mockCategoryFindFirst.mockResolvedValue(null); // category not found

    await expect(
      createSeries(HH_ID, CREATOR_ID, {
        description: "Test",
        amount: 50,
        paidBy: "owner",
        childScope: "both",
        categoryId: "cat-invalid",
        frequency: "weekly",
        startDate: "2026-04-01",
      })
    ).rejects.toThrow("Category not found in this household");
  });
});

// =========================================================================
// 2. Instance Generation — Duplicate Prevention
// =========================================================================

describe("generateSeriesInstances", () => {
  it("skips already-existing instance dates", async () => {
    const series = makeSeries();
    mockSeriesFindFirst.mockResolvedValue(series);
    mockUserSettingsFindUnique.mockResolvedValue(null);

    // Two of three expected dates already exist
    mockExpenseFindMany.mockResolvedValue([
      { seriesInstanceDate: new Date(2026, 1, 22) }, // Feb 22
      { seriesInstanceDate: new Date(2026, 2, 1) },  // Mar 1
    ]);

    mockTransaction.mockImplementation(async (cb: Function) => {
      const tx = {
        expense: { create: mockExpenseCreate },
        expenseSeries: { update: mockSeriesUpdate },
        expenseTimelineEntry: { create: mockTimelineCreate },
        profile: { findUnique: mockProfileFindUnique },
        householdSettings: { findFirst: mockSettingsFindFirst },
        userSettings: { findUnique: mockUserSettingsFindUnique },
      };
      mockProfileFindUnique.mockResolvedValue({ firstName: "Alice" });
      mockSettingsFindFirst.mockResolvedValue(null);
      mockExpenseCreate.mockResolvedValue({ id: "exp-new" });
      mockTimelineCreate.mockResolvedValue({});
      return cb(tx);
    });

    const result = await generateSeriesInstances(SERIES_ID, HH_ID, CREATOR_ID);

    // Only 1 missing date should be created (May 6)
    expect(mockExpenseCreate).toHaveBeenCalledTimes(1);
    expect(result.generatedCount).toBe(1);
  });

  it("handles P2002 unique constraint violation gracefully", async () => {
    const series = makeSeries();
    mockSeriesFindFirst.mockResolvedValue(series);
    mockExpenseFindMany.mockResolvedValue([]); // no existing instances
    mockUserSettingsFindUnique.mockResolvedValue(null);

    mockTransaction.mockImplementation(async (cb: Function) => {
      const tx = {
        expense: { create: mockExpenseCreate },
        expenseSeries: { update: mockSeriesUpdate },
        expenseTimelineEntry: { create: mockTimelineCreate },
        profile: { findUnique: mockProfileFindUnique },
        householdSettings: { findFirst: mockSettingsFindFirst },
        userSettings: { findUnique: mockUserSettingsFindUnique },
      };
      mockProfileFindUnique.mockResolvedValue({ firstName: "Alice" });
      mockSettingsFindFirst.mockResolvedValue(null);
      // First create succeeds, second throws P2002 (duplicate), third succeeds
      mockExpenseCreate
        .mockResolvedValueOnce({ id: "exp-1" })
        .mockRejectedValueOnce({ code: "P2002" })
        .mockResolvedValueOnce({ id: "exp-3" });
      mockTimelineCreate.mockResolvedValue({});
      return cb(tx);
    });

    const result = await generateSeriesInstances(SERIES_ID, HH_ID, CREATOR_ID);

    // 3 creates attempted, 1 P2002 skipped, so 2 generated
    expect(mockExpenseCreate).toHaveBeenCalledTimes(3);
    expect(result.generatedCount).toBe(2);
  });

  it("rejects generation for paused series", async () => {
    mockSeriesFindFirst.mockResolvedValue(makeSeries({ paused: true }));

    await expect(
      generateSeriesInstances(SERIES_ID, HH_ID, CREATOR_ID)
    ).rejects.toThrow("Cannot generate instances for a paused series");
  });

  it("rejects generation for archived series", async () => {
    // Note: archived series also has paused=true, and paused is checked first
    mockSeriesFindFirst.mockResolvedValue(
      makeSeries({ archivedAt: new Date(), paused: true })
    );

    await expect(
      generateSeriesInstances(SERIES_ID, HH_ID, CREATOR_ID)
    ).rejects.toThrow("paused");
  });

  it("returns zero when no dates to generate", async () => {
    // Series with endDate in the past and nextGenerationDate past endDate
    const series = makeSeries({
      endDate: new Date(2026, 0, 15), // Jan 15
      nextGenerationDate: new Date(2026, 1, 1), // Feb 1 (past endDate)
    });
    mockSeriesFindFirst.mockResolvedValue(series);

    const result = await generateSeriesInstances(SERIES_ID, HH_ID, CREATOR_ID);
    expect(result.generatedCount).toBe(0);
  });
});

// =========================================================================
// 3. Edit Scope — Single Instance Detach
// =========================================================================

describe("updateSeriesSingleInstance", () => {
  it("detaches instance and sets isDetachedFromSeries=true", async () => {
    const expense = makeExpense();
    mockExpenseFindFirst.mockResolvedValue(expense);

    mockTransaction.mockImplementation(async (cb: Function) => {
      const tx = {
        expense: { update: mockExpenseUpdate },
        expenseTimelineEntry: { create: mockTimelineCreate },
      };
      mockExpenseUpdate.mockResolvedValue({
        ...expense,
        isDetachedFromSeries: true,
        description: "Updated",
      });
      mockTimelineCreate.mockResolvedValue({});
      return cb(tx);
    });

    const result = await updateSeriesSingleInstance(
      EXPENSE_ID, HH_ID, CREATOR_ID,
      { editScope: "single", description: "Updated" }
    );

    // Verify update called with isDetachedFromSeries=true
    expect(mockExpenseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isDetachedFromSeries: true,
        }),
      })
    );

    // Verify timeline entry created
    expect(mockTimelineCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entryType: "detached_from_series",
        }),
      })
    );
  });

  it("rejects edit on non-series expense", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeExpense({ seriesId: null }));

    await expect(
      updateSeriesSingleInstance(EXPENSE_ID, HH_ID, CREATOR_ID, {
        editScope: "single",
        description: "Test",
      })
    ).rejects.toThrow("not part of a recurring series");
  });

  it("rejects edit on approved expense", async () => {
    mockExpenseFindFirst.mockResolvedValue(makeExpense({ status: "approved" }));

    await expect(
      updateSeriesSingleInstance(EXPENSE_ID, HH_ID, CREATOR_ID, {
        editScope: "single",
        description: "Test",
      })
    ).rejects.toThrow("Only draft or awaiting expenses can be updated");
  });
});

// =========================================================================
// 4. Edit Scope — Future Instances Preservation
// =========================================================================

describe("updateSeriesFuture", () => {
  it("only updates safe future instances (not detached, not finalized)", async () => {
    mockSeriesFindFirst.mockResolvedValue(makeSeries());

    mockTransaction.mockImplementation(async (cb: Function) => {
      const tx = {
        expenseSeries: { update: mockSeriesUpdate },
        expense: { findMany: mockExpenseFindMany, updateMany: mockExpenseUpdateMany },
        expenseTimelineEntry: { create: mockTimelineCreate },
      };
      // Return 2 safe instances
      mockExpenseFindMany.mockResolvedValue([
        { id: "exp-future-1" },
        { id: "exp-future-2" },
      ]);
      mockSeriesUpdate.mockResolvedValue({});
      mockExpenseUpdateMany.mockResolvedValue({ count: 2 });
      mockTimelineCreate.mockResolvedValue({});
      return cb(tx);
    });

    const result = await updateSeriesFuture(
      SERIES_ID, HH_ID, CREATOR_ID,
      { editScope: "future", amount: 100 }
    );

    expect(result.updatedInstanceCount).toBe(2);

    // Verify the findMany query filters correctly
    expect(mockExpenseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          seriesId: SERIES_ID,
          householdId: HH_ID,
          isDetachedFromSeries: false,
          status: { in: ["draft", "awaiting"] },
          reimbursementStatus: "none",
          settlementMethod: null,
        }),
      })
    );
  });

  it("rejects update on archived series", async () => {
    mockSeriesFindFirst.mockResolvedValue(
      makeSeries({ archivedAt: new Date() })
    );

    await expect(
      updateSeriesFuture(SERIES_ID, HH_ID, CREATOR_ID, {
        editScope: "future",
        amount: 100,
      })
    ).rejects.toThrow("Cannot update an archived series");
  });
});

// =========================================================================
// 5. Pause / Resume / Archive
// =========================================================================

describe("pauseSeries", () => {
  it("pauses an active series and creates timeline entry", async () => {
    mockSeriesFindFirst.mockResolvedValue(makeSeries());

    mockTransaction.mockImplementation(async (cb: Function) => {
      const tx = {
        expenseSeries: { update: mockSeriesUpdate },
        expense: { findFirst: mockExpenseFindFirst },
        expenseTimelineEntry: { create: mockTimelineCreate },
      };
      mockSeriesUpdate.mockResolvedValue({});
      mockExpenseFindFirst.mockResolvedValue({ id: "exp-latest" });
      mockTimelineCreate.mockResolvedValue({});
      return cb(tx);
    });

    const result = await pauseSeries(SERIES_ID, HH_ID, CREATOR_ID);
    expect(result).toEqual({ id: SERIES_ID, paused: true });
    expect(mockTimelineCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entryType: "series_paused",
          label: "Recurring series paused",
        }),
      })
    );
  });

  it("rejects pause on archived series", async () => {
    mockSeriesFindFirst.mockResolvedValue(
      makeSeries({ archivedAt: new Date(), paused: true })
    );

    await expect(
      pauseSeries(SERIES_ID, HH_ID, CREATOR_ID)
    ).rejects.toThrow("Cannot pause an archived series");
  });

  it("rejects pause on already-paused series", async () => {
    mockSeriesFindFirst.mockResolvedValue(makeSeries({ paused: true }));

    await expect(
      pauseSeries(SERIES_ID, HH_ID, CREATOR_ID)
    ).rejects.toThrow("already paused");
  });
});

describe("resumeSeries", () => {
  it("resumes a paused series and creates timeline entry", async () => {
    mockSeriesFindFirst.mockResolvedValue(makeSeries({ paused: true }));

    mockTransaction.mockImplementation(async (cb: Function) => {
      const tx = {
        expenseSeries: { update: mockSeriesUpdate },
        expense: { findFirst: mockExpenseFindFirst },
        expenseTimelineEntry: { create: mockTimelineCreate },
      };
      mockSeriesUpdate.mockResolvedValue({});
      mockExpenseFindFirst.mockResolvedValue({ id: "exp-latest" });
      mockTimelineCreate.mockResolvedValue({});
      return cb(tx);
    });

    const result = await resumeSeries(SERIES_ID, HH_ID, CREATOR_ID);
    expect(result).toEqual({ id: SERIES_ID, paused: false });
    expect(mockTimelineCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entryType: "series_resumed",
        }),
      })
    );
  });

  it("rejects resume on non-paused series", async () => {
    mockSeriesFindFirst.mockResolvedValue(makeSeries({ paused: false }));

    await expect(
      resumeSeries(SERIES_ID, HH_ID, CREATOR_ID)
    ).rejects.toThrow("not paused");
  });
});

describe("archiveSeries", () => {
  it("archives a series and creates timeline entry", async () => {
    mockSeriesFindFirst.mockResolvedValue(makeSeries());

    mockTransaction.mockImplementation(async (cb: Function) => {
      const tx = {
        expenseSeries: { update: mockSeriesUpdate },
        expense: { findFirst: mockExpenseFindFirst },
        expenseTimelineEntry: { create: mockTimelineCreate },
      };
      mockSeriesUpdate.mockResolvedValue({});
      mockExpenseFindFirst.mockResolvedValue({ id: "exp-latest" });
      mockTimelineCreate.mockResolvedValue({});
      return cb(tx);
    });

    const result = await archiveSeries(SERIES_ID, HH_ID, CREATOR_ID);
    expect(result).toEqual({ id: SERIES_ID, archivedAt: true });
    expect(mockTimelineCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entryType: "series_archived",
        }),
      })
    );
  });

  it("rejects archive on already-archived series", async () => {
    mockSeriesFindFirst.mockResolvedValue(
      makeSeries({ archivedAt: new Date() })
    );

    await expect(
      archiveSeries(SERIES_ID, HH_ID, CREATOR_ID)
    ).rejects.toThrow("already archived");
  });
});

// =========================================================================
// 6. Tenant Isolation
// =========================================================================

describe("tenant isolation", () => {
  it("getSeriesDetail rejects cross-household access", async () => {
    // Series exists in HH_ID but we query with OTHER_HH_ID
    mockSeriesFindFirst.mockResolvedValue(null);

    await expect(
      getSeriesDetail(SERIES_ID, OTHER_HH_ID)
    ).rejects.toThrow("not found");

    // Verify the query included householdId filter
    expect(mockSeriesFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: SERIES_ID,
          householdId: OTHER_HH_ID,
        }),
      })
    );
  });

  it("pauseSeries rejects cross-household access", async () => {
    mockSeriesFindFirst.mockResolvedValue(null);

    await expect(
      pauseSeries(SERIES_ID, OTHER_HH_ID, CREATOR_ID)
    ).rejects.toThrow("not found");
  });

  it("generateSeriesInstances rejects cross-household access", async () => {
    mockSeriesFindFirst.mockResolvedValue(null);

    await expect(
      generateSeriesInstances(SERIES_ID, OTHER_HH_ID, CREATOR_ID)
    ).rejects.toThrow("not found");
  });
});

// =========================================================================
// 7. Family Circle Exclusion (Capability Check)
// =========================================================================

describe("Family Circle exclusion", () => {
  it("Family Circle viewer has no expenses:read capability", () => {
    expect(hasFamilyCircleCapability("viewer", "expenses:read")).toBe(false);
    expect(hasFamilyCircleCapability("viewer", "expenses:write")).toBe(false);
  });

  it("Family Circle contributor has no expenses:write capability", () => {
    expect(hasFamilyCircleCapability("contributor", "expenses:read")).toBe(false);
    expect(hasFamilyCircleCapability("contributor", "expenses:write")).toBe(false);
  });

  it("Family Circle carer has no expenses:write capability", () => {
    expect(hasFamilyCircleCapability("carer", "expenses:read")).toBe(false);
    expect(hasFamilyCircleCapability("carer", "expenses:write")).toBe(false);
  });

  it("owner has expenses:write capability", () => {
    expect(hasParentCapability("owner", "expenses:read")).toBe(true);
    expect(hasParentCapability("owner", "expenses:write")).toBe(true);
  });

  it("coparent has expenses:write capability", () => {
    expect(hasParentCapability("coparent", "expenses:read")).toBe(true);
    expect(hasParentCapability("coparent", "expenses:write")).toBe(true);
  });
});

// =========================================================================
// 8. Generate Series Validator
// =========================================================================

describe("generateSeriesSchema", () => {
  it("accepts empty body (no upToDate)", () => {
    const result = generateSeriesSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts valid upToDate", () => {
    const result = generateSeriesSchema.safeParse({ upToDate: "2026-06-30" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.upToDate).toBe("2026-06-30");
    }
  });

  it("rejects invalid date format", () => {
    const result = generateSeriesSchema.safeParse({ upToDate: "06/30/2026" });
    expect(result.success).toBe(false);
  });
});

// =========================================================================
// 9. Read Models
// =========================================================================

describe("listSeries", () => {
  it("filters out archived by default", async () => {
    mockSeriesFindMany.mockResolvedValue([]);
    mockSeriesCount.mockResolvedValue(0);

    await listSeries(HH_ID, { page: 1, limit: 20, includeArchived: false });

    expect(mockSeriesFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          householdId: HH_ID,
          archivedAt: null,
        }),
      })
    );
  });

  it("includes archived when requested", async () => {
    mockSeriesFindMany.mockResolvedValue([]);
    mockSeriesCount.mockResolvedValue(0);

    await listSeries(HH_ID, { page: 1, limit: 20, includeArchived: true });

    // archivedAt should NOT be in the where clause
    const callArg = mockSeriesFindMany.mock.calls[0][0];
    expect(callArg.where).not.toHaveProperty("archivedAt");
  });
});

describe("getSeriesDetail", () => {
  it("returns series with recent instances", async () => {
    const series = makeSeries();
    mockSeriesFindFirst.mockResolvedValue(series);
    mockExpenseFindMany.mockResolvedValue([
      makeExpense({ id: "exp-1" }),
      makeExpense({ id: "exp-2" }),
    ]);

    const result = await getSeriesDetail(SERIES_ID, HH_ID);

    expect(result).toHaveProperty("instances");
    expect(result.instances).toHaveLength(2);
    // Instances query is scoped to householdId
    expect(mockExpenseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          seriesId: SERIES_ID,
          householdId: HH_ID,
          deletedAt: null,
        }),
      })
    );
  });
});
