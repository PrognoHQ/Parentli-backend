-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('coparent', 'group');

-- CreateEnum
CREATE TYPE "ConversationPurposeBadge" AS ENUM ('coordination', 'medical', 'school', 'general');

-- CreateEnum
CREATE TYPE "ConversationMemberKind" AS ENUM ('profile', 'family_circle');

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "type" "ConversationType" NOT NULL,
    "name" TEXT,
    "purpose_badge" "ConversationPurposeBadge",
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_by_profile_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "member_kind" "ConversationMemberKind" NOT NULL,
    "profile_id" UUID,
    "family_circle_member_id" UUID,
    "role" TEXT,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_profile_id_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_family_circle_member_id_fkey" FOREIGN KEY ("family_circle_member_id") REFERENCES "family_circle_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CHECK: exactly one of profile_id or family_circle_member_id must be set
ALTER TABLE "conversation_members"
  ADD CONSTRAINT "chk_conversation_member_kind"
  CHECK (
    (profile_id IS NOT NULL AND family_circle_member_id IS NULL)
    OR
    (profile_id IS NULL AND family_circle_member_id IS NOT NULL)
  );

-- Partial unique: one active profile membership per conversation
CREATE UNIQUE INDEX "uq_conv_member_profile_active"
  ON "conversation_members" ("conversation_id", "profile_id")
  WHERE profile_id IS NOT NULL AND left_at IS NULL;

-- Partial unique: one active family circle membership per conversation
CREATE UNIQUE INDEX "uq_conv_member_fc_active"
  ON "conversation_members" ("conversation_id", "family_circle_member_id")
  WHERE family_circle_member_id IS NOT NULL AND left_at IS NULL;

-- Partial unique: at most one active coparent conversation per household
CREATE UNIQUE INDEX "uq_household_coparent_conversation"
  ON "conversations" ("household_id")
  WHERE type = 'coparent' AND deleted_at IS NULL;
