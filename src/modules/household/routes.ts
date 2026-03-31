import { Router } from "express";
import { authMiddleware } from "../../middleware/auth";
import * as controller from "./controller";

const router = Router();

router.post("/", authMiddleware, controller.create);

export default router;
