import { Router } from "express";
import { authMiddleware } from "../../middleware/auth";
import { tenantMiddleware } from "../../middleware/tenant";
import { requireCapability } from "../../lib/permissions";
import * as controller from "./controller";

const router = Router();

const auth = authMiddleware;
const tenant = tenantMiddleware();
const canWrite = requireCapability("conversations:write");

// POST /api/messages — send a message
router.post("/", auth, tenant, canWrite, controller.send);

// DELETE /api/messages/:id — delete a message (for_me or for_everyone)
router.delete("/:id", auth, tenant, canWrite, controller.remove);

export default router;
