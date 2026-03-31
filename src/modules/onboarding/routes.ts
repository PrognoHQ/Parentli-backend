import { Router } from "express";
import { authMiddleware } from "../../middleware/auth";
import { tenantMiddleware } from "../../middleware/tenant";
import * as controller from "./controller";

const router = Router();

router.get("/", authMiddleware, tenantMiddleware(), controller.get);
router.put("/", authMiddleware, tenantMiddleware(), controller.update);

export default router;
