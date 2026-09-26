import { verifyAccessToken } from "../lib/jwt.js";
import { ApiError } from "../lib/http.js";
/**
 * Authentication: requires a valid `Authorization: Bearer <access token>`.
 * The org id comes exclusively from the signed token — a client-supplied
 * organization_id is never trusted (architecture.md §6).
 */
export function requireAuth(req, res, next) {
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
export function requireRole(...roles) {
    return (_req, res, next) => {
        const auth = res.locals.auth;
        if (!auth)
            throw new ApiError(401, "Not authenticated");
        if (!roles.includes(auth.role)) {
            throw new ApiError(403, `Requires role: ${roles.join(" or ")}`);
        }
        next();
    };
}
/** Convenience: current auth context, or a 401 if unauthenticated. */
export function currentAuth(res) {
    const auth = res.locals.auth;
    if (!auth)
        throw new ApiError(401, "Not authenticated");
    return auth;
}
//# sourceMappingURL=auth.js.map