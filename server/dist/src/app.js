import { settingsRouter } from "./routes/settings.js";
import { isAllowedOrigin } from "./lib/origin-policy.js";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { placesRouter } from "./routes/places.js";
import { leadsRouter } from "./routes/leads.js";
import { jobsRouter } from "./routes/jobs.js";
import { outreachRouter } from "./routes/outreach.js";
import { sequencesRouter } from "./routes/sequences.js";
import { campaignsRouter } from "./routes/campaigns.js";
import { instagramRouter } from "./routes/instagram.js";
import { instagramWebhookRouter } from "./routes/instagram-webhook.js";
import { errorHandler } from "./lib/http.js";
export function createApp(extra = {}) {
    const app = express();
    app.disable("x-powered-by");
    app.use(cors({ origin: (origin, callback) => callback(null, isAllowedOrigin(origin, env.CLIENT_ORIGIN)), credentials: true }));
    // Redirect browser from OAuth return to the frontend
    app.get("/instagram", (req, res) => {
        const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
        const origins = env.CLIENT_ORIGIN.split(",").map((s) => s.trim());
        const targetOrigin = origins.find((o) => o.startsWith("https://")) || origins[0];
        res.redirect(`${targetOrigin}/instagram${query}`);
    });
    // Webhook must be mounted BEFORE express.json() so it can read the raw body
    app.use("/api/v1", instagramWebhookRouter);
    app.use(express.json({ limit: "1mb" }));
    app.use(cookieParser());
    app.get("/", (_req, res) => {
        res.json({ name: "LeadFlow API", status: "online", health: "/api/v1/health" });
    });
    app.use("/api/v1", healthRouter);
    app.use("/api/v1/auth", authRouter);
    app.use("/api/v1", settingsRouter);
    app.use("/api/v1", placesRouter);
    app.use("/api/v1", leadsRouter);
    app.use("/api/v1", jobsRouter);
    app.use("/api/v1", outreachRouter);
    app.use("/api/v1", sequencesRouter);
    app.use("/api/v1", campaignsRouter);
    app.use("/api/v1", instagramRouter);
    for (const router of extra.routers ?? []) {
        app.use("/api/v1", router);
    }
    app.use("/api/v1", (_req, res) => {
        res.status(404).json({ error: "not_found", message: "Unknown endpoint" });
    });
    app.use(errorHandler);
    return app;
}
//# sourceMappingURL=app.js.map