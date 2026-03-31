import { Router } from "express";
import { authMiddleware } from "../../middleware/auth";
import { tenantMiddleware } from "../../middleware/tenant";
import * as controller from "./controller";

const router = Router();

router.get("/", authMiddleware, tenantMiddleware(), controller.list);
router.post("/", authMiddleware, tenantMiddleware(), controller.create);
router.put("/:id", authMiddleware, tenantMiddleware(), controller.update);

export default router;
