import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { ApiError } from "./http.js";

export type Role = "owner" | "admin" | "member";

export interface AccessTokenPayload {
  /** user id */
  sub: string;
  /** organization id — the ONLY org a client is ever allowed to act as */
  org: string;
  role: Role;
  email: string;
}

export interface AuthContext {
  userId: string;
  orgId: string;
  role: Role;
  email: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"],
    issuer: "leadflow",
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: "leadflow" });
    if (typeof decoded === "string" || !decoded.sub || !decoded.org) {
      throw new ApiError(401, "Invalid token");
    }
    return decoded as unknown as AccessTokenPayload;
  } catch {
    throw new ApiError(401, "Invalid or expired token");
  }
}

// --- Refresh tokens (opaque, stored hashed, rotated on use) ---

export function generateRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(48).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

export const REFRESH_COOKIE = "lf_refresh";