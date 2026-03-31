import { Router } from "express";
import { authMiddleware } from "../../middleware/auth";
import { tenantMiddleware } from "../../middleware/tenant";
import { requireCapability } from "../../lib/permissions";
import * as controller from "./controller";

const router = Router();

const auth = authMiddleware;
const tenant = tenantMiddleware();
const canRead = requireCapability("custody:read");
const canWrite = requireCapability("custody:write");

router.post("/schedules", auth, tenant, canWrite, controller.createOrReplaceSchedule);
router.get("/schedules/active", auth, tenant, canRead, controller.getActiveSchedule);
router.get("/handoff-preferences", auth, tenant, canRead, controller.getHandoffPreferences);
router.put("/handoff-preferences", auth, tenant, canWrite, controller.upsertHandoffPreferences);

export default router;
