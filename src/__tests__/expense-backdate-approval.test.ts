import { describe, it, expect } from "vitest";
import {
  determineBackdateCategory,
  determineExpenseApprovalRequirement,
} from "../modules/expenses/calculations";

// Helper: create a YYYY-MM-DD string N days before the given date
function daysAgo(n: number, from: Date = new Date("2026-04-03T00:00:00Z")): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const NOW = new Date("2026-04-03T12:00:00Z"); // midday to test UTC midnight normalization
const FLAG_DAYS = 7;
const APPROVAL_DAYS = 90;
const MAX_BACKDATE_DAYS = 730;

// ---------------------------------------------------------------------------
// determineBackdateCategory
// ---------------------------------------------------------------------------

describe("determineBackdateCategory", () => {
  describe("recent category", () => {
    it("today (ageDays=0) is recent", () => {
      const result = determineBackdateCategory(
        daysAgo(0),
        NOW,
        FLAG_DAYS,
        APPROVAL_DAYS,
        MAX_BACKDATE_DAYS
      );
      expect(result.category).toBe("recent");
      expect(result.ageDays).toBe(0);
    });

    it("exactly flagDays (7) is recent (boundary: <=)", () => {
      const result = determineBackdateCategory(
        daysAgo(7),
        NOW,
        FLAG_DAYS,
        APPROVAL_DAYS,
        MAX_BACKDATE_DAYS
      );
      expect(result.category).toBe("recent");
      expect(result.ageDays).toBe(7);
    });
  });

  describe("backdated category", () => {
    it("flagDays+1 (8) is backdated", () => {
      const result = determineBackdateCategory(
        daysAgo(8),
        NOW,
        FLAG_DAYS,
        APPROVAL_DAYS,
        MAX_BACKDATE_DAYS
      );
      expect(result.category).toBe("backdated");
      expect(result.ageDays).toBe(8);
    });

    it("approvalDays-1 (89) is backdated (boundary: <)", () => {
      const result = determineBackdateCategory(
        daysAgo(89),
        NOW,
        FLAG_DAYS,
        APPROVAL_DAYS,
        MAX_BACKDATE_DAYS
      );
      expect(result.category).toBe("backdated");
      expect(result.ageDays).toBe(89);
    });
  });

  describe("significant category", () => {
    it("exactly approvalDays (90) is significant (boundary: >=)", () => {
      const result = determineBackdateCategory(
        daysAgo(90),
        NOW,
        FLAG_DAYS,
        APPROVAL_DAYS,
        MAX_BACKDATE_DAYS
      );
      expect(result.category).toBe("significant");
      expect(result.ageDays).toBe(90);
    });

    it("maxBackdateDays (730) is significant and valid", () => {
      const result = determineBackdateCategory(
        daysAgo(730),
        NOW,
        FLAG_DAYS,
        APPROVAL_DAYS,
        MAX_BACKDATE_DAYS
      );
      expect(result.category).toBe("significant");
      expect(result.ageDays).toBe(730);
    });
  });

  describe("rejection cases", () => {
    it("future date throws", () => {
      expect(() =>
        determineBackdateCategory(
          daysAgo(-1),
          NOW,
          FLAG_DAYS,
          APPROVAL_DAYS,
          MAX_BACKDATE_DAYS
        )
      ).toThrow("Expense date cannot be in the future.");
    });

    it("exceeding maxBackdateDays (731) throws", () => {
      expect(() =>
        determineBackdateCategory(
          daysAgo(731),
          NOW,
          FLAG_DAYS,
          APPROVAL_DAYS,
          MAX_BACKDATE_DAYS
        )
      ).toThrow("Expense date exceeds maximum backdate limit");
    });
  });

  describe("custom thresholds", () => {
    it("flagDays=14, approvalDays=30: 15 days is backdated", () => {
      const result = determineBackdateCategory(
        daysAgo(15),
        NOW,
        14,
        30,
        MAX_BACKDATE_DAYS
      );
      expect(result.category).toBe("backdated");
    });

    it("flagDays=14, approvalDays=30: 30 days is significant", () => {
      const result = determineBackdateCategory(
        daysAgo(30),
        NOW,
        14,
        30,
        MAX_BACKDATE_DAYS
      );
      expect(result.category).toBe("significant");
    });

    it("flagDays=14, approvalDays=30: 14 days is recent", () => {
      const result = determineBackdateCategory(
        daysAgo(14),
        NOW,
        14,
        30,
        MAX_BACKDATE_DAYS
      );
      expect(result.category).toBe("recent");
    });
  });

  describe("UTC midnight normalization", () => {
    it("handles now with non-zero time components correctly", () => {
      const lateNight = new Date("2026-04-03T23:59:59Z");
      const result = determineBackdateCategory(
        "2026-04-03",
        lateNight,
        FLAG_DAYS,
        APPROVAL_DAYS,
        MAX_BACKDATE_DAYS
      );
      expect(result.category).toBe("recent");
      expect(result.ageDays).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// determineExpenseApprovalRequirement
// ---------------------------------------------------------------------------

describe("determineExpenseApprovalRequirement", () => {
  describe("significant backdate trigger", () => {
    it("significant backdate requires approval even when threshold disabled", () => {
      const result = determineExpenseApprovalRequirement({
        amount: 10,
        backdateCategory: "significant",
        approvalRequired: false,
        approvalThreshold: 50,
      });
      expect(result.approvalRequired).toBe(true);
      expect(result.approvalTrigger).toBe("significant_backdate");
    });

    it("significant backdate requires approval even when amount below threshold", () => {
      const result = determineExpenseApprovalRequirement({
        amount: 10,
        backdateCategory: "significant",
        approvalRequired: true,
        approvalThreshold: 50,
      });
      expect(result.approvalRequired).toBe(true);
      expect(result.approvalTrigger).toBe("significant_backdate");
    });
  });

  describe("threshold trigger", () => {
    it("amount >= threshold with approval enabled triggers threshold", () => {
      const result = determineExpenseApprovalRequirement({
        amount: 100,
        backdateCategory: "recent",
        approvalRequired: true,
        approvalThreshold: 50,
      });
      expect(result.approvalRequired).toBe(true);
      expect(result.approvalTrigger).toBe("threshold");
    });

    it("amount exactly at threshold triggers approval (boundary: >=)", () => {
      const result = determineExpenseApprovalRequirement({
        amount: 50,
        backdateCategory: "recent",
        approvalRequired: true,
        approvalThreshold: 50,
      });
      expect(result.approvalRequired).toBe(true);
      expect(result.approvalTrigger).toBe("threshold");
    });

    it("amount below threshold does not trigger", () => {
      const result = determineExpenseApprovalRequirement({
        amount: 49.99,
        backdateCategory: "recent",
        approvalRequired: true,
        approvalThreshold: 50,
      });
      expect(result.approvalRequired).toBe(false);
      expect(result.approvalTrigger).toBe("none");
    });
  });

  describe("no approval required", () => {
    it("recent expense below threshold with approval disabled", () => {
      const result = determineExpenseApprovalRequirement({
        amount: 10,
        backdateCategory: "recent",
        approvalRequired: false,
        approvalThreshold: 50,
      });
      expect(result.approvalRequired).toBe(false);
      expect(result.approvalTrigger).toBe("none");
    });

    it("amount above threshold but approval setting disabled", () => {
      const result = determineExpenseApprovalRequirement({
        amount: 100,
        backdateCategory: "recent",
        approvalRequired: false,
        approvalThreshold: 50,
      });
      expect(result.approvalRequired).toBe(false);
      expect(result.approvalTrigger).toBe("none");
    });

    it("backdated (not significant) with approval disabled", () => {
      const result = determineExpenseApprovalRequirement({
        amount: 100,
        backdateCategory: "backdated",
        approvalRequired: false,
        approvalThreshold: 50,
      });
      expect(result.approvalRequired).toBe(false);
      expect(result.approvalTrigger).toBe("none");
    });
  });

  describe("backdated (not significant) with threshold", () => {
    it("backdated + threshold enabled + amount >= threshold triggers threshold", () => {
      const result = determineExpenseApprovalRequirement({
        amount: 100,
        backdateCategory: "backdated",
        approvalRequired: true,
        approvalThreshold: 50,
      });
      expect(result.approvalRequired).toBe(true);
      expect(result.approvalTrigger).toBe("threshold");
    });

    it("backdated + threshold enabled + amount < threshold does not trigger", () => {
      const result = determineExpenseApprovalRequirement({
        amount: 30,
        backdateCategory: "backdated",
        approvalRequired: true,
        approvalThreshold: 50,
      });
      expect(result.approvalRequired).toBe(false);
      expect(result.approvalTrigger).toBe("none");
    });
  });
});
