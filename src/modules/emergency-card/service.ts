import { prisma } from "../../lib/prisma";
import { AppError } from "../../types";
import { hasFamilyCircleCapability } from "../../lib/permissions";

function isAccessExpired(member: {
  accessType: string;
  accessEndsAt: Date | null;
}): boolean {
  return (
    member.accessType === "custom_date" &&
    member.accessEndsAt !== null &&
    member.accessEndsAt < new Date()
  );
}

interface EmergencyCardContact {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  isPrimary: boolean;
}

interface EmergencyCardResult {
  id: string;
  firstName: string;
  emoji: string;
  allergyNote: string | null;
  bloodType: string | null;
  medications: unknown;
  pediatrician: string | null;
  pediatricianPhone: string | null;
  hospital: string | null;
  emergencyContacts: EmergencyCardContact[];
}

interface EmergencyCardRow {
  id: string;
  first_name: string;
  emoji: string;
  allergy_note: string | null;
  blood_type: string | null;
  medications: unknown;
  pediatrician: string | null;
  pediatrician_phone: string | null;
  hospital: string | null;
  emergency_contacts: EmergencyCardContact[] | null;
}

/**
 * Emergency card read model — parent access.
 * Returns limited fields: child basics, medical essentials, emergency contacts.
 * Uses raw SQL for efficient joined read.
 */
export async function getEmergencyCardForParent(
  childId: string,
  householdId: string
): Promise<EmergencyCardResult> {
  const rows = await prisma.$queryRaw<EmergencyCardRow[]>`
    SELECT
      c.id,
      c.first_name,
      c.emoji,
      c.allergy_note,
      cm.blood_type,
      cm.medications,
      cm.pediatrician,
      cm.pediatrician_phone,
      cm.hospital,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', ec.id,
              'name', ec.name,
              'relationship', ec.relationship,
              'phone', ec.phone,
              'isPrimary', ec.is_primary
            ) ORDER BY ec.position
          )
          FROM emergency_contacts ec
          WHERE ec.child_id = c.id AND ec.household_id = ${householdId}::uuid
        ),
        '[]'::json
      ) AS emergency_contacts
    FROM children c
    LEFT JOIN child_medical cm ON cm.child_id = c.id AND cm.household_id = c.household_id
    WHERE c.id = ${childId}::uuid
      AND c.household_id = ${householdId}::uuid
  `;

  if (rows.length === 0) {
    throw new AppError("Child not found.", 404);
  }

  const row = rows[0];
  return {
    id: row.id,
    firstName: row.first_name,
    emoji: row.emoji,
    allergyNote: row.allergy_note,
    bloodType: row.blood_type,
    medications: row.medications,
    pediatrician: row.pediatrician,
    pediatricianPhone: row.pediatrician_phone,
    hospital: row.hospital,
    emergencyContacts: row.emergency_contacts ?? [],
  };
}

/**
 * Emergency card read model — Family Circle carer access.
 * Same data as parent, but restricted to carer role with assigned child.
 * Viewer and contributor are denied.
 */
export async function getEmergencyCardForFamilyCircle(
  childId: string,
  householdId: string,
  familyCircleMemberId: string
): Promise<EmergencyCardResult> {
  // Verify member exists in household and has correct role
  const member = await prisma.familyCircleMember.findFirst({
    where: {
      id: familyCircleMemberId,
      householdId,
      status: "active",
    },
  });

  if (!member) {
    throw new AppError("Family Circle member not found.", 404);
  }

  if (isAccessExpired(member)) {
    throw new AppError("Family Circle member access has expired.", 403);
  }

  if (!hasFamilyCircleCapability(member.role, "emergency:read")) {
    throw new AppError(
      "Your Family Circle role does not permit emergency card access.",
      403
    );
  }

  // Verify child is assigned to this member
  const assignment = await prisma.familyCircleMemberChild.findUnique({
    where: {
      familyCircleMemberId_childId: {
        familyCircleMemberId,
        childId,
      },
    },
  });

  if (!assignment || assignment.householdId !== householdId) {
    throw new AppError(
      "You do not have access to this child's emergency card.",
      403
    );
  }

  // Use the same raw SQL read model
  return getEmergencyCardForParent(childId, householdId);
}
