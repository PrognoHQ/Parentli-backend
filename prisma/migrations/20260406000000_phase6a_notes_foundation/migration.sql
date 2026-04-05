-- Phase 6A: Notes Foundation
-- Expands the basic Note model with polymorphic authoring, note types, and richer content fields.

-- CreateEnum
CREATE TYPE "NoteAuthorKind" AS ENUM ('profile', 'family_circle');

-- CreateEnum
CREATE TYPE "NoteType" AS ENUM ('report', 'medical', 'educational', 'therapy', 'general');

-- Step 1: Add new columns (nullable initially for data migration)
ALTER TABLE "notes" ADD COLUMN "author_kind" "NoteAuthorKind";
ALTER TABLE "notes" ADD COLUMN "author_profile_id" UUID;
ALTER TABLE "notes" ADD COLUMN "author_family_circle_member_id" UUID;
ALTER TABLE "notes" ADD COLUMN "note_type" "NoteType";
ALTER TABLE "notes" ADD COLUMN "tag" TEXT;
ALTER TABLE "notes" ADD COLUMN "preview" TEXT;
ALTER TABLE "notes" ADD COLUMN "full_content" TEXT;
ALTER TABLE "notes" ADD COLUMN "important" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "notes" ADD COLUMN "is_family_circle" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "notes" ADD COLUMN "relationship_label" TEXT;
ALTER TABLE "notes" ADD COLUMN "has_attachments" BOOLEAN NOT NULL DEFAULT false;

-- Step 2: Migrate existing data
UPDATE "notes"
SET "author_kind" = 'profile',
    "author_profile_id" = "created_by_profile_id",
    "note_type" = 'general',
    "preview" = "text";

-- Step 3: Make required columns non-nullable
ALTER TABLE "notes" ALTER COLUMN "author_kind" SET NOT NULL;
ALTER TABLE "notes" ALTER COLUMN "note_type" SET NOT NULL;
ALTER TABLE "notes" ALTER COLUMN "preview" SET NOT NULL;

-- Step 4: Make title optional (was required)
ALTER TABLE "notes" ALTER COLUMN "title" DROP NOT NULL;

-- Step 5: Drop old columns
ALTER TABLE "notes" DROP COLUMN "created_by_profile_id";
ALTER TABLE "notes" DROP COLUMN "text";

-- Step 6: Add foreign keys
ALTER TABLE "notes" ADD CONSTRAINT "notes_author_profile_id_fkey"
  FOREIGN KEY ("author_profile_id") REFERENCES "profiles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notes" ADD CONSTRAINT "notes_author_family_circle_member_id_fkey"
  FOREIGN KEY ("author_family_circle_member_id") REFERENCES "family_circle_members"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 7: Drop old index and create new indexes
DROP INDEX IF EXISTS "notes_household_id_idx";

CREATE INDEX "notes_household_id_created_at_idx" ON "notes"("household_id", "created_at" DESC);
CREATE INDEX "notes_household_id_note_type_idx" ON "notes"("household_id", "note_type");
CREATE INDEX "notes_household_id_important_idx" ON "notes"("household_id", "important");
CREATE INDEX "notes_household_id_child_id_idx" ON "notes"("household_id", "child_id");
