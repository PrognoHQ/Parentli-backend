-- AddForeignKey
ALTER TABLE "event_notifications" ADD CONSTRAINT "event_notifications_target_profile_id_fkey" FOREIGN KEY ("target_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
