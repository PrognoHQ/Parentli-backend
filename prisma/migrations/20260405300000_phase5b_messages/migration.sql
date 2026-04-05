-- CreateEnum
CREATE TYPE "MessageSenderKind" AS ENUM ('profile', 'family_circle');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('text', 'expense', 'event', 'image', 'file', 'note');

-- CreateEnum
CREATE TYPE "MessageDeleteMode" AS ENUM ('for_me', 'for_everyone');

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_kind" "MessageSenderKind" NOT NULL,
    "sender_profile_id" UUID,
    "sender_family_circle_member_id" UUID,
    "type" "MessageType" NOT NULL DEFAULT 'text',
    "text" TEXT,
    "reply_to_message_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "edited_at" TIMESTAMP(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_deletions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "actor_kind" "MessageSenderKind" NOT NULL,
    "actor_profile_id" UUID,
    "actor_family_circle_member_id" UUID,
    "delete_mode" "MessageDeleteMode" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_deletions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_household_id_idx" ON "messages"("household_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_deletions_message_id_actor_profile_id_key" ON "message_deletions"("message_id", "actor_profile_id");

-- CreateIndex
CREATE INDEX "message_deletions_household_id_idx" ON "message_deletions"("household_id");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_profile_id_fkey" FOREIGN KEY ("sender_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_family_circle_member_id_fkey" FOREIGN KEY ("sender_family_circle_member_id") REFERENCES "family_circle_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_deletions" ADD CONSTRAINT "message_deletions_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_deletions" ADD CONSTRAINT "message_deletions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_deletions" ADD CONSTRAINT "message_deletions_actor_profile_id_fkey" FOREIGN KEY ("actor_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_deletions" ADD CONSTRAINT "message_deletions_actor_family_circle_member_id_fkey" FOREIGN KEY ("actor_family_circle_member_id") REFERENCES "family_circle_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
