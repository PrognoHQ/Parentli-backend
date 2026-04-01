-- Phase 3: Events, Approvals, Recurrence, Checklists, Tacit Consent

-- CreateEnum
CREATE TYPE "EventChildScope" AS ENUM ('both', 'single');

-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('activity', 'health', 'school', 'handoff', 'other');

-- CreateEnum
CREATE TYPE "EventHealthSubType" AS ENUM ('routine', 'specialist', 'emergency');

-- CreateEnum
CREATE TYPE "EventRecurrenceType" AS ENUM ('none', 'daily', 'weekly', 'biweekly', 'monthly');

-- CreateEnum
CREATE TYPE "EventApprovalStatus" AS ENUM ('none', 'pending', 'approved', 'rejected', 'auto_approved');

-- CreateEnum
CREATE TYPE "EventTimelineEntryType" AS ENUM ('created', 'approval_requested', 'approved', 'rejected', 'auto_approved', 'updated', 'counter_proposed');

-- CreateEnum
CREATE TYPE "EventTimelineColor" AS ENUM ('sage', 'gold', 'terracotta', 'muted');

-- CreateEnum
CREATE TYPE "EventApprovalRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'auto_approved', 'cancelled');

-- CreateEnum
CREATE TYPE "EventNotificationType" AS ENUM ('event_created', 'approval_requested', 'event_approved', 'event_rejected', 'event_auto_approved', 'event_updated');

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "created_by_profile_id" UUID NOT NULL,
    "updated_by_profile_id" UUID,
    "title" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "child_scope" "EventChildScope" NOT NULL,
    "primary_child_id" UUID,
    "category" "EventCategory" NOT NULL,
    "health_sub_type" "EventHealthSubType",
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "notes" TEXT,
    "notify" BOOLEAN NOT NULL DEFAULT true,
    "recurrence_type" "EventRecurrenceType" NOT NULL DEFAULT 'none',
    "recurrence_until" TIMESTAMP(3),
    "recurrence_parent_event_id" UUID,
    "approval_status" "EventApprovalStatus" NOT NULL DEFAULT 'none',
    "approval_deadline_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "approved_by_profile_id" UUID,
    "auto_approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "rejected_by_profile_id" UUID,
    "rejection_reason" TEXT,
    "rejection_counter_type" TEXT,
    "rejection_counter_value" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_checklist_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "checked_at" TIMESTAMP(3),
    "checked_by_profile_id" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_by_profile_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_timeline_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "actor_profile_id" UUID,
    "entry_type" "EventTimelineEntryType" NOT NULL,
    "label" TEXT NOT NULL,
    "detail" TEXT,
    "color" "EventTimelineColor" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_timeline_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_approval_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "requested_by_profile_id" UUID NOT NULL,
    "requested_to_profile_id" UUID,
    "status" "EventApprovalRequestStatus" NOT NULL DEFAULT 'pending',
    "deadline_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_profile_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "type" "EventNotificationType" NOT NULL,
    "target_profile_id" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "event_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_household_id_start_at_idx" ON "events"("household_id", "start_at");

-- CreateIndex
CREATE INDEX "events_household_id_approval_status_idx" ON "events"("household_id", "approval_status");

-- CreateIndex
CREATE INDEX "events_recurrence_parent_event_id_idx" ON "events"("recurrence_parent_event_id");

-- CreateIndex
CREATE INDEX "event_checklist_items_event_id_idx" ON "event_checklist_items"("event_id");

-- CreateIndex
CREATE INDEX "event_timeline_entries_event_id_idx" ON "event_timeline_entries"("event_id");

-- CreateIndex
CREATE INDEX "event_approval_requests_event_id_status_idx" ON "event_approval_requests"("event_id", "status");

-- CreateIndex
CREATE INDEX "event_approval_requests_requested_to_profile_id_status_idx" ON "event_approval_requests"("requested_to_profile_id", "status");

-- CreateIndex
CREATE INDEX "event_notifications_event_id_idx" ON "event_notifications"("event_id");

-- CreateIndex
CREATE INDEX "event_notifications_processed_at_idx" ON "event_notifications"("processed_at");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_profile_id_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_updated_by_profile_id_fkey" FOREIGN KEY ("updated_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_approved_by_profile_id_fkey" FOREIGN KEY ("approved_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_rejected_by_profile_id_fkey" FOREIGN KEY ("rejected_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_primary_child_id_fkey" FOREIGN KEY ("primary_child_id") REFERENCES "children"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_recurrence_parent_event_id_fkey" FOREIGN KEY ("recurrence_parent_event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_checklist_items" ADD CONSTRAINT "event_checklist_items_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_checklist_items" ADD CONSTRAINT "event_checklist_items_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_checklist_items" ADD CONSTRAINT "event_checklist_items_checked_by_profile_id_fkey" FOREIGN KEY ("checked_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_checklist_items" ADD CONSTRAINT "event_checklist_items_created_by_profile_id_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_timeline_entries" ADD CONSTRAINT "event_timeline_entries_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_timeline_entries" ADD CONSTRAINT "event_timeline_entries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_timeline_entries" ADD CONSTRAINT "event_timeline_entries_actor_profile_id_fkey" FOREIGN KEY ("actor_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_approval_requests" ADD CONSTRAINT "event_approval_requests_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_approval_requests" ADD CONSTRAINT "event_approval_requests_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_approval_requests" ADD CONSTRAINT "event_approval_requests_requested_by_profile_id_fkey" FOREIGN KEY ("requested_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_approval_requests" ADD CONSTRAINT "event_approval_requests_requested_to_profile_id_fkey" FOREIGN KEY ("requested_to_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_approval_requests" ADD CONSTRAINT "event_approval_requests_resolved_by_profile_id_fkey" FOREIGN KEY ("resolved_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_notifications" ADD CONSTRAINT "event_notifications_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_notifications" ADD CONSTRAINT "event_notifications_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
