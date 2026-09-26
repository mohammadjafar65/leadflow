import { ZodError } from "zod";
/** Error with an HTTP status and optional structured details. */
export class ApiError extends Error {
    status;
    details;
    constructor(status, message, details) {
        super(message);
        this.status = status;
        this.details = details;
    }
}
/** Wraps an async route handler so rejected promises reach the error middleware. */
export function asyncHandler(fn) {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
}
/** Org-scoping guard: every row read must belong to the caller's org. */
export function assertOrgRow(row, orgId) {
    if (!row)
        throw new ApiError(404, "Not found");
    if (row.organization_id !== orgId)
        throw new ApiError(404, "Not found");
    return row;
}
export function errorHandler(err, _req, res, _next) {
    if (err instanceof ZodError) {
        res.status(400).json({
            error: "validation_error",
            message: "Invalid request body",
            details: err.issues,
        });
        return;
    }
    if (err instanceof ApiError) {
        res.status(err.status).json({ error: "api_error", message: err.message, details: err.details });
        return;
    }
    console.error("[server] unhandled error:", err);
    res.status(500).json({ error: "internal_error", message: "Internal server error" });
}
//# sourceMappingURL=http.js.map