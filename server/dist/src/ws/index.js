import { WebSocketServer } from "ws";
import { verifyAccessToken } from "../lib/jwt.js";
import { getJobRow } from "../lib/jobs.js";
import { jobChannel, sub } from "../db/redis.js";
const clients = new Set();
function send(socket, msg) {
    if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(msg));
    }
}
function attachSubscriber() {
    sub.on("message", (channel, message) => {
        for (const c of clients) {
            if (jobChannel(c.jobId) === channel || c.jobId === channel) {
                try {
                    send(c.socket, JSON.parse(message));
                }
                catch {
                    send(c.socket, { type: "raw", data: message });
                }
            }
        }
    });
}
/**
 * Gateway for live scrape/enrichment/send progress (architecture.md §3).
 * Clients connect as ws://host/ws/jobs/:jobId?token=<access token>; the
 * token is verified and the job's org must match the token's org.
 */
export function attachJobSocketServer(server) {
    // noServer: we route upgrades manually so /ws/jobs/:jobId works (ws's
    // `path` option matches exact pathnames only).
    const wss = new WebSocketServer({ noServer: true });
    server.on("upgrade", (req, socket, head) => {
        const url = new URL(req.url ?? "", "http://localhost");
        if (!/^\/ws\/jobs\/[0-9a-f-]{36}$/.test(url.pathname)) {
            socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
            socket.destroy();
            return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit("connection", ws, req);
        });
    });
    wss.on("connection", async (socket, req) => {
        const url = new URL(req.url ?? "", "http://localhost");
        const match = url.pathname.match(/^\/ws\/jobs\/([0-9a-f-]{36})$/);
        const token = url.searchParams.get("token");
        if (!match || !token) {
            send(socket, { type: "error", message: "Expected /ws/jobs/:jobId?token=<access token>" });
            socket.close(1008, "bad request");
            return;
        }
        const jobId = match[1];
        let auth;
        try {
            auth = verifyAccessToken(token);
        }
        catch {
            send(socket, { type: "error", message: "Invalid token" });
            socket.close(1008, "unauthenticated");
            return;
        }
        const job = await getJobRow(jobId, auth.org);
        if (!job) {
            send(socket, { type: "error", message: "Job not found" });
            socket.close(1008, "not found");
            return;
        }
        const subscription = { jobId, orgId: auth.org, socket };
        clients.add(subscription);
        console.log(`[ws] client connected to live job ${jobId} (org: ${auth.org})`);
        socket.on("close", (code, reason) => {
            console.log(`[ws] client disconnected from job ${jobId} (code: ${code}, reason: ${reason?.toString() || "normal"})`);
            clients.delete(subscription);
        });
        // Send the current snapshot so reconnecting clients resync immediately.
        send(socket, {
            type: "status",
            status: job.status,
            progress: job.progress,
            result: job.result,
            error: job.error,
        });
        // Subscribe to the job's progress channel on the shared subscriber.
        // (ioredis subscriber connections only carry subscribe commands; the
        //  first client to join registers the channel — safe with a Set guard.)
        if (!subscribedChannels.has(jobId)) {
            await sub.subscribe(jobChannel(jobId));
            subscribedChannels.add(jobId);
        }
    });
    wss.on("error", (err) => {
        console.error("[ws] gateway error:", err.message);
    });
    return wss;
}
const subscribedChannels = new Set();
attachSubscriber();
//# sourceMappingURL=index.js.map