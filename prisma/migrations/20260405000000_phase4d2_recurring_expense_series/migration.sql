-- Phase 4D2: Recurring Expense Series
-- Adds ExpenseSeries model, links expenses to series, and adds recurrence timeline entry types.

-- New enum for series frequency
CREATE TYPE "ExpenseSeriesFrequency" AS ENUM ('weekly', 'biweekly', 'monthly');

-- New timeline entry types for recurrence operations
ALTER TYPE "ExpenseTimelineEntryType" ADD VALUE 'series_created';
ALTER TYPE "ExpenseTimelineEntryType" ADD VALUE 'series_paused';
ALTER TYPE "ExpenseTimelineEntryType" ADD VALUE 'series_resumed';
ALTER TYPE "ExpenseTimelineEntryType" ADD VALUE 'series_archived';
ALTER TYPE "ExpenseTimelineEntryType" ADD VALUE 'detached_from_series';
ALTER TYPE "ExpenseTimelineEntryType" ADD VALUE 'series_future_updated';

-- Create expense_series table
CREATE TABLE "expense_series" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "created_by_profile_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paid_by" "ExpensePaidBy" NOT NULL,
    "child_scope" "ExpenseChildScope" NOT NULL,
    "primary_child_id" UUID,
    "category_id" UUID NOT NULL,
    "split_pct" SMALLINT NOT NULL DEFAULT 50,
    "split_type" "ExpenseSplitType" NOT NULL DEFAULT 'default',
    "split_reason" TEXT,
    "notes" TEXT,
    "reimbursable" BOOLEAN NOT NULL DEFAULT false,
    "frequency" "ExpenseSeriesFrequency" NOT NULL,
    "interval_count" INTEGER NOT NULL DEFAULT 1,
    "day_of_month" SMALLINT,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "next_generation_date" DATE,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_series_pkey" PRIMARY KEY ("id")
);

-- Add series linkage columns to expenses
ALTER TABLE "expenses" ADD COLUMN "series_id" UUID;
ALTER TABLE "expenses" ADD COLUMN "series_instance_date" DATE;
ALTER TABLE "expenses" ADD COLUMN "is_detached_from_series" BOOLEAN NOT NULL DEFAULT false;

-- Foreign keys for expense_series
ALTER TABLE "expense_series" ADD CONSTRAINT "expense_series_household_id_fkey"
    FOREIGN KEY ("household_id") REFERENCES "households"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "expense_series" ADD CONSTRAINT "expense_series_created_by_profile_id_fkey"
    FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "expense_series" ADD CONSTRAINT "expense_series_primary_child_id_fkey"
    FOREIGN KEY ("primary_child_id") REFERENCES "children"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "expense_series" ADD CONSTRAINT "expense_series_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "categories"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign key from expenses to expense_series
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_series_id_fkey"
    FOREIGN KEY ("series_id") REFERENCES "expense_series"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes for expense_series
CREATE INDEX "expense_series_household_id_idx" ON "expense_series"("household_id");
CREATE INDEX "expense_series_household_id_paused_idx" ON "expense_series"("household_id", "paused");

-- Index for expense series lookups
CREATE INDEX "expenses_series_id_series_instance_date_idx" ON "expenses"("series_id", "series_instance_date");

-- Partial unique index to prevent duplicate instance generation
-- Only enforced when series_id and series_instance_date are both non-null and expense is not soft-deleted
CREATE UNIQUE INDEX "expenses_series_instance_unique"
    ON "expenses" ("series_id", "series_instance_date")
    WHERE "series_id" IS NOT NULL AND "series_instance_date" IS NOT NULL AND "deleted_at" IS NULL;
