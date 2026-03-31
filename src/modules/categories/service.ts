import { prisma } from "../../lib/prisma";
import { AppError } from "../../types";

export async function listCategories(householdId: string) {
  return prisma.category.findMany({
    where: {
      householdId,
      archivedAt: null,
    },
    orderBy: { position: "asc" },
    select: {
      id: true,
      slug: true,
      label: true,
      emoji: true,
      color: true,
      position: true,
      isDefault: true,
    },
  });
}

export async function createCategory(
  householdId: string,
  createdBy: string,
  data: {
    label: string;
    slug: string;
    emoji: string;
    color: string;
  }
) {
  const maxPosition = await prisma.category.aggregate({
    where: { householdId },
    _max: { position: true },
  });

  const nextPosition = (maxPosition._max.position ?? -1) + 1;

  return prisma.category.create({
    data: {
      householdId,
      slug: data.slug,
      label: data.label,
      emoji: data.emoji,
      color: data.color,
      position: nextPosition,
      isDefault: false,
      createdBy,
    },
    select: {
      id: true,
      slug: true,
      label: true,
      emoji: true,
      color: true,
      position: true,
      isDefault: true,
    },
  });
}

export async function updateCategory(
  categoryId: string,
  householdId: string,
  data: {
    label?: string;
    emoji?: string;
    color?: string;
    position?: number;
    archivedAt?: Date | null;
  }
) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, householdId },
  });

  if (!category) {
    throw new AppError("Category not found.", 404);
  }

  return prisma.category.update({
    where: { id: categoryId },
    data: {
      ...(data.label !== undefined && { label: data.label }),
      ...(data.emoji !== undefined && { emoji: data.emoji }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.position !== undefined && { position: data.position }),
      ...(data.archivedAt !== undefined && { archivedAt: data.archivedAt }),
    },
    select: {
      id: true,
      slug: true,
      label: true,
      emoji: true,
      color: true,
      position: true,
      isDefault: true,
      archivedAt: true,
    },
  });
}
