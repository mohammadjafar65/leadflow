import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { ApiError } from "./http.js";
export function signAccessToken(payload) {
    return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
        expiresIn: env.ACCESS_TOKEN_TTL,
        issuer: "leadflow",
    });
}
export function verifyAccessToken(token) {
    try {
        const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: "leadflow" });
        if (typeof decoded === "string" || !decoded.sub || !decoded.org) {
            throw new ApiError(401, "Invalid token");
        }
        return decoded;
    }
    catch {
        throw new ApiError(401, "Invalid or expired token");
    }
}
// --- Refresh tokens (opaque, stored hashed, rotated on use) ---
export function generateRefreshToken() {
    const token = randomBytes(48).toString("base64url");
    return { token, tokenHash: hashToken(token) };
}
export function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
}
export function refreshCookieOptions() {
    return {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    };
}
export const REFRESH_COOKIE = "lf_refresh";
//# sourceMappingURL=jwt.js.map