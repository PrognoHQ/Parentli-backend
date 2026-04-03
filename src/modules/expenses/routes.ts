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

// Balance summary must be defined before /:id to avoid route conflict
router.get("/balance/summary", auth, tenant, canRead, controller.balanceSummary);

router.post("/", auth, tenant, canWrite, controller.create);
router.get("/", auth, tenant, canRead, controller.list);
router.get("/:id", auth, tenant, canRead, controller.getDetail);
router.put("/:id", auth, tenant, canWrite, controller.update);
router.delete("/:id", auth, tenant, canWrite, controller.remove);

export default router;
