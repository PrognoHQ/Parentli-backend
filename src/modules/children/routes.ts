import { Router } from "express";
import { authMiddleware } from "../../middleware/auth";
import { tenantMiddleware } from "../../middleware/tenant";
import { requireCapability } from "../../lib/permissions";
import * as controller from "./controller";

const router = Router();

const auth = authMiddleware;
const tenant = tenantMiddleware();
const canRead = requireCapability("children:read");
const canWrite = requireCapability("children:write");
const canReadMedical = requireCapability("medical:read");
const canWriteMedical = requireCapability("medical:write");
const canReadSchool = requireCapability("school_care:read");
const canWriteSchool = requireCapability("school_care:write");
const canReadEmergency = requireCapability("emergency:read");
const canWriteEmergency = requireCapability("emergency:write");

// Children CRUD
router.post("/", auth, tenant, canWrite, controller.create);
router.get("/", auth, tenant, canRead, controller.list);
router.get("/:id", auth, tenant, canRead, controller.getById);
router.put("/:id", auth, tenant, canWrite, controller.update);

// School / Care
router.put("/:id/school-care", auth, tenant, canWriteSchool, controller.upsertSchoolCare);
router.get("/:id/school-care", auth, tenant, canReadSchool, controller.getSchoolCare);

// Medical
router.put("/:id/medical", auth, tenant, canWriteMedical, controller.upsertMedical);
router.get("/:id/medical", auth, tenant, canReadMedical, controller.getMedical);

// Emergency Contacts
router.get("/:id/emergency-contacts", auth, tenant, canReadEmergency, controller.listEmergencyContacts);
router.post("/:id/emergency-contacts", auth, tenant, canWriteEmergency, controller.createEmergencyContact);
router.put("/:id/emergency-contacts/reorder", auth, tenant, canWriteEmergency, controller.reorderEmergencyContacts);
router.put("/:id/emergency-contacts/:contactId", auth, tenant, canWriteEmergency, controller.updateEmergencyContact);
router.delete("/:id/emergency-contacts/:contactId", auth, tenant, canWriteEmergency, controller.deleteEmergencyContact);

export default router;
