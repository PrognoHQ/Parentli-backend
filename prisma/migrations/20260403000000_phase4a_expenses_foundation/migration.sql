-- CreateEnum
CREATE TYPE "ExpenseChildScope" AS ENUM ('both', 'single');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('draft', 'awaiting', 'approved', 'rejected', 'settled');

-- CreateEnum
CREATE TYPE "ExpensePaidBy" AS ENUM ('owner', 'coparent');

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "created_by_profile_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paid_by" "ExpensePaidBy" NOT NULL,
    "date" DATE NOT NULL,
    "child_scope" "ExpenseChildScope" NOT NULL,
    "primary_child_id" UUID,
    "category_id" UUID NOT NULL,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'draft',
    "split_pct" SMALLINT NOT NULL DEFAULT 50,
    "notes" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expenses_household_id_date_idx" ON "expenses"("household_id", "date");

-- CreateIndex
CREATE INDEX "expenses_household_id_status_idx" ON "expenses"("household_id", "status");

-- CreateIndex
CREATE INDEX "expenses_household_id_category_id_idx" ON "expenses"("household_id", "category_id");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_profile_id_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_primary_child_id_fkey" FOREIGN KEY ("primary_child_id") REFERENCES "children"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
