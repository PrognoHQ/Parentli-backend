-- CreateEnum
CREATE TYPE "ReimbursementStatus" AS ENUM ('none', 'awaiting_reimb', 'partial', 'fully_received');

-- CreateEnum
CREATE TYPE "ExpenseSplitType" AS ENUM ('default', 'category', 'custom');

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN "split_type" "ExpenseSplitType" NOT NULL DEFAULT 'default',
ADD COLUMN "split_reason" TEXT,
ADD COLUMN "reimbursable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reimbursed_amt" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "reimbursement_status" "ReimbursementStatus" NOT NULL DEFAULT 'none';
