-- Enforce at most one active custody schedule per household at the DB level.
CREATE UNIQUE INDEX "custody_schedules_household_id_active_key"
  ON "custody_schedules" ("household_id")
  WHERE "is_active" = true;
