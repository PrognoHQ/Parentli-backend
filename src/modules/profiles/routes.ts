import { Router } from "express";
import { authMiddleware } from "../../middleware/auth";
import * as controller from "./controller";

const router = Router();

router.get("/me", authMiddleware, controller.getMe);
router.put("/me", authMiddleware, controller.updateMe);

export default router;
