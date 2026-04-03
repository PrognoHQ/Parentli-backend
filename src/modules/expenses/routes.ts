import { Router } from "express";
import { authMiddleware } from "../../middleware/auth";
import { tenantMiddleware } from "../../middleware/tenant";
import { requireCapability } from "../../lib/permissions";
import * as controller from "./controller";

const router = Router();

const auth = authMiddleware;
const tenant = tenantMiddleware();
const canRead = requireCapability("expenses:read");
const canWrite = requireCapability("expenses:write");
const canApprove = requireCapability("expenses:approve");

// Named routes must be defined before /:id to avoid route conflict
router.get("/balance/summary", auth, tenant, canRead, controller.balanceSummary);
router.get("/approval-inbox", auth, tenant, canApprove, controller.approvalInbox);

router.post("/", auth, tenant, canWrite, controller.create);
router.get("/", auth, tenant, canRead, controller.list);
router.get("/:id", auth, tenant, canRead, controller.getDetail);
router.put("/:id", auth, tenant, canWrite, controller.update);
router.delete("/:id", auth, tenant, canWrite, controller.remove);
router.post("/:id/approve", auth, tenant, canApprove, controller.approve);
router.post("/:id/reject", auth, tenant, canApprove, controller.reject);

export default router;
