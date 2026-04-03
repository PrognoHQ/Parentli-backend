import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { MemberRole } from "./calculations";

// ---------------------------------------------------------------------------
// Balance Summary — Raw SQL Aggregation
// ---------------------------------------------------------------------------

interface BalanceRow {
  owner_is_owed: Prisma.Decimal | null;
  coparent_is_owed: Prisma.Decimal | null;
  counted_expense_count: bigint;
  held_excluded_count: bigint;
}

export interface BalanceSummary {
  youOwe: string;
  theyOwe: string;
  netBalance: string;
  countedExpenseCount: number;
  heldExcludedCount: number;
}

/**
 * Computes the household expense balance summary.
 *
 * Rules:
 *   - Only expenses with status = 'approved' are counted
 *   - Held expenses (awaiting_reimb, partial) are excluded from balance
 *   - Soft-deleted expenses are excluded
 *   - For each non-held approved expense, otherShare goes to the balance of
 *     whoever did NOT pay
 *
 * The raw SQL computes two aggregates:
 *   owner_is_owed  = sum of otherShare where owner paid (what coparent owes owner)
 *   coparent_is_owed = sum of otherShare where coparent paid (what owner owes coparent)
 *
 * These are then mapped to youOwe/theyOwe based on requester perspective.
 */
export async function getBalanceSummary(
  householdId: string,
  requesterRole: MemberRole
): Promise<BalanceSummary> {
  const rows = await prisma.$queryRaw<BalanceRow[]>`
    SELECT
      COALESCE(SUM(
        CASE WHEN paid_by = 'owner'
             AND reimbursement_status NOT IN ('awaiting_reimb', 'partial')
        THEN
          CASE
            WHEN reimbursable = true OR reimbursement_status = 'fully_received'
            THEN GREATEST(0, amount - reimbursed_amt) * (100 - split_pct) / 100
            ELSE amount * (100 - split_pct) / 100
          END
        ELSE 0
        END
      ), 0) AS owner_is_owed,

      COALESCE(SUM(
        CASE WHEN paid_by = 'coparent'
             AND reimbursement_status NOT IN ('awaiting_reimb', 'partial')
        THEN
          CASE
            WHEN reimbursable = true OR reimbursement_status = 'fully_received'
            THEN GREATEST(0, amount - reimbursed_amt) * (100 - split_pct) / 100
            ELSE amount * (100 - split_pct) / 100
          END
        ELSE 0
        END
      ), 0) AS coparent_is_owed,

      COUNT(*) FILTER (
        WHERE reimbursement_status NOT IN ('awaiting_reimb', 'partial')
      ) AS counted_expense_count,

      COUNT(*) FILTER (
        WHERE reimbursement_status IN ('awaiting_reimb', 'partial')
      ) AS held_excluded_count

    FROM expenses
    WHERE household_id = ${householdId}::uuid
      AND status = 'approved'
      AND deleted_at IS NULL
  `;

  const row = rows[0];
  const ownerIsOwed = new Prisma.Decimal(row.owner_is_owed?.toString() ?? "0");
  const coparentIsOwed = new Prisma.Decimal(row.coparent_is_owed?.toString() ?? "0");

  // Perspective mapping:
  //   owner viewing:    youOwe = coparentIsOwed (what I owe coparent)
  //                     theyOwe = ownerIsOwed   (what coparent owes me)
  //   coparent viewing: youOwe = ownerIsOwed    (what I owe owner)
  //                     theyOwe = coparentIsOwed (what owner owes me)
  const youOwe = requesterRole === "owner" ? coparentIsOwed : ownerIsOwed;
  const theyOwe = requesterRole === "owner" ? ownerIsOwed : coparentIsOwed;
  const netBalance = theyOwe.sub(youOwe);

  return {
    youOwe: youOwe.toFixed(2),
    theyOwe: theyOwe.toFixed(2),
    netBalance: netBalance.toFixed(2),
    countedExpenseCount: Number(row.counted_expense_count),
    heldExcludedCount: Number(row.held_excluded_count),
  };
}
