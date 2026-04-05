-- CreateEnum
CREATE TYPE "MessageSharedContentType" AS ENUM ('expense', 'event', 'note');

-- CreateTable: notes
CREATE TABLE "notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "child_id" UUID,
    "created_by_profile_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: message_shared_contents
CREATE TABLE "message_shared_contents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "content_type" "MessageSharedContentType" NOT NULL,
    "expense_id" UUID,
    "event_id" UUID,
    "note_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "message_shared_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable: message_attachments
CREATE TABLE "message_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_url" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notes_household_id_idx" ON "notes"("household_id");

-- CreateIndex: message_shared_contents unique on message_id (one shared content per message)
CREATE UNIQUE INDEX "message_shared_contents_message_id_key" ON "message_shared_contents"("message_id");

-- CreateIndex
CREATE INDEX "message_shared_contents_household_id_idx" ON "message_shared_contents"("household_id");

-- CreateIndex
CREATE INDEX "message_shared_contents_message_id_idx" ON "message_shared_contents"("message_id");

-- CreateIndex
CREATE INDEX "message_attachments_message_id_idx" ON "message_attachments"("message_id");

-- CreateIndex
CREATE INDEX "message_attachments_household_id_idx" ON "message_attachments"("household_id");

-- AddForeignKey: notes
ALTER TABLE "notes" ADD CONSTRAINT "notes_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notes" ADD CONSTRAINT "notes_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notes" ADD CONSTRAINT "notes_created_by_profile_id_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: message_shared_contents
ALTER TABLE "message_shared_contents" ADD CONSTRAINT "message_shared_contents_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "message_shared_contents" ADD CONSTRAINT "message_shared_contents_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "message_shared_contents" ADD CONSTRAINT "message_shared_contents_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "message_shared_contents" ADD CONSTRAINT "message_shared_contents_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "message_shared_contents" ADD CONSTRAINT "message_shared_contents_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: message_attachments
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
