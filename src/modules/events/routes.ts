import { Router, Request, Response, NextFunction } from "express";
import { authMiddleware } from "../../middleware/auth";
import { tenantMiddleware } from "../../middleware/tenant";
import { requireCapability } from "../../lib/permissions";
import { INTERNAL_API_KEY } from "../../lib/config";
import { AppError } from "../../types";
import * as controller from "./controller";

const router = Router();

const auth = authMiddleware;
const tenant = tenantMiddleware();
const canRead = requireCapability("events:read");
const canWrite = requireCapability("events:write");

function requireInternalKey(req: Request, _res: Response, next: NextFunction): void {
  const key = req.headers["x-internal-api-key"] as string | undefined;
  if (!INTERNAL_API_KEY || !key || key !== INTERNAL_API_KEY) {
    return next(new AppError("Unauthorized. Internal API key required.", 403));
  }
  next();
}

// Event CRUD
router.post("/", auth, tenant, canWrite, controller.create);
router.get("/", auth, tenant, canRead, controller.listByRange);
router.get("/upcoming", auth, tenant, canRead, controller.getUpcoming);
router.get("/inbox", auth, tenant, canRead, controller.getInbox);

// Tacit consent processor (internal-only, secured by API key)
router.post("/admin/process-expired-approvals", requireInternalKey, controller.processExpired);

// Event detail + update + delete
router.get("/:id", auth, tenant, canRead, controller.getDetail);
router.put("/:id", auth, tenant, canWrite, controller.update);
router.delete("/:id", auth, tenant, canWrite, controller.remove);

// Approval actions
router.post("/:id/approve", auth, tenant, canWrite, controller.approve);
router.post("/:id/reject", auth, tenant, canWrite, controller.reject);

// Checklist operations
router.post("/:id/checklist", auth, tenant, canWrite, controller.addChecklistItem);
router.put("/:id/checklist/reorder", auth, tenant, canWrite, controller.reorderChecklistItems);
router.put("/:id/checklist/:itemId", auth, tenant, canWrite, controller.updateChecklistItem);
router.post("/:id/checklist/:itemId/toggle", auth, tenant, canWrite, controller.toggleChecklistItem);
router.delete("/:id/checklist/:itemId", auth, tenant, canWrite, controller.deleteChecklistItem);

export default router;
