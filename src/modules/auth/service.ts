import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma";
import { AppError, JwtPayload } from "../../types";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

function signToken(profileId: string, email: string): string {
  const payload: JwtPayload = { sub: profileId, email };
  return jwt.sign(payload as object, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as string,
  } as jwt.SignOptions);
}

export async function register(data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}) {
  const existing = await prisma.profile.findUnique({
    where: { email: data.email.toLowerCase() },
  });

  if (existing) {
    throw new AppError("Email already registered.", 409);
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  const profile = await prisma.profile.create({
    data: {
      email: data.email.toLowerCase(),
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone || null,
    },
  });

  const token = signToken(profile.id, profile.email);

  return {
    token,
    profile: {
      id: profile.id,
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: profile.phone,
      avatarUrl: profile.avatarUrl,
    },
  };
}

export async function login(data: { email: string; password: string }) {
  const profile = await prisma.profile.findUnique({
    where: { email: data.email.toLowerCase() },
  });

  if (!profile) {
    throw new AppError("Invalid email or password.", 401);
  }

  const valid = await bcrypt.compare(data.password, profile.passwordHash);
  if (!valid) {
    throw new AppError("Invalid email or password.", 401);
  }

  const token = signToken(profile.id, profile.email);

  return {
    token,
    profile: {
      id: profile.id,
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: profile.phone,
      avatarUrl: profile.avatarUrl,
    },
  };
}
