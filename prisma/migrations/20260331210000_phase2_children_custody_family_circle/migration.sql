-- CreateEnum
CREATE TYPE "FamilyCircleRole" AS ENUM ('viewer', 'contributor', 'carer');

-- CreateEnum
CREATE TYPE "FamilyCircleAccessType" AS ENUM ('ongoing', 'custom_date');

-- CreateEnum
CREATE TYPE "FamilyCircleMemberStatus" AS ENUM ('pending', 'active', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "ParentRole" AS ENUM ('owner', 'coparent');

-- CreateTable
CREATE TABLE "children" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "dob" DATE NOT NULL,
    "emoji" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "photo_url" TEXT,
    "allergy_note" TEXT,
    "created_by_profile_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "children_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_school_care" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "school_name" TEXT,
    "teacher_name" TEXT,
    "hours" TEXT,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "child_school_care_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_medical" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "pediatrician" TEXT,
    "pediatrician_phone" TEXT,
    "hospital" TEXT,
    "blood_type" TEXT,
    "medications" JSONB NOT NULL DEFAULT '[]',
    "allergies" JSONB NOT NULL DEFAULT '[]',
    "insurance" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "child_medical_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "initial" TEXT,
    "color" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custody_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "pattern_type" TEXT,
    "first_day_of_week" SMALLINT NOT NULL DEFAULT 1,
    "handoff_time_default" TEXT,
    "effective_from" DATE,
    "effective_to" DATE,
    "created_by_profile_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custody_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custody_schedule_days" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "custody_schedule_id" UUID NOT NULL,
    "week_index" INTEGER NOT NULL,
    "day_index" INTEGER NOT NULL,
    "assigned_parent_role" "ParentRole" NOT NULL,
    "is_handoff_day" BOOLEAN NOT NULL DEFAULT false,
    "handoff_time" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custody_schedule_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handoff_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "custody_schedule_id" UUID,
    "reminders_enabled" BOOLEAN NOT NULL DEFAULT true,
    "reminder_day_before" BOOLEAN NOT NULL DEFAULT true,
    "reminder_two_hours_before" BOOLEAN NOT NULL DEFAULT true,
    "default_location" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "handoff_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_circle_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "relationship" TEXT NOT NULL,
    "role" "FamilyCircleRole" NOT NULL,
    "access_type" "FamilyCircleAccessType" NOT NULL,
    "access_starts_at" TIMESTAMP(3),
    "access_ends_at" TIMESTAMP(3),
    "status" "FamilyCircleMemberStatus" NOT NULL DEFAULT 'pending',
    "invite_code" TEXT,
    "invited_by_profile_id" UUID,
    "joined_profile_id" UUID,
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "family_circle_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_circle_member_children" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "family_circle_member_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_circle_member_children_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_circle_activity_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "family_circle_member_id" UUID NOT NULL,
    "child_id" UUID,
    "actor_profile_id" UUID,
    "action" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_circle_activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "child_school_care_child_id_key" ON "child_school_care"("child_id");

-- CreateIndex
CREATE UNIQUE INDEX "child_medical_child_id_key" ON "child_medical"("child_id");

-- CreateIndex
CREATE UNIQUE INDEX "custody_schedule_days_custody_schedule_id_week_index_day_ind_key" ON "custody_schedule_days"("custody_schedule_id", "week_index", "day_index");

-- CreateIndex
CREATE UNIQUE INDEX "handoff_preferences_custody_schedule_id_key" ON "handoff_preferences"("custody_schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "family_circle_members_invite_code_key" ON "family_circle_members"("invite_code");

-- CreateIndex
CREATE UNIQUE INDEX "family_circle_member_children_family_circle_member_id_child_key" ON "family_circle_member_children"("family_circle_member_id", "child_id");

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_created_by_profile_id_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_school_care" ADD CONSTRAINT "child_school_care_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_school_care" ADD CONSTRAINT "child_school_care_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_medical" ADD CONSTRAINT "child_medical_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_medical" ADD CONSTRAINT "child_medical_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_schedules" ADD CONSTRAINT "custody_schedules_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_schedules" ADD CONSTRAINT "custody_schedules_created_by_profile_id_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_schedule_days" ADD CONSTRAINT "custody_schedule_days_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_schedule_days" ADD CONSTRAINT "custody_schedule_days_custody_schedule_id_fkey" FOREIGN KEY ("custody_schedule_id") REFERENCES "custody_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoff_preferences" ADD CONSTRAINT "handoff_preferences_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoff_preferences" ADD CONSTRAINT "handoff_preferences_custody_schedule_id_fkey" FOREIGN KEY ("custody_schedule_id") REFERENCES "custody_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_circle_members" ADD CONSTRAINT "family_circle_members_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_circle_members" ADD CONSTRAINT "family_circle_members_invited_by_profile_id_fkey" FOREIGN KEY ("invited_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_circle_members" ADD CONSTRAINT "family_circle_members_joined_profile_id_fkey" FOREIGN KEY ("joined_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_circle_member_children" ADD CONSTRAINT "family_circle_member_children_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_circle_member_children" ADD CONSTRAINT "family_circle_member_children_family_circle_member_id_fkey" FOREIGN KEY ("family_circle_member_id") REFERENCES "family_circle_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_circle_member_children" ADD CONSTRAINT "family_circle_member_children_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_circle_activity_log" ADD CONSTRAINT "family_circle_activity_log_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_circle_activity_log" ADD CONSTRAINT "family_circle_activity_log_family_circle_member_id_fkey" FOREIGN KEY ("family_circle_member_id") REFERENCES "family_circle_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_circle_activity_log" ADD CONSTRAINT "family_circle_activity_log_actor_profile_id_fkey" FOREIGN KEY ("actor_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
