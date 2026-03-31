import { describe, it, expect } from "vitest";

/**
 * Tests for custody schedule validation logic.
 * Extracted from custody/service.ts createOrReplaceSchedule validation.
 */

interface DayInput {
  weekIndex: number;
  dayIndex: number;
  assignedParentRole: "owner" | "coparent";
  isHandoffDay?: boolean;
  handoffTime?: string | null;
}

function validateCustodyDays(days: DayInput[]): string | null {
  if (!Array.isArray(days) || days.length !== 14) {
    return "Exactly 14 day slots are required.";
  }

  const seen = new Set<string>();
  for (const day of days) {
    if (day.weekIndex < 0 || day.weekIndex > 1) {
      return `Invalid weekIndex ${day.weekIndex}. Must be 0 or 1.`;
    }
    if (day.dayIndex < 0 || day.dayIndex > 6) {
      return `Invalid dayIndex ${day.dayIndex}. Must be 0–6.`;
    }
    if (
      day.assignedParentRole !== "owner" &&
      day.assignedParentRole !== "coparent"
    ) {
      return `Invalid assignedParentRole "${day.assignedParentRole}".`;
    }
    const key = `${day.weekIndex}-${day.dayIndex}`;
    if (seen.has(key)) {
      return `Duplicate day slot: week ${day.weekIndex}, day ${day.dayIndex}.`;
    }
    seen.add(key);
  }
  return null;
}

function make14Days(
  override?: Partial<DayInput>,
  overrideIndex?: number
): DayInput[] {
  const days: DayInput[] = [];
  for (let w = 0; w <= 1; w++) {
    for (let d = 0; d <= 6; d++) {
      const day: DayInput = {
        weekIndex: w,
        dayIndex: d,
        assignedParentRole: w === 0 ? "owner" : "coparent",
      };
      if (overrideIndex !== undefined && days.length === overrideIndex && override) {
        days.push({ ...day, ...override });
      } else {
        days.push(day);
      }
    }
  }
  return days;
}

describe("Custody 14-day pattern validation", () => {
  it("accepts valid 14-day pattern", () => {
    expect(validateCustodyDays(make14Days())).toBeNull();
  });

  it("rejects fewer than 14 days", () => {
    expect(validateCustodyDays(make14Days().slice(0, 13))).toBe(
      "Exactly 14 day slots are required."
    );
  });

  it("rejects more than 14 days", () => {
    const days = make14Days();
    days.push({ weekIndex: 0, dayIndex: 0, assignedParentRole: "owner" });
    expect(validateCustodyDays(days)).not.toBeNull();
  });

  it("rejects weekIndex > 1", () => {
    const days = make14Days({ weekIndex: 2 }, 0);
    expect(validateCustodyDays(days)).toContain("Invalid weekIndex");
  });

  it("rejects negative weekIndex", () => {
    const days = make14Days({ weekIndex: -1 }, 0);
    expect(validateCustodyDays(days)).toContain("Invalid weekIndex");
  });

  it("rejects dayIndex > 6", () => {
    const days = make14Days({ dayIndex: 7 }, 0);
    expect(validateCustodyDays(days)).toContain("Invalid dayIndex");
  });

  it("rejects invalid assignedParentRole", () => {
    const days = make14Days();
    (days[0] as any).assignedParentRole = "viewer";
    expect(validateCustodyDays(days)).toContain("Invalid assignedParentRole");
  });

  it("rejects duplicate day slots", () => {
    const days = make14Days();
    days[1] = { ...days[0] }; // duplicate week 0, day 0
    expect(validateCustodyDays(days)).toContain("Duplicate day slot");
  });

  it("all-owner pattern is valid", () => {
    const days: DayInput[] = [];
    for (let w = 0; w <= 1; w++) {
      for (let d = 0; d <= 6; d++) {
        days.push({ weekIndex: w, dayIndex: d, assignedParentRole: "owner" });
      }
    }
    expect(validateCustodyDays(days)).toBeNull();
  });

  it("alternating pattern is valid", () => {
    const days: DayInput[] = [];
    for (let w = 0; w <= 1; w++) {
      for (let d = 0; d <= 6; d++) {
        days.push({
          weekIndex: w,
          dayIndex: d,
          assignedParentRole: d % 2 === 0 ? "owner" : "coparent",
        });
      }
    }
    expect(validateCustodyDays(days)).toBeNull();
  });
});
