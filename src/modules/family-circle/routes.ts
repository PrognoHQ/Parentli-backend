import { Router } from "express";
import { authMiddleware } from "../../middleware/auth";
import { tenantMiddleware } from "../../middleware/tenant";
import * as controller from "./controller";

const router = Router();

const auth = authMiddleware;
const tenant = tenantMiddleware();

router.post("/members", auth, tenant, controller.createMember);
router.get("/members", auth, tenant, controller.listMembers);
router.get("/members/:id", auth, tenant, controller.getMember);
router.put("/members/:id", auth, tenant, controller.updateMember);
router.post("/members/:id/revoke", auth, tenant, controller.revokeMember);
router.put("/members/:id/children", auth, tenant, controller.assignChildren);
router.get("/activity-log", auth, tenant, controller.getActivityLog);

export default router;
