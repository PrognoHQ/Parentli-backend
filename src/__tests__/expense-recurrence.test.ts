import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import {
  computeOccurrenceDates,
  _advanceDate as advanceDate,
  _clampDayOfMonth as clampDayOfMonth,
  _toDateString as toDateString,
} from "../modules/expenses/recurrence";
import {
  createSeriesSchema,
  updateSeriesSchema,
  listSeriesQuerySchema,
} from "../modules/expenses/validators";

// ---------------------------------------------------------------------------
// Helper: create a local Date from YYYY-MM-DD (no timezone surprises)
// ---------------------------------------------------------------------------
function d(s: string): Date {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day);
}

// =========================================================================
// 1. Date Computation — Pure Function Tests
// =========================================================================

describe("clampDayOfMonth", () => {
  it("returns target day when month has enough days", () => {
    // March has 31 days, target 31 → 31
    expect(clampDayOfMonth(2026, 2, 31)).toBe(31); // month 2 = March (0-indexed)
  });

  it("clamps to 28 for February in non-leap year", () => {
    // Feb 2025 (non-leap), target 31 → 28
    expect(clampDayOfMonth(2025, 1, 31)).toBe(28); // month 1 = February
  });

  it("clamps to 29 for February in leap year", () => {
    // Feb 2024 (leap year), target 31 → 29
    expect(clampDayOfMonth(2024, 1, 31)).toBe(29);
  });

  it("clamps to 30 for April with target 31", () => {
    // April has 30 days, target 31 → 30
    expect(clampDayOfMonth(2026, 3, 31)).toBe(30); // month 3 = April
  });

  it("returns target day when target is within month", () => {
    expect(clampDayOfMonth(2026, 0, 15)).toBe(15); // Jan 15 → 15
  });
});

describe("advanceDate", () => {
  it("weekly: advances by 7 days", () => {
    const result = advanceDate(d("2026-01-01"), "weekly", 1);
    expect(toDateString(result)).toBe("2026-01-08");
  });

  it("biweekly: advances by 14 days", () => {
    const result = advanceDate(d("2026-01-01"), "biweekly", 1);
    expect(toDateString(result)).toBe("2026-01-15");
  });

  it("monthly: advances by 1 month with day clamping", () => {
    // Jan 31 → Feb 28 (2026 is not a leap year)
    const result = advanceDate(d("2026-01-31"), "monthly", 1, 31);
    expect(toDateString(result)).toBe("2026-02-28");
  });

  it("monthly: advances by 1 month, no clamping needed", () => {
    const result = advanceDate(d("2026-01-15"), "monthly", 1, 15);
    expect(toDateString(result)).toBe("2026-02-15");
  });

  it("weekly: intervalCount=2 advances by 14 days", () => {
    const result = advanceDate(d("2026-01-01"), "weekly", 2);
    expect(toDateString(result)).toBe("2026-01-15");
  });
});

describe("computeOccurrenceDates", () => {
  it("generates weekly dates up to maxCount", () => {
    const dates = computeOccurrenceDates({
      startDate: d("2026-04-01"),
      frequency: "weekly",
      intervalCount: 1,
      maxCount: 4,
    });
    expect(dates.map(toDateString)).toEqual([
      "2026-04-01",
      "2026-04-08",
      "2026-04-15",
      "2026-04-22",
    ]);
  });

  it("generates biweekly dates", () => {
    const dates = computeOccurrenceDates({
      startDate: d("2026-04-01"),
      frequency: "biweekly",
      intervalCount: 1,
      maxCount: 3,
    });
    expect(dates.map(toDateString)).toEqual([
      "2026-04-01",
      "2026-04-15",
      "2026-04-29",
    ]);
  });

  it("generates monthly dates with day-of-month clamping", () => {
    const dates = computeOccurrenceDates({
      startDate: d("2026-01-31"),
      frequency: "monthly",
      intervalCount: 1,
      dayOfMonth: 31,
      maxCount: 4,
    });
    expect(dates.map(toDateString)).toEqual([
      "2026-01-31",
      "2026-02-28", // Feb non-leap → clamped to 28
      "2026-03-31", // March 31 → back to 31
      "2026-04-30", // April 30 → clamped to 30
    ]);
  });

  it("monthly leap year: Feb 29 generated for Jan 31 start in 2024", () => {
    const dates = computeOccurrenceDates({
      startDate: d("2024-01-31"),
      frequency: "monthly",
      intervalCount: 1,
      dayOfMonth: 31,
      maxCount: 2,
    });
    expect(dates.map(toDateString)).toEqual([
      "2024-01-31",
      "2024-02-29", // Leap year
    ]);
  });

  it("respects endDate", () => {
    const dates = computeOccurrenceDates({
      startDate: d("2026-04-01"),
      frequency: "weekly",
      intervalCount: 1,
      endDate: d("2026-04-15"),
      maxCount: 100,
    });
    expect(dates.map(toDateString)).toEqual([
      "2026-04-01",
      "2026-04-08",
      "2026-04-15",
    ]);
  });

  it("respects upToDate", () => {
    const dates = computeOccurrenceDates({
      startDate: d("2026-04-01"),
      frequency: "weekly",
      intervalCount: 1,
      upToDate: d("2026-04-10"),
      maxCount: 100,
    });
    expect(dates.map(toDateString)).toEqual([
      "2026-04-01",
      "2026-04-08",
    ]);
  });

  it("uses the more restrictive of endDate and upToDate", () => {
    const dates = computeOccurrenceDates({
      startDate: d("2026-04-01"),
      frequency: "weekly",
      intervalCount: 1,
      endDate: d("2026-04-30"),
      upToDate: d("2026-04-10"),
      maxCount: 100,
    });
    // upToDate is more restrictive
    expect(dates.map(toDateString)).toEqual([
      "2026-04-01",
      "2026-04-08",
    ]);
  });

  it("returns empty when startDate exceeds endDate", () => {
    const dates = computeOccurrenceDates({
      startDate: d("2026-05-01"),
      frequency: "weekly",
      intervalCount: 1,
      endDate: d("2026-04-01"),
      maxCount: 100,
    });
    expect(dates).toEqual([]);
  });

  it("default maxCount is 100", () => {
    const dates = computeOccurrenceDates({
      startDate: d("2020-01-01"),
      frequency: "weekly",
      intervalCount: 1,
    });
    expect(dates.length).toBe(100);
  });

  it("monthly with day 15 stays consistent", () => {
    const dates = computeOccurrenceDates({
      startDate: d("2026-01-15"),
      frequency: "monthly",
      intervalCount: 1,
      dayOfMonth: 15,
      maxCount: 6,
    });
    expect(dates.map(toDateString)).toEqual([
      "2026-01-15",
      "2026-02-15",
      "2026-03-15",
      "2026-04-15",
      "2026-05-15",
      "2026-06-15",
    ]);
  });
});

// =========================================================================
// 2. Validator Tests
// =========================================================================

describe("createSeriesSchema", () => {
  const validInput = {
    description: "Weekly groceries",
    amount: 75.50,
    paidBy: "owner" as const,
    childScope: "both" as const,
    categoryId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    frequency: "weekly" as const,
    startDate: "2026-04-01",
  };

  it("accepts valid input", () => {
    const result = createSeriesSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("accepts all optional fields", () => {
    const result = createSeriesSchema.safeParse({
      ...validInput,
      primaryChildId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      childScope: "single",
      splitPct: 60,
      notes: "Test notes",
      reimbursable: true,
      endDate: "2026-12-31",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing description", () => {
    const { description, ...rest } = validInput;
    const result = createSeriesSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects invalid frequency", () => {
    const result = createSeriesSchema.safeParse({
      ...validInput,
      frequency: "daily",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative amount", () => {
    const result = createSeriesSchema.safeParse({
      ...validInput,
      amount: -10,
    });
    expect(result.success).toBe(false);
  });

  it("rejects endDate before startDate", () => {
    const result = createSeriesSchema.safeParse({
      ...validInput,
      startDate: "2026-04-01",
      endDate: "2026-03-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = createSeriesSchema.safeParse({
      ...validInput,
      startDate: "04/01/2026",
    });
    expect(result.success).toBe(false);
  });

  it("requires primaryChildId when childScope is single", () => {
    const result = createSeriesSchema.safeParse({
      ...validInput,
      childScope: "single",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all three frequencies", () => {
    for (const freq of ["weekly", "biweekly", "monthly"] as const) {
      const result = createSeriesSchema.safeParse({
        ...validInput,
        frequency: freq,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects splitPct > 100", () => {
    const result = createSeriesSchema.safeParse({
      ...validInput,
      splitPct: 101,
    });
    expect(result.success).toBe(false);
  });

  it("rejects splitPct < 0", () => {
    const result = createSeriesSchema.safeParse({
      ...validInput,
      splitPct: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("updateSeriesSchema", () => {
  it("requires editScope", () => {
    const result = updateSeriesSchema.safeParse({
      description: "updated",
    });
    expect(result.success).toBe(false);
  });

  it("accepts single scope", () => {
    const result = updateSeriesSchema.safeParse({
      editScope: "single",
      description: "updated desc",
    });
    expect(result.success).toBe(true);
  });

  it("accepts future scope", () => {
    const result = updateSeriesSchema.safeParse({
      editScope: "future",
      amount: 100,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid editScope", () => {
    const result = updateSeriesSchema.safeParse({
      editScope: "all",
      description: "updated",
    });
    expect(result.success).toBe(false);
  });
});

describe("listSeriesQuerySchema", () => {
  it("applies defaults", () => {
    const result = listSeriesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
      expect(result.data.includeArchived).toBe(false);
    }
  });

  it("coerces string page to number", () => {
    const result = listSeriesQuerySchema.safeParse({ page: "3" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
    }
  });

  it("transforms includeArchived", () => {
    const result = listSeriesQuerySchema.safeParse({ includeArchived: "true" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.includeArchived).toBe(true);
    }
  });
});

// =========================================================================
// 3. toDateString helper
// =========================================================================

describe("toDateString", () => {
  it("formats date correctly", () => {
    expect(toDateString(d("2026-01-05"))).toBe("2026-01-05");
  });

  it("pads single-digit months and days", () => {
    expect(toDateString(d("2026-02-03"))).toBe("2026-02-03");
  });
});
