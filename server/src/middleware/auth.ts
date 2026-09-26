import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken, type AccessTokenPayload, type Role } from "../lib/jwt.js";
import { ApiError } from "../lib/http.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      auth?: AccessTokenPayload;
    }
  }
}

/**
 * Authentication: requires a valid `Authorization: Bearer <access token>`.
 * The org id comes exclusively from the signed token — a client-supplied
 * organization_id is never trusted (architecture.md §6).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new ApiError(401, "Missing bearer token");
  }
  res.locals.auth = verifyAccessToken(header.slice("Bearer ".length));
  next();
}

/**
 * Authorization (RBAC): owner > admin > member. The most permissive role
 * required is passed, e.g. requireRole("owner", "admin").
 */
export function requireRole(...roles: Role[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const auth = res.locals.auth;
    if (!auth) throw new ApiError(401, "Not authenticated");
    if (!roles.includes(auth.role)) {
      throw new ApiError(403, `Requires role: ${roles.join(" or ")}`);
    }
    next();
  };
}

/** Convenience: current auth context, or a 401 if unauthenticated. */
export function currentAuth(res: Response): AccessTokenPayload {
  const auth = res.locals.auth;
  if (!auth) throw new ApiError(401, "Not authenticated");
  return auth;
}