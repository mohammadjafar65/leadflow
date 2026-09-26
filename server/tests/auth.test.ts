import { describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import { createApp } from "../src/app.js";
import { requireAuth, requireRole } from "../src/middleware/auth.js";
import { pool } from "../src/db/pool.js";
import type { Response } from "supertest";

// Test-only RBAC probe routes, mounted before the 404 catch-all.
const probeRouter = Router();
probeRouter.get("/probe/admin-only", requireAuth, requireRole("owner", "admin"), (_req, res) => {
  res.json({ ok: true });
});
probeRouter.get("/probe/authed", requireAuth, (_req, res) => {
  res.json({ ok: true, orgId: res.locals.auth!.org });
});

const app = createApp({ routers: [probeRouter] });

function uniqueEmail() {
  return `user-${randomUUID().slice(0, 8)}@example.test`;
}

/** Cookie-managing client (supertest v7 agents do not persist cookies). */
function makeClient() {
  let cookie: string | undefined;
  async function call(
    method: "get" | "post",
    path: string,
    opts: { body?: unknown; token?: string; sendCookie?: boolean } = {},
  ): Promise<{ res: Response; cookie: string | undefined }> {
    let req = request(app)[method](path);
    if (opts.token) req = req.set("Authorization", `Bearer ${opts.token}`);
    if (cookie && opts.sendCookie !== false) req = req.set("Cookie", `lf_refresh=${cookie}`);
    if (opts.body !== undefined) req = req.send(opts.body as object);
    const res = await req;
    const setCookie = res.headers["set-cookie"];
    const line = Array.isArray(setCookie) ? setCookie.find((c) => c.startsWith("lf_refresh=")) : undefined;
    if (line) cookie = line.split(";")[0].slice("lf_refresh=".length);
    return { res, cookie };
  }
  return {
    get: (p: string, o?: Parameters<typeof call>[2]) => call("get", p, o),
    post: (p: string, o?: Parameters<typeof call>[2]) => call("post", p, o),
    cookie: () => cookie,
  };
}

async function register(client: ReturnType<typeof makeClient>) {
  const email = uniqueEmail();
  const { res } = await client.post("/api/v1/auth/register", {
    body: { orgName: "Test Org", email, password: "password123" },
  });
  expect(res.status).toBe(201);
  return { email, body: res.body as { accessToken: string; user: { id: string; orgId: string; role: string } } };
}

describe("auth", () => {
  it("registers an org with an owner user and sets an httpOnly refresh cookie", async () => {
    const client = makeClient();
    const { res, cookie } = await client.post("/api/v1/auth/register", {
      body: { orgName: "Test Org", email: uniqueEmail(), password: "password123" },
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("owner");
    expect(res.body.user.orgId).toBeTruthy();
    expect(res.body.accessToken).toBeTruthy();
    expect(cookie).toBeTruthy();
    const setCookie = res.headers["set-cookie"] as unknown as string[];
    expect(setCookie.some((c) => /HttpOnly/i.test(c))).toBe(true);
    expect(setCookie.some((c) => /SameSite=Lax/i.test(c))).toBe(true);
  });

  it("rejects duplicate emails", async () => {
    const client = makeClient();
    const { email } = await register(client);
    const dup = await client.post("/api/v1/auth/register", {
      body: { orgName: "Other", email, password: "password123" },
    });
    expect(dup.res.status).toBe(409);
  });

  it("logs in and reads /auth/me with the access token", async () => {
    const client = makeClient();
    const { email } = await register(client);
    const login = await client.post("/api/v1/auth/login", { body: { email, password: "password123" } });
    expect(login.res.status).toBe(200);
    const me = await client.get("/api/v1/auth/me", { token: login.res.body.accessToken });
    expect(me.res.status).toBe(200);
    expect(me.res.body.user.email).toBe(email);
  });

  it("rejects a bad password", async () => {
    const client = makeClient();
    const { email } = await register(client);
    const bad = await client.post("/api/v1/auth/login", { body: { email, password: "wrong-password" } });
    expect(bad.res.status).toBe(401);
  });

  it("rotates refresh tokens: the old cookie cannot be reused after refresh", async () => {
    const client = makeClient();
    await register(client);
    const oldCookie = client.cookie();

    const refresh = await client.post("/api/v1/auth/refresh");
    expect(refresh.res.status).toBe(200);
    expect(refresh.res.body.accessToken).toBeTruthy();
    expect(refresh.cookie).not.toBe(oldCookie);

    // Replaying the pre-rotation cookie must fail.
    const replay = await client.post("/api/v1/auth/refresh", { sendCookie: false }).then(async () => {
      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", `lf_refresh=${oldCookie}`);
      return res;
    });
    expect(replay.status).toBe(401);

    // The new cookie still works.
    const again = await client.post("/api/v1/auth/refresh");
    expect(again.res.status).toBe(200);
  });

  it("logout revokes the refresh token", async () => {
    const client = makeClient();
    await register(client);
    const cookieValue = client.cookie();

    await client.post("/api/v1/auth/logout");
    const reuse = await request(app).post("/api/v1/auth/refresh").set("Cookie", `lf_refresh=${cookieValue}`);
    expect(reuse.status).toBe(401);
  });

  it("requires a bearer token on protected routes", async () => {
    const res = await request(app).get("/api/v1/probe/authed");
    expect(res.status).toBe(401);
  });

  it("enforces RBAC: member cannot hit an owner/admin route", async () => {
    const client = makeClient();
    const { body } = await register(client);

    await pool.query(
      `insert into users (organization_id, email, password_hash, role)
       select organization_id, $1, 'x', 'member' from users where id = $2`,
      [`member-${randomUUID().slice(0, 8)}@example.test`, body.user.id],
    );
    const member = await pool.query(
      `select id, organization_id, email from users where role = 'member' and organization_id = $1`,
      [body.user.orgId],
    );
    const memberRow = member.rows[0];

    const { signAccessToken } = await import("../src/lib/jwt.js");
    const memberToken = signAccessToken({
      sub: memberRow.id,
      org: memberRow.organization_id,
      role: "member",
      email: memberRow.email,
    });

    const denied = await request(app).get("/api/v1/probe/admin-only").set("Authorization", `Bearer ${memberToken}`);
    expect(denied.status).toBe(403);

    const allowed = await request(app).get("/api/v1/probe/authed").set("Authorization", `Bearer ${memberToken}`);
    expect(allowed.status).toBe(200);
  });

  it("validates request bodies (bad email shape -> 400)", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      orgName: "",
      email: "not-an-email",
      password: "short",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });
});