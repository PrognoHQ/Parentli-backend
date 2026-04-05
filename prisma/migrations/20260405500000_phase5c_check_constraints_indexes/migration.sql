-- Phase 5C hardening: CHECK constraints + performance indexes

-- Ensure exactly one of the two polymorphic FK columns is populated,
-- matching the pattern used in conversation_members (Phase 5A).

ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_actor_check"
  CHECK (
    ("actor_kind" = 'profile' AND "actor_profile_id" IS NOT NULL AND "actor_family_circle_member_id" IS NULL) OR
    ("actor_kind" = 'family_circle' AND "actor_family_circle_member_id" IS NOT NULL AND "actor_profile_id" IS NULL)
  );

ALTER TABLE "message_receipts" ADD CONSTRAINT "message_receipts_recipient_check"
  CHECK (
    ("recipient_kind" = 'profile' AND "recipient_profile_id" IS NOT NULL AND "recipient_family_circle_member_id" IS NULL) OR
    ("recipient_kind" = 'family_circle' AND "recipient_family_circle_member_id" IS NOT NULL AND "recipient_profile_id" IS NULL)
  );

-- Composite indexes to speed up inbox LATERAL subqueries at scale.

CREATE INDEX "messages_conversation_created_desc_idx"
  ON "messages" ("conversation_id", "created_at" DESC);

CREATE INDEX "message_receipts_recipient_read_idx"
  ON "message_receipts" ("recipient_profile_id", "read_at");
