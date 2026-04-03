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

// ---------------------------------------------------------------------------
// Approval Inbox — Raw SQL Query
// ---------------------------------------------------------------------------

interface ApprovalInboxRow {
  id: string;
  description: string;
  amount: Prisma.Decimal;
  date: Date;
  paid_by: string;
  child_scope: string;
  primary_child_id: string | null;
  category_id: string;
  split_pct: number;
  approval_required: boolean;
  approval_trigger: string;
  backdate_category: string;
  backdate_reason: string | null;
  created_by_profile_id: string;
  created_at: Date;
  updated_at: Date;
  status: string;
  notes: string | null;
  category_label: string;
  category_slug: string;
  category_emoji: string | null;
  category_color: string | null;
  child_first_name: string | null;
  child_last_name: string | null;
  child_emoji: string | null;
  creator_first_name: string;
  creator_last_name: string;
}

export interface ApprovalInboxItem {
  id: string;
  description: string;
  amount: string;
  date: string;
  paidBy: string;
  childScope: string;
  primaryChildId: string | null;
  categoryId: string;
  splitPct: number;
  approvalRequired: boolean;
  approvalTrigger: string;
  backdateCategory: string;
  backdateReason: string | null;
  createdByProfileId: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  notes: string | null;
  category: {
    id: string;
    label: string;
    slug: string;
    emoji: string | null;
    color: string | null;
  };
  primaryChild: {
    firstName: string;
    lastName: string;
    emoji: string | null;
  } | null;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

/**
 * Returns pending expenses awaiting approval for the given reviewer.
 *
 * Rules:
 *   - Only expenses with status = 'awaiting' and approval_required = true
 *   - Excludes expenses created by the requester (no self-review)
 *   - Household-scoped, soft-deleted excluded
 */
export async function getApprovalInbox(
  householdId: string,
  requesterProfileId: string
): Promise<ApprovalInboxItem[]> {
  const rows = await prisma.$queryRaw<ApprovalInboxRow[]>`
    SELECT
      e.id, e.description, e.amount, e.date, e.paid_by,
      e.child_scope, e.primary_child_id,
      e.category_id, e.split_pct,
      e.approval_required, e.approval_trigger,
      e.backdate_category, e.backdate_reason,
      e.created_by_profile_id, e.created_at, e.updated_at, e.status,
      e.notes,
      c.label AS category_label, c.slug AS category_slug,
      c.emoji AS category_emoji, c.color AS category_color,
      ch.first_name AS child_first_name, ch.last_name AS child_last_name,
      ch.emoji AS child_emoji,
      p.first_name AS creator_first_name, p.last_name AS creator_last_name
    FROM expenses e
    JOIN categories c ON c.id = e.category_id
    LEFT JOIN children ch ON ch.id = e.primary_child_id
    JOIN profiles p ON p.id = e.created_by_profile_id
    WHERE e.household_id = ${householdId}::uuid
      AND e.status = 'awaiting'
      AND e.approval_required = true
      AND e.deleted_at IS NULL
      AND e.created_by_profile_id != ${requesterProfileId}::uuid
    ORDER BY e.created_at DESC
  `;

  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    amount: new Prisma.Decimal(r.amount.toString()).toFixed(2),
    date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
    paidBy: r.paid_by,
    childScope: r.child_scope,
    primaryChildId: r.primary_child_id,
    categoryId: r.category_id,
    splitPct: r.split_pct,
    approvalRequired: r.approval_required,
    approvalTrigger: r.approval_trigger,
    backdateCategory: r.backdate_category,
    backdateReason: r.backdate_reason,
    createdByProfileId: r.created_by_profile_id,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
    status: r.status,
    notes: r.notes,
    category: {
      id: r.category_id,
      label: r.category_label,
      slug: r.category_slug,
      emoji: r.category_emoji,
      color: r.category_color,
    },
    primaryChild: r.child_first_name
      ? {
          firstName: r.child_first_name,
          lastName: r.child_last_name!,
          emoji: r.child_emoji,
        }
      : null,
    createdBy: {
      id: r.created_by_profile_id,
      firstName: r.creator_first_name,
      lastName: r.creator_last_name,
    },
  }));
}
