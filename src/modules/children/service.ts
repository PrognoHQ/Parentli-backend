import { prisma } from "../../lib/prisma";
import { AppError } from "../../types";

// ---------- helpers ----------

async function verifyChildInHousehold(
  childId: string,
  householdId: string
) {
  const child = await prisma.child.findFirst({
    where: { id: childId, householdId },
  });
  if (!child) throw new AppError("Child not found.", 404);
  return child;
}

// ---------- children ----------

export async function createChild(
  householdId: string,
  createdByProfileId: string,
  data: {
    firstName: string;
    lastName?: string;
    dob: string;
    emoji: string;
    color: string;
    photoUrl?: string;
    allergyNote?: string;
  }
) {
  return prisma.child.create({
    data: {
      householdId,
      createdByProfileId,
      firstName: data.firstName,
      lastName: data.lastName ?? null,
      dob: new Date(data.dob),
      emoji: data.emoji,
      color: data.color,
      photoUrl: data.photoUrl ?? null,
      allergyNote: data.allergyNote ?? null,
    },
  });
}

export async function listChildren(householdId: string) {
  return prisma.child.findMany({
    where: { householdId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      dob: true,
      emoji: true,
      color: true,
      photoUrl: true,
      allergyNote: true,
    },
  });
}

export async function getChild(id: string, householdId: string) {
  const child = await prisma.child.findFirst({
    where: { id, householdId },
    include: {
      schoolCare: true,
      medical: true,
      emergencyContacts: { orderBy: { position: "asc" } },
    },
  });
  if (!child) throw new AppError("Child not found.", 404);
  return child;
}

export async function updateChild(
  id: string,
  householdId: string,
  data: {
    firstName?: string;
    lastName?: string | null;
    dob?: string;
    emoji?: string;
    color?: string;
    photoUrl?: string | null;
    allergyNote?: string | null;
  }
) {
  await verifyChildInHousehold(id, householdId);
  return prisma.child.update({
    where: { id },
    data: {
      ...(data.firstName !== undefined && { firstName: data.firstName }),
      ...(data.lastName !== undefined && { lastName: data.lastName }),
      ...(data.dob !== undefined && { dob: new Date(data.dob) }),
      ...(data.emoji !== undefined && { emoji: data.emoji }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.photoUrl !== undefined && { photoUrl: data.photoUrl }),
      ...(data.allergyNote !== undefined && { allergyNote: data.allergyNote }),
    },
  });
}

// ---------- school / care ----------

export async function upsertSchoolCare(
  childId: string,
  householdId: string,
  data: {
    schoolName?: string | null;
    teacherName?: string | null;
    hours?: string | null;
    address?: string | null;
  }
) {
  await verifyChildInHousehold(childId, householdId);
  return prisma.childSchoolCare.upsert({
    where: { childId },
    create: {
      householdId,
      childId,
      schoolName: data.schoolName ?? null,
      teacherName: data.teacherName ?? null,
      hours: data.hours ?? null,
      address: data.address ?? null,
    },
    update: {
      ...(data.schoolName !== undefined && { schoolName: data.schoolName }),
      ...(data.teacherName !== undefined && { teacherName: data.teacherName }),
      ...(data.hours !== undefined && { hours: data.hours }),
      ...(data.address !== undefined && { address: data.address }),
    },
  });
}

export async function getSchoolCare(childId: string, householdId: string) {
  await verifyChildInHousehold(childId, householdId);
  return prisma.childSchoolCare.findUnique({ where: { childId } });
}

// ---------- medical ----------

export async function upsertMedical(
  childId: string,
  householdId: string,
  data: {
    pediatrician?: string | null;
    pediatricianPhone?: string | null;
    hospital?: string | null;
    bloodType?: string | null;
    medications?: unknown;
    allergies?: unknown;
    insurance?: unknown;
  }
) {
  await verifyChildInHousehold(childId, householdId);
  return prisma.childMedical.upsert({
    where: { childId },
    create: {
      householdId,
      childId,
      pediatrician: (data.pediatrician as string) ?? null,
      pediatricianPhone: (data.pediatricianPhone as string) ?? null,
      hospital: (data.hospital as string) ?? null,
      bloodType: (data.bloodType as string) ?? null,
      medications: data.medications !== undefined ? (data.medications as any) : [],
      allergies: data.allergies !== undefined ? (data.allergies as any) : [],
      insurance: data.insurance !== undefined ? (data.insurance as any) : undefined,
    },
    update: {
      ...(data.pediatrician !== undefined && { pediatrician: data.pediatrician }),
      ...(data.pediatricianPhone !== undefined && {
        pediatricianPhone: data.pediatricianPhone,
      }),
      ...(data.hospital !== undefined && { hospital: data.hospital }),
      ...(data.bloodType !== undefined && { bloodType: data.bloodType }),
      ...(data.medications !== undefined && { medications: data.medications as any }),
      ...(data.allergies !== undefined && { allergies: data.allergies as any }),
      ...(data.insurance !== undefined && { insurance: data.insurance as any }),
    },
  });
}

export async function getMedical(childId: string, householdId: string) {
  await verifyChildInHousehold(childId, householdId);
  return prisma.childMedical.findUnique({ where: { childId } });
}

// ---------- emergency contacts ----------

export async function listEmergencyContacts(
  childId: string,
  householdId: string
) {
  await verifyChildInHousehold(childId, householdId);
  return prisma.emergencyContact.findMany({
    where: { childId, householdId },
    orderBy: { position: "asc" },
  });
}

export async function createEmergencyContact(
  childId: string,
  householdId: string,
  data: {
    name: string;
    relationship: string;
    phone: string;
    initial?: string;
    color?: string;
    isPrimary?: boolean;
  }
) {
  await verifyChildInHousehold(childId, householdId);

  const maxPos = await prisma.emergencyContact.aggregate({
    where: { childId, householdId },
    _max: { position: true },
  });
  const nextPosition = (maxPos._max.position ?? -1) + 1;

  return prisma.emergencyContact.create({
    data: {
      householdId,
      childId,
      name: data.name,
      relationship: data.relationship,
      phone: data.phone,
      initial: data.initial ?? null,
      color: data.color ?? null,
      isPrimary: data.isPrimary ?? false,
      position: nextPosition,
    },
  });
}

export async function updateEmergencyContact(
  contactId: string,
  childId: string,
  householdId: string,
  data: {
    name?: string;
    relationship?: string;
    phone?: string;
    initial?: string | null;
    color?: string | null;
    isPrimary?: boolean;
  }
) {
  const contact = await prisma.emergencyContact.findFirst({
    where: { id: contactId, childId, householdId },
  });
  if (!contact) throw new AppError("Emergency contact not found.", 404);

  return prisma.emergencyContact.update({
    where: { id: contactId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.relationship !== undefined && { relationship: data.relationship }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.initial !== undefined && { initial: data.initial }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.isPrimary !== undefined && { isPrimary: data.isPrimary }),
    },
  });
}

export async function deleteEmergencyContact(
  contactId: string,
  childId: string,
  householdId: string
) {
  const contact = await prisma.emergencyContact.findFirst({
    where: { id: contactId, childId, householdId },
  });
  if (!contact) throw new AppError("Emergency contact not found.", 404);

  await prisma.emergencyContact.delete({ where: { id: contactId } });
}

export async function reorderEmergencyContacts(
  childId: string,
  householdId: string,
  orderedIds: string[]
) {
  await verifyChildInHousehold(childId, householdId);

  // Verify all IDs belong to this child + household
  const existing = await prisma.emergencyContact.findMany({
    where: { childId, householdId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((e) => e.id));
  for (const id of orderedIds) {
    if (!existingIds.has(id)) {
      throw new AppError(`Contact ${id} does not belong to this child.`, 400);
    }
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.emergencyContact.update({
        where: { id },
        data: { position: index },
      })
    )
  );
}
