import { Router } from "express";
import { authMiddleware } from "../../middleware/auth";
import { tenantMiddleware } from "../../middleware/tenant";
import { requireCapability } from "../../lib/permissions";
import * as controller from "./controller";
import * as messageController from "../messages/controller";

const router = Router();

const auth = authMiddleware;
const tenant = tenantMiddleware();
const canRead = requireCapability("conversations:read");
const canWrite = requireCapability("conversations:write");

router.post("/coparent", auth, tenant, canWrite, controller.getOrCreateCoparent);
router.post("/groups", auth, tenant, canWrite, controller.createGroup);
router.get("/", auth, tenant, canRead, controller.list);
router.get("/:id", auth, tenant, canRead, controller.getDetail);

// Phase 5B: List messages in a conversation
router.get("/:id/messages", auth, tenant, canRead, messageController.listByConversation);

export default router;
