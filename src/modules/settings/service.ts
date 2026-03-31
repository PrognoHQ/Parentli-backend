import { prisma } from "../../lib/prisma";
import { AppError } from "../../types";

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];
    if (
      sourceVal &&
      typeof sourceVal === "object" &&
      !Array.isArray(sourceVal) &&
      targetVal &&
      typeof targetVal === "object" &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>
      );
    } else {
      result[key] = sourceVal;
    }
  }
  return result;
}

export async function getSettings(profileId: string, householdId: string) {
  const record = await prisma.userSettings.findFirst({
    where: { profileId, householdId },
  });

  if (!record) {
    throw new AppError("Settings not found.", 404);
  }

  return record.settings;
}

export async function updateSettings(
  profileId: string,
  householdId: string,
  partialSettings: Record<string, unknown>
) {
  const record = await prisma.userSettings.findFirst({
    where: { profileId, householdId },
  });

  if (!record) {
    throw new AppError("Settings not found.", 404);
  }

  const existing =
    typeof record.settings === "object" && record.settings !== null
      ? (record.settings as Record<string, unknown>)
      : {};

  const merged = deepMerge(existing, partialSettings);

  const updated = await prisma.userSettings.update({
    where: { id: record.id },
    data: { settings: merged as object },
  });

  return updated.settings;
}
