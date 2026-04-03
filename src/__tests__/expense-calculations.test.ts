import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  calcShares,
  mapSharePerspective,
  ShareCalcResult,
} from "../modules/expenses/calculations";

const D = (v: number | string) => new Prisma.Decimal(v);
const ZERO = D(0);

// Helper to convert ShareCalcResult decimals to numbers for easier assertions
function toNumbers(r: ShareCalcResult) {
  return {
    net: Number(r.net),
    payerShare: Number(r.payerShare),
    otherShare: Number(r.otherShare),
    isHeld: r.isHeld,
  };
}

describe("calcShares", () => {
  // -----------------------------------------------------------------------
  // Basic splits — no reimbursement
  // -----------------------------------------------------------------------
  describe("no reimbursement (status=none)", () => {
    it("50/50 split on $100", () => {
      const r = toNumbers(calcShares(D(100), false, ZERO, 50, "none"));
      expect(r.net).toBe(100);
      expect(r.payerShare).toBe(50);
      expect(r.otherShare).toBe(50);
      expect(r.isHeld).toBe(false);
    });

    it("70/30 split on $200", () => {
      const r = toNumbers(calcShares(D(200), false, ZERO, 70, "none"));
      expect(r.net).toBe(200);
      expect(r.payerShare).toBe(140);
      expect(r.otherShare).toBe(60);
      expect(r.isHeld).toBe(false);
    });

    it("0/100 split — payer pays nothing", () => {
      const r = toNumbers(calcShares(D(50), false, ZERO, 0, "none"));
      expect(r.payerShare).toBe(0);
      expect(r.otherShare).toBe(50);
      expect(r.isHeld).toBe(false);
    });

    it("100/0 split — payer pays everything", () => {
      const r = toNumbers(calcShares(D(50), false, ZERO, 100, "none"));
      expect(r.payerShare).toBe(50);
      expect(r.otherShare).toBe(0);
      expect(r.isHeld).toBe(false);
    });

    it("handles decimal amounts precisely", () => {
      const r = calcShares(D("33.33"), false, ZERO, 50, "none");
      expect(r.net.toFixed(2)).toBe("33.33");
      expect(r.payerShare.toFixed(2)).toBe("16.67"); // 33.33 * 50 / 100 = 16.665
      expect(r.otherShare.toFixed(2)).toBe("16.67");
    });
  });

  // -----------------------------------------------------------------------
  // Reimbursable flag (status=none but reimbursable=true)
  // -----------------------------------------------------------------------
  describe("reimbursable with status=none", () => {
    it("reduces net by reimbursedAmt when reimbursable=true", () => {
      const r = toNumbers(calcShares(D(100), true, D(40), 50, "none"));
      expect(r.net).toBe(60);
      expect(r.payerShare).toBe(30);
      expect(r.otherShare).toBe(30);
      expect(r.isHeld).toBe(false);
    });

    it("net cannot go below zero", () => {
      const r = toNumbers(calcShares(D(50), true, D(100), 50, "none"));
      expect(r.net).toBe(0);
      expect(r.payerShare).toBe(0);
      expect(r.otherShare).toBe(0);
    });

    it("non-reimbursable ignores reimbursedAmt when status=none", () => {
      const r = toNumbers(calcShares(D(100), false, D(40), 50, "none"));
      expect(r.net).toBe(100); // reimbursedAmt ignored
      expect(r.payerShare).toBe(50);
      expect(r.otherShare).toBe(50);
    });
  });

  // -----------------------------------------------------------------------
  // Awaiting reimbursement — fully held
  // -----------------------------------------------------------------------
  describe("awaiting_reimb status", () => {
    it("returns zero shares and isHeld=true", () => {
      const r = toNumbers(calcShares(D(200), true, ZERO, 50, "awaiting_reimb"));
      expect(r.net).toBe(200);
      expect(r.payerShare).toBe(0);
      expect(r.otherShare).toBe(0);
      expect(r.isHeld).toBe(true);
    });

    it("isHeld regardless of split percentage", () => {
      const r = calcShares(D(100), false, ZERO, 70, "awaiting_reimb");
      expect(r.isHeld).toBe(true);
      expect(Number(r.payerShare)).toBe(0);
      expect(Number(r.otherShare)).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Partial reimbursement — tentative, held
  // -----------------------------------------------------------------------
  describe("partial reimbursement status", () => {
    it("computes tentative shares on net, isHeld=true", () => {
      const r = toNumbers(calcShares(D(100), true, D(30), 50, "partial"));
      expect(r.net).toBe(70);
      expect(r.payerShare).toBe(35);
      expect(r.otherShare).toBe(35);
      expect(r.isHeld).toBe(true);
    });

    it("60/40 split on partial reimbursement", () => {
      const r = toNumbers(calcShares(D(200), true, D(50), 60, "partial"));
      expect(r.net).toBe(150);
      expect(r.payerShare).toBe(90);
      expect(r.otherShare).toBe(60);
      expect(r.isHeld).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Fully received reimbursement — not held
  // -----------------------------------------------------------------------
  describe("fully_received status", () => {
    it("reduces net by reimbursedAmt, not held", () => {
      const r = toNumbers(calcShares(D(100), false, D(60), 50, "fully_received"));
      expect(r.net).toBe(40);
      expect(r.payerShare).toBe(20);
      expect(r.otherShare).toBe(20);
      expect(r.isHeld).toBe(false);
    });

    it("fully reimbursed = net 0", () => {
      const r = toNumbers(calcShares(D(100), false, D(100), 50, "fully_received"));
      expect(r.net).toBe(0);
      expect(r.payerShare).toBe(0);
      expect(r.otherShare).toBe(0);
      expect(r.isHeld).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  describe("edge cases", () => {
    it("zero amount", () => {
      const r = toNumbers(calcShares(ZERO, false, ZERO, 50, "none"));
      expect(r.net).toBe(0);
      expect(r.payerShare).toBe(0);
      expect(r.otherShare).toBe(0);
    });

    it("very small amount with odd split", () => {
      const r = calcShares(D("0.01"), false, ZERO, 33, "none");
      // 0.01 * 33 / 100 = 0.0033
      // 0.01 * 67 / 100 = 0.0067
      // Decimal precision is maintained — these won't round to 2 dp until display
      expect(Number(r.payerShare)).toBeCloseTo(0.0033, 4);
      expect(Number(r.otherShare)).toBeCloseTo(0.0067, 4);
    });

    it("large amount precision", () => {
      const r = calcShares(D("99999.99"), false, ZERO, 50, "none");
      // 99999.99 * 50 / 100 = 49999.995 — rounds to 50000.00 at 2dp
      expect(r.payerShare.toFixed(2)).toBe("50000.00");
      expect(r.otherShare.toFixed(2)).toBe("50000.00");
      // But raw decimal preserves precision
      expect(r.payerShare.toString()).toBe("49999.995");
    });
  });
});

describe("mapSharePerspective", () => {
  const makeCalc = (payer: number, other: number, net: number, held: boolean): ShareCalcResult => ({
    net: D(net),
    payerShare: D(payer),
    otherShare: D(other),
    isHeld: held,
  });

  it("owner paid, owner viewing — myShare=payerShare, theirShare=otherShare", () => {
    const result = mapSharePerspective("owner", "owner", makeCalc(60, 40, 100, false));
    expect(result.myShare).toBe("60.00");
    expect(result.theirShare).toBe("40.00");
    expect(result.net).toBe("100.00");
    expect(result.isHeld).toBe(false);
  });

  it("owner paid, coparent viewing — myShare=otherShare, theirShare=payerShare", () => {
    const result = mapSharePerspective("owner", "coparent", makeCalc(60, 40, 100, false));
    expect(result.myShare).toBe("40.00");
    expect(result.theirShare).toBe("60.00");
  });

  it("coparent paid, coparent viewing — myShare=payerShare", () => {
    const result = mapSharePerspective("coparent", "coparent", makeCalc(70, 30, 100, false));
    expect(result.myShare).toBe("70.00");
    expect(result.theirShare).toBe("30.00");
  });

  it("coparent paid, owner viewing — myShare=otherShare", () => {
    const result = mapSharePerspective("coparent", "owner", makeCalc(70, 30, 100, false));
    expect(result.myShare).toBe("30.00");
    expect(result.theirShare).toBe("70.00");
  });

  it("preserves isHeld flag", () => {
    const result = mapSharePerspective("owner", "owner", makeCalc(0, 0, 100, true));
    expect(result.isHeld).toBe(true);
  });
});
