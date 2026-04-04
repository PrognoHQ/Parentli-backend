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
const canSettle = requireCapability("expenses:settle");
const canReimburse = requireCapability("expenses:reimburse");

// Named routes must be defined before /:id to avoid route conflict
router.get("/balance/summary", auth, tenant, canRead, controller.balanceSummary);
router.get("/approval-inbox", auth, tenant, canApprove, controller.approvalInbox);

// Recurring series routes (before /:id to avoid conflicts)
router.post("/series", auth, tenant, canWrite, controller.createSeriesHandler);
router.get("/series", auth, tenant, canRead, controller.listSeriesHandler);
router.get("/series/:seriesId", auth, tenant, canRead, controller.getSeriesDetailHandler);
router.put("/series/:seriesId", auth, tenant, canWrite, controller.updateSeriesHandler);
router.put("/series/:seriesId/instance/:expenseId", auth, tenant, canWrite, controller.updateSeriesHandler);
router.post("/series/:seriesId/pause", auth, tenant, canWrite, controller.pauseSeriesHandler);
router.post("/series/:seriesId/resume", auth, tenant, canWrite, controller.resumeSeriesHandler);
router.post("/series/:seriesId/archive", auth, tenant, canWrite, controller.archiveSeriesHandler);
router.post("/series/:seriesId/generate", auth, tenant, canWrite, controller.generateSeriesHandler);

router.post("/", auth, tenant, canWrite, controller.create);
router.get("/", auth, tenant, canRead, controller.list);
router.get("/:id", auth, tenant, canRead, controller.getDetail);
router.put("/:id", auth, tenant, canWrite, controller.update);
router.delete("/:id", auth, tenant, canWrite, controller.remove);
router.post("/:id/approve", auth, tenant, canApprove, controller.approve);
router.post("/:id/reject", auth, tenant, canApprove, controller.reject);
router.put("/:id/reimbursement", auth, tenant, canReimburse, controller.updateReimbursement);
router.post("/:id/settle", auth, tenant, canSettle, controller.settle);
router.put("/:id/settlement", auth, tenant, canSettle, controller.updateSettlement);

export default router;
