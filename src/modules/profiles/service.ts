import { prisma } from "../../lib/prisma";
import { AppError } from "../../types";

export async function getProfile(profileId: string) {
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
  });

  if (!profile) {
    throw new AppError("Profile not found.", 404);
  }

  return {
    id: profile.id,
    email: profile.email,
    firstName: profile.firstName,
    lastName: profile.lastName,
    phone: profile.phone,
    avatarUrl: profile.avatarUrl,
    createdAt: profile.createdAt,
  };
}

export async function updateProfile(
  profileId: string,
  data: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    avatarUrl?: string;
  }
) {
  const profile = await prisma.profile.update({
    where: { id: profileId },
    data: {
      ...(data.firstName !== undefined && { firstName: data.firstName }),
      ...(data.lastName !== undefined && { lastName: data.lastName }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
    },
  });

  return {
    id: profile.id,
    email: profile.email,
    firstName: profile.firstName,
    lastName: profile.lastName,
    phone: profile.phone,
    avatarUrl: profile.avatarUrl,
  };
}
