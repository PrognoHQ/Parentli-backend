-- Phase 6A: Add CHECK constraint to enforce exactly one author identity per note.
-- Prevents ambiguous rows where both author fields are NULL or both are SET.

ALTER TABLE "notes" ADD CONSTRAINT "notes_author_check"
  CHECK (
    (author_kind = 'profile' AND author_profile_id IS NOT NULL AND author_family_circle_member_id IS NULL)
    OR
    (author_kind = 'family_circle' AND author_family_circle_member_id IS NOT NULL AND author_profile_id IS NULL)
  );
