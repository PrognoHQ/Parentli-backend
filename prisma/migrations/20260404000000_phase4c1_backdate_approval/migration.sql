-- CreateEnum
CREATE TYPE "ExpenseBackdateCategory" AS ENUM ('recent', 'backdated', 'significant');

-- CreateEnum
CREATE TYPE "ExpenseApprovalTrigger" AS ENUM ('none', 'threshold', 'significant_backdate');

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN "backdate_category" "ExpenseBackdateCategory" NOT NULL DEFAULT 'recent',
ADD COLUMN "backdate_reason" TEXT,
ADD COLUMN "approval_required" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "approval_trigger" "ExpenseApprovalTrigger" NOT NULL DEFAULT 'none';
