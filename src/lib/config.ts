const isProduction = process.env.NODE_ENV === "production";

if (isProduction && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required in production.");
}

export const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
export const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";
export const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";
