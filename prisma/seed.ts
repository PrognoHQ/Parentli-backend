import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_SETTINGS, DEFAULT_CATEGORIES } from "../src/types/settings";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const passwordHash = await bcrypt.hash("password123", 10);

  const jordan = await prisma.profile.upsert({
    where: { email: "jordan@email.com" },
    update: {},
    create: {
      email: "jordan@email.com",
      passwordHash,
      firstName: "Jordan",
      lastName: "Doe",
      phone: "+1234567890",
    },
  });

  console.log(`Created profile: ${jordan.firstName} ${jordan.lastName}`);

  const household = await prisma.household.create({
    data: {
      name: "Jordan & Alex",
      createdBy: jordan.id,
      status: "active",
    },
  });

  console.log(`Created household: ${household.name}`);

  await prisma.householdMember.create({
    data: {
      householdId: household.id,
      profileId: jordan.id,
      role: "owner",
      status: "active",
    },
  });

  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((cat) => ({
      householdId: household.id,
      slug: cat.slug,
      label: cat.label,
      emoji: cat.emoji,
      color: cat.color,
      position: cat.position,
      isDefault: true,
      createdBy: jordan.id,
    })),
  });

  console.log("Created 8 default categories");

  await prisma.userSettings.create({
    data: {
      householdId: household.id,
      profileId: jordan.id,
      settings: DEFAULT_SETTINGS as object,
    },
  });

  console.log("Created default settings");

  await prisma.onboardingState.create({
    data: {
      householdId: household.id,
      profileId: jordan.id,
      currentStep: "profile",
      completedSteps: [],
      isComplete: false,
      payload: {},
    },
  });

  console.log("Created onboarding state");
  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
