import { prisma } from "../../lib/prisma";
import { AppError } from "../../types";

export async function getOnboardingState(profileId: string, householdId: string) {
  const state = await prisma.onboardingState.findUnique({
    where: {
      householdId_profileId: { householdId, profileId },
    },
  });

  if (!state) {
    throw new AppError("Onboarding state not found.", 404);
  }

  return {
    currentStep: state.currentStep,
    completedSteps: state.completedSteps,
    isComplete: state.isComplete,
    payload: state.payload,
  };
}

export async function updateOnboardingState(
  profileId: string,
  householdId: string,
  data: {
    currentStep?: string;
    completedSteps?: string[];
    isComplete?: boolean;
    payload?: Record<string, unknown>;
  }
) {
  const existing = await prisma.onboardingState.findUnique({
    where: {
      householdId_profileId: { householdId, profileId },
    },
  });

  if (!existing) {
    throw new AppError("Onboarding state not found.", 404);
  }

  const updateData: Record<string, unknown> = {};

  if (data.currentStep !== undefined) {
    updateData.currentStep = data.currentStep;
  }

  if (data.completedSteps !== undefined) {
    updateData.completedSteps = data.completedSteps;
  }

  if (data.isComplete !== undefined) {
    updateData.isComplete = data.isComplete;
  }

  if (data.payload !== undefined) {
    const existingPayload =
      typeof existing.payload === "object" && existing.payload !== null
        ? existing.payload
        : {};
    updateData.payload = { ...existingPayload, ...data.payload };
  }

  const updated = await prisma.onboardingState.update({
    where: {
      householdId_profileId: { householdId, profileId },
    },
    data: updateData,
  });

  return {
    currentStep: updated.currentStep,
    completedSteps: updated.completedSteps,
    isComplete: updated.isComplete,
    payload: updated.payload,
  };
}
