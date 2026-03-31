import { Router } from "express";
import { authMiddleware } from "../../middleware/auth";
import { tenantMiddleware } from "../../middleware/tenant";
import { requireCapability } from "../../lib/permissions";
import * as controller from "./controller";

const router = Router();

const auth = authMiddleware;
const tenant = tenantMiddleware();
const canReadEmergency = requireCapability("emergency:read");

// Parent access: requires household membership with emergency:read capability
router.get("/:childId", auth, tenant, canReadEmergency, controller.getEmergencyCard);

// Family Circle carer access: requires familyCircleMemberId query param
// Access control is handled in the service layer (role + child assignment check)
router.get("/:childId/family", auth, tenant, controller.getEmergencyCardFamily);

export default router;
