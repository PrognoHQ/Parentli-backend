-- Phase 4D1: Reimbursement Workflow + Settlement

-- CreateEnum
CREATE TYPE "ExpenseSettlementMethod" AS ENUM ('venmo', 'zelle', 'bank_transfer', 'paypal', 'cash', 'other');

-- Extend ExpenseTimelineEntryType enum
ALTER TYPE "ExpenseTimelineEntryType" ADD VALUE 'reimbursement_status_updated';
ALTER TYPE "ExpenseTimelineEntryType" ADD VALUE 'reimbursement_amount_updated';
ALTER TYPE "ExpenseTimelineEntryType" ADD VALUE 'settled';
ALTER TYPE "ExpenseTimelineEntryType" ADD VALUE 'settlement_updated';

-- AlterTable: Add reimbursement + settlement fields to expenses
ALTER TABLE "expenses" ADD COLUMN "reimbursement_source" TEXT;
ALTER TABLE "expenses" ADD COLUMN "reimbursed_amt_expected" DECIMAL(10,2);
ALTER TABLE "expenses" ADD COLUMN "settlement_method" "ExpenseSettlementMethod";
ALTER TABLE "expenses" ADD COLUMN "settlement_date" DATE;
ALTER TABLE "expenses" ADD COLUMN "settlement_note" TEXT;
ALTER TABLE "expenses" ADD COLUMN "settled_by_profile_id" UUID;
ALTER TABLE "expenses" ADD COLUMN "settled_at" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_settled_by_profile_id_fkey" FOREIGN KEY ("settled_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
