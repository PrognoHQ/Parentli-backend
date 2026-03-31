import { prisma } from "../../lib/prisma";
import { AppError } from "../../types";
import { DEFAULT_SETTINGS } from "../../types/settings";
import { DEFAULT_CATEGORIES } from "../../types/settings";

export async function createHousehold(profileId: string, name: string) {
  const existingMembership = await prisma.householdMember.findFirst({
    where: { profileId, status: "active" },
  });

  if (existingMembership) {
    throw new AppError("User already belongs to a household.", 409);
  }

  const result = await prisma.$transaction(async (tx) => {
    const household = await tx.household.create({
      data: {
        name,
        createdBy: profileId,
        status: "active",
      },
    });

    const membership = await tx.householdMember.create({
      data: {
        householdId: household.id,
        profileId,
        role: "owner",
        status: "active",
      },
    });

    await tx.category.createMany({
      data: DEFAULT_CATEGORIES.map((cat) => ({
        householdId: household.id,
        slug: cat.slug,
        label: cat.label,
        emoji: cat.emoji,
        color: cat.color,
        position: cat.position,
        isDefault: true,
        createdBy: profileId,
      })),
    });

    await tx.userSettings.create({
      data: {
        householdId: household.id,
        profileId,
        settings: DEFAULT_SETTINGS as object,
      },
    });

    await tx.onboardingState.create({
      data: {
        householdId: household.id,
        profileId,
        currentStep: "profile",
        completedSteps: [],
        isComplete: false,
        payload: {},
      },
    });

    const categories = await tx.category.findMany({
      where: { householdId: household.id },
      orderBy: { position: "asc" },
    });

    return { household, membership, categories };
  });

  return result;
}
