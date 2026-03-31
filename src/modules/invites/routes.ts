import { Router } from "express";
import { authMiddleware } from "../../middleware/auth";
import { tenantMiddleware } from "../../middleware/tenant";
import * as controller from "./controller";

const router = Router();

router.get("/", authMiddleware, tenantMiddleware(), controller.list);
router.post("/", authMiddleware, tenantMiddleware(), controller.create);
router.get("/:code/validate", controller.validate);
router.post("/:code/accept", authMiddleware, controller.accept);
router.post("/:code/revoke", authMiddleware, tenantMiddleware(), controller.revoke);

export default router;
