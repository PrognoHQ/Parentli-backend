-- Phase 4C2: Expense Approval Actions + Approval Inbox

-- AlterTable: Add approval resolution fields to expenses
ALTER TABLE "expenses"
ADD COLUMN "approved_at" TIMESTAMP(3),
ADD COLUMN "approved_by_profile_id" UUID,
ADD COLUMN "rejected_at" TIMESTAMP(3),
ADD COLUMN "rejected_by_profile_id" UUID,
ADD COLUMN "rejection_reason" TEXT;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approved_by_profile_id_fkey" FOREIGN KEY ("approved_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_rejected_by_profile_id_fkey" FOREIGN KEY ("rejected_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "ExpenseTimelineEntryType" AS ENUM ('created', 'submitted_for_approval', 'approved', 'rejected', 'updated', 'approval_requirement_removed');

-- CreateEnum
CREATE TYPE "ExpenseTimelineColor" AS ENUM ('sage', 'gold', 'terracotta', 'muted');

-- CreateTable
CREATE TABLE "expense_timeline_entries" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "expense_id" UUID NOT NULL,
    "actor_profile_id" UUID,
    "entry_type" "ExpenseTimelineEntryType" NOT NULL,
    "label" TEXT NOT NULL,
    "detail" TEXT,
    "color" "ExpenseTimelineColor" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_timeline_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expense_timeline_entries_expense_id_idx" ON "expense_timeline_entries"("expense_id");

-- AddForeignKey
ALTER TABLE "expense_timeline_entries" ADD CONSTRAINT "expense_timeline_entries_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_timeline_entries" ADD CONSTRAINT "expense_timeline_entries_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_timeline_entries" ADD CONSTRAINT "expense_timeline_entries_actor_profile_id_fkey" FOREIGN KEY ("actor_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
