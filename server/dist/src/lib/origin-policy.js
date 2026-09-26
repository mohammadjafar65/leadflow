export function isAllowedOrigin(origin, configured) {
    if (!origin)
        return true;
    try {
        const value = new URL(origin);
        if (!["http:", "https:"].includes(value.protocol) || value.origin !== origin.replace(/\/$/, ""))
            return false;
        return configured.split(",").some((entry) => {
            try {
                return new URL(entry.trim()).origin === value.origin;
            }
            catch {
                return false;
            }
        });
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=origin-policy.js.map