import { Prisma, ReimbursementStatus, ExpenseSplitType } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { DEFAULT_SETTINGS, UserSettings, CategorySplit } from "../../types/settings";

const Decimal = Prisma.Decimal;
const ZERO = new Decimal(0);
const HUNDRED = new Decimal(100);

// ---------------------------------------------------------------------------
// Split Resolution Engine
// ---------------------------------------------------------------------------

export interface SplitResolution {
  splitPct: number;
  splitType: ExpenseSplitType;
  splitReason: string | null;
}

/**
 * Resolves the effective split for an expense using the priority order:
 *   1. Custom (caller-provided) split
 *   2. Category override from household settings
 *   3. Household default split
 *
 * Settings are read from the expense creator's profile+household record.
 */
export async function resolveExpenseSplit(
  householdId: string,
  creatorProfileId: string,
  categoryId: string,
  customSplitPct?: number
): Promise<SplitResolution> {
  // Priority 1: explicit custom split from caller
  if (customSplitPct !== undefined) {
    return {
      splitPct: customSplitPct,
      splitType: "custom",
      splitReason: null,
    };
  }

  // Fetch creator's household settings
  const settingsRecord = await prisma.userSettings.findUnique({
    where: {
      householdId_profileId: { householdId, profileId: creatorProfileId },
    },
  });

  const settings: UserSettings =
    settingsRecord && typeof settingsRecord.settings === "object" && settingsRecord.settings !== null
      ? { ...DEFAULT_SETTINGS, ...(settingsRecord.settings as Record<string, unknown>) } as UserSettings
      : DEFAULT_SETTINGS;

  // Priority 2: category-specific split override
  const categorySplits: Record<string, CategorySplit> = settings.categorySplits ?? {};
  const catOverride = categorySplits[categoryId];
  if (catOverride && typeof catOverride.splitPct === "number") {
    return {
      splitPct: catOverride.splitPct,
      splitType: "category",
      splitReason: catOverride.reason ?? null,
    };
  }

  // Priority 3: household default split
  return {
    splitPct: settings.defaultSplitPct ?? 50,
    splitType: "default",
    splitReason: null,
  };
}

// ---------------------------------------------------------------------------
// Share Calculation Engine
// ---------------------------------------------------------------------------

export interface ShareCalcResult {
  /** Net amount after reimbursement adjustments */
  net: Prisma.Decimal;
  /** Payer's share of the net amount (splitPct side) */
  payerShare: Prisma.Decimal;
  /** Other parent's share of the net amount */
  otherShare: Prisma.Decimal;
  /** True when the expense is held (awaiting_reimb or partial) */
  isHeld: boolean;
}

/**
 * Computes net amount, payer share, and other-parent share for a single expense.
 *
 * All arithmetic uses Prisma Decimal (backed by decimal.js) to avoid
 * floating-point inaccuracy on monetary values.
 *
 * Semantics of shares:
 *   payerShare  = portion borne by whoever paid the expense
 *   otherShare  = portion borne by the other parent
 *
 * These are payer-relative; the caller maps to "my"/"their" perspective
 * based on who paid and who is requesting.
 */
export function calcShares(
  amount: Prisma.Decimal,
  reimbursable: boolean,
  reimbursedAmt: Prisma.Decimal,
  splitPct: number,
  reimbursementStatus: ReimbursementStatus
): ShareCalcResult {
  const splitDec = new Decimal(splitPct);
  const complementDec = HUNDRED.sub(splitDec);

  // Awaiting full reimbursement — shares are 0, held
  if (reimbursementStatus === "awaiting_reimb") {
    return {
      net: amount,
      payerShare: ZERO,
      otherShare: ZERO,
      isHeld: true,
    };
  }

  // Partial reimbursement — tentative split on net, still held
  if (reimbursementStatus === "partial") {
    const net = Prisma.Decimal.max(ZERO, amount.sub(reimbursedAmt));
    return {
      net,
      payerShare: net.mul(splitDec).div(HUNDRED),
      otherShare: net.mul(complementDec).div(HUNDRED),
      isHeld: true,
    };
  }

  // Fully received or reimbursable: net = amount - reimbursedAmt
  // Otherwise: net = full amount
  const net =
    reimbursable || reimbursementStatus === "fully_received"
      ? Prisma.Decimal.max(ZERO, amount.sub(reimbursedAmt))
      : amount;

  return {
    net,
    payerShare: net.mul(splitDec).div(HUNDRED),
    otherShare: net.mul(complementDec).div(HUNDRED),
    isHeld: false,
  };
}

// ---------------------------------------------------------------------------
// Perspective Mapping
// ---------------------------------------------------------------------------

export type MemberRole = "owner" | "coparent";
export type ExpensePaidBy = "owner" | "coparent";

export interface PerspectiveShares {
  net: string;
  myShare: string;
  theirShare: string;
  isHeld: boolean;
}

/**
 * Maps payer-relative shares to requester-relative "my"/"their" perspective.
 *
 * When the requester is the payer:
 *   myShare    = payerShare   (what I owe of an expense I paid)
 *   theirShare = otherShare   (what the other parent owes me)
 *
 * When the requester is NOT the payer:
 *   myShare    = otherShare   (what I owe the payer)
 *   theirShare = payerShare   (what the payer keeps)
 */
export function mapSharePerspective(
  paidBy: ExpensePaidBy,
  requesterRole: MemberRole,
  calc: ShareCalcResult
): PerspectiveShares {
  const requesterIsPayer = paidBy === requesterRole;

  return {
    net: calc.net.toFixed(2),
    myShare: requesterIsPayer
      ? calc.payerShare.toFixed(2)
      : calc.otherShare.toFixed(2),
    theirShare: requesterIsPayer
      ? calc.otherShare.toFixed(2)
      : calc.payerShare.toFixed(2),
    isHeld: calc.isHeld,
  };
}
