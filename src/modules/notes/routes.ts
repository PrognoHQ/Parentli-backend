import { Router } from "express";
import { authMiddleware } from "../../middleware/auth";
import { tenantMiddleware } from "../../middleware/tenant";
import { requireCapability } from "../../lib/permissions";
import * as controller from "./controller";

const router = Router();

const auth = authMiddleware;
const tenant = tenantMiddleware();
const canRead = requireCapability("conversations:read");
const canWrite = requireCapability("conversations:write");

// POST /api/notes — create a note
router.post("/", auth, tenant, canWrite, controller.create);

// GET /api/notes — list notes
router.get("/", auth, tenant, canRead, controller.list);

// GET /api/notes/:id — get a note
router.get("/:id", auth, tenant, canRead, controller.get);

// PATCH /api/notes/:id — update a note
router.patch("/:id", auth, tenant, canWrite, controller.update);

// DELETE /api/notes/:id — delete a note
router.delete("/:id", auth, tenant, canWrite, controller.remove);

export default router;
