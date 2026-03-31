import express from "express";
import cors from "cors";
import helmet from "helmet";

import { CORS_ORIGIN } from "./lib/config";
import { errorHandler } from "./middleware/errorHandler";

import authRoutes from "./modules/auth/routes";
import profileRoutes from "./modules/profiles/routes";
import householdRoutes from "./modules/household/routes";
import inviteRoutes from "./modules/invites/routes";
import onboardingRoutes from "./modules/onboarding/routes";
import settingsRoutes from "./modules/settings/routes";
import categoryRoutes from "./modules/categories/routes";
import bootstrapRoutes from "./modules/bootstrap/routes";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/households", householdRoutes);
app.use("/api/invites", inviteRoutes);
app.use("/api/onboarding", onboardingRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/bootstrap", bootstrapRoutes);

app.use(errorHandler);

export default app;
