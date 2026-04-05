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

// POST /api/messages/:id/reactions — add a reaction
router.post("/:id/reactions", auth, tenant, canWrite, controller.addReaction);

// DELETE /api/messages/:id/reactions — remove a reaction
router.delete("/:id/reactions", auth, tenant, canWrite, controller.removeReaction);

// POST /api/messages/:id/delivered — mark message delivered
router.post("/:id/delivered", auth, tenant, canWrite, controller.markDelivered);

export default router;
