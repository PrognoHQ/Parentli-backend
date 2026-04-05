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
import childrenRoutes from "./modules/children/routes";
import custodyRoutes from "./modules/custody/routes";
import familyCircleRoutes from "./modules/family-circle/routes";
import emergencyCardRoutes from "./modules/emergency-card/routes";
import eventRoutes from "./modules/events/routes";
import expenseRoutes from "./modules/expenses/routes";
import conversationRoutes from "./modules/conversations/routes";
import messageRoutes from "./modules/messages/routes";

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
app.use("/api/children", childrenRoutes);
app.use("/api/custody", custodyRoutes);
app.use("/api/family-circle", familyCircleRoutes);
app.use("/api/emergency-card", emergencyCardRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/messages", messageRoutes);

app.use(errorHandler);

export default app;
