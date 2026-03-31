import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as controller from "./controller";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again later." },
});

const router = Router();

router.post("/register", authLimiter, controller.register);
router.post("/login", authLimiter, controller.login);

export default router;
