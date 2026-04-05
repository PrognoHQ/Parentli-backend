-- Phase 5C: Message Reactions & Receipts

-- CreateEnum
CREATE TYPE "MessageReactionActorKind" AS ENUM ('profile', 'family_circle');

-- CreateEnum
CREATE TYPE "MessageReceiptRecipientKind" AS ENUM ('profile', 'family_circle');

-- CreateTable
CREATE TABLE "message_reactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "actor_kind" "MessageReactionActorKind" NOT NULL,
    "actor_profile_id" UUID,
    "actor_family_circle_member_id" UUID,
    "emoji" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "recipient_kind" "MessageReceiptRecipientKind" NOT NULL,
    "recipient_profile_id" UUID,
    "recipient_family_circle_member_id" UUID,
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: standard indexes
CREATE INDEX "message_reactions_message_id_idx" ON "message_reactions"("message_id");
CREATE INDEX "message_reactions_household_id_idx" ON "message_reactions"("household_id");

CREATE INDEX "message_receipts_message_id_idx" ON "message_receipts"("message_id");
CREATE INDEX "message_receipts_household_id_idx" ON "message_receipts"("household_id");
CREATE INDEX "message_receipts_recipient_profile_id_idx" ON "message_receipts"("recipient_profile_id");

-- Partial unique indexes for reactions (handles nullable actor columns)
CREATE UNIQUE INDEX "message_reactions_profile_unique"
    ON "message_reactions" ("message_id", "actor_profile_id", "emoji")
    WHERE "actor_profile_id" IS NOT NULL;

CREATE UNIQUE INDEX "message_reactions_fc_unique"
    ON "message_reactions" ("message_id", "actor_family_circle_member_id", "emoji")
    WHERE "actor_family_circle_member_id" IS NOT NULL;

-- Partial unique indexes for receipts (one receipt per recipient per message)
CREATE UNIQUE INDEX "message_receipts_profile_unique"
    ON "message_receipts" ("message_id", "recipient_profile_id")
    WHERE "recipient_profile_id" IS NOT NULL;

CREATE UNIQUE INDEX "message_receipts_fc_unique"
    ON "message_receipts" ("message_id", "recipient_family_circle_member_id")
    WHERE "recipient_family_circle_member_id" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_actor_profile_id_fkey" FOREIGN KEY ("actor_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_actor_family_circle_member_id_fkey" FOREIGN KEY ("actor_family_circle_member_id") REFERENCES "family_circle_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "message_receipts" ADD CONSTRAINT "message_receipts_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "message_receipts" ADD CONSTRAINT "message_receipts_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "message_receipts" ADD CONSTRAINT "message_receipts_recipient_profile_id_fkey" FOREIGN KEY ("recipient_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "message_receipts" ADD CONSTRAINT "message_receipts_recipient_family_circle_member_id_fkey" FOREIGN KEY ("recipient_family_circle_member_id") REFERENCES "family_circle_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
