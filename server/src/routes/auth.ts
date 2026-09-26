import { Router, type Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import { asyncHandler, ApiError } from "../lib/http.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import {
  generateRefreshToken,
  hashToken,
  REFRESH_COOKIE,
  refreshCookieOptions,
  signAccessToken,
} from "../lib/jwt.js";
import { currentAuth, requireAuth } from "../middleware/auth.js";
import type { Role } from "../lib/jwt.js";

export const authRouter = Router();

const registerSchema = z.object({
  orgName: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

interface UserRow {
  id: string;
  organization_id: string;
  email: string;
  role: Role;
  org_name: string;
}

const USER_SELECT = `
  select u.id, u.organization_id, u.email, u.role, o.name as org_name
  from users u join organizations o on o.id = u.organization_id`;

interface UserRowWithPassword extends UserRow {
  password_hash: string;
}

async function issueSession(res: Response, user: UserRow) {
  const accessToken = signAccessToken({
    sub: user.id,
    org: user.organization_id,
    role: user.role,
    email: user.email,
  });
  const { token, tokenHash } = generateRefreshToken();
  await pool.query(
    `insert into refresh_tokens (user_id, token_hash, expires_at)
     values ($1, $2, now() + make_interval(days => $3))`,
    [user.id, tokenHash, env.REFRESH_TOKEN_TTL_DAYS],
  );
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions());
  return { accessToken, user: serializeUser(user) };
}

function serializeUser(u: UserRow) {
  return {
    id: u.id,
    orgId: u.organization_id,
    email: u.email,
    role: u.role,
    orgName: u.org_name,
  };
}

async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await pool.query(`${USER_SELECT} where lower(u.email) = lower($1)`, [email]);
  return rows[0] ?? null;
}

async function findUserWithPassword(email: string): Promise<UserRowWithPassword | null> {
  const { rows } = await pool.query(
    `select u.id, u.organization_id, u.email, u.role, u.password_hash, o.name as org_name
     from users u join organizations o on o.id = u.organization_id
     where lower(u.email) = lower($1)`,
    [email],
  );
  return rows[0] ?? null;
}

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const existing = await findUserByEmail(body.email);
    if (existing) throw new ApiError(409, "An account with this email already exists");

    const client = await pool.connect();
    try {
      await client.query("begin");
      const org = await client.query(
        "insert into organizations (name) values ($1) returning id",
        [body.orgName],
      );
      const user = await client.query(
        `insert into users (organization_id, email, password_hash, role)
         values ($1, $2, $3, 'owner')
         returning id, email, role`,
        [org.rows[0].id, body.email.toLowerCase(), await hashPassword(body.password)],
      );
      await client.query("commit");
      const full: UserRow = {
        id: user.rows[0].id,
        organization_id: org.rows[0].id,
        email: user.rows[0].email,
        role: user.rows[0].role,
        org_name: body.orgName,
      };
      const session = await issueSession(res, full);
      res.status(201).json(session);
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const user = await findUserWithPassword(body.email);
    if (!user) throw new ApiError(401, "Invalid email or password");
    const ok = await verifyPassword(body.password, user.password_hash);
    if (!ok) throw new ApiError(401, "Invalid email or password");
    const session = await issueSession(res, user);
    res.json(session);
  }),
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new ApiError(401, "No refresh token");

    const tokenHash = hashToken(token);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const found = await client.query(
        `select rt.id, rt.user_id, rt.expires_at, rt.revoked_at, rt.replaced_by,
                u.organization_id, u.email, u.role, o.name as org_name
         from refresh_tokens rt
         join users u on u.id = rt.user_id
         join organizations o on o.id = u.organization_id
         where rt.token_hash = $1
         for update`,
        [tokenHash],
      );
      const row = found.rows[0];
      if (!row) throw new ApiError(401, "Invalid refresh token");
      if (row.revoked_at) throw new ApiError(401, "Refresh token already revoked");
      if (row.replaced_by) throw new ApiError(401, "Refresh token already used");
      if (new Date(row.expires_at) < new Date()) throw new ApiError(401, "Refresh token expired");

      // rotate: revoke the presented token, issue a fresh one
      const { token: nextToken, tokenHash: nextHash } = generateRefreshToken();
      const next = await client.query(
        `insert into refresh_tokens (user_id, token_hash, expires_at)
         values ($1, $2, now() + make_interval(days => $3))
         returning id`,
        [row.user_id, nextHash, env.REFRESH_TOKEN_TTL_DAYS],
      );
      await client.query("update refresh_tokens set revoked_at = now(), replaced_by = $1 where id = $2", [
        next.rows[0].id,
        row.id,
      ]);
      await client.query("commit");

      const user: UserRow = {
        id: row.user_id,
        organization_id: row.organization_id,
        email: row.email,
        role: row.role,
        org_name: row.org_name,
      };
      const accessToken = signAccessToken({
        sub: user.id,
        org: user.organization_id,
        role: user.role,
        email: user.email,
      });
      res.cookie(REFRESH_COOKIE, nextToken, refreshCookieOptions());
      res.json({ accessToken, user: serializeUser(user) });
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) {
      await pool.query(
        "update refresh_tokens set revoked_at = now() where token_hash = $1 and revoked_at is null",
        [hashToken(token)],
      );
    }
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
    res.status(204).end();
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const auth = currentAuth(res);
    const { rows } = await pool.query(`${USER_SELECT} where u.id = $1`, [auth.sub]);
    const user = rows[0] as UserRow | undefined;
    if (!user) throw new ApiError(401, "Account no longer exists");
    res.json({ user: serializeUser(user) });
  }),
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

authRouter.post(
  "/change-password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = currentAuth(res);
    const body = changePasswordSchema.parse(req.body);

    const { rows } = await pool.query(
      `select id, password_hash from users where id = $1`,
      [auth.sub],
    );
    const user = rows[0];
    if (!user) throw new ApiError(401, "Account no longer exists");

    const match = await verifyPassword(body.currentPassword, user.password_hash);
    if (!match) throw new ApiError(400, "Current password is incorrect");

    const newHash = await hashPassword(body.newPassword);
    await pool.query(`update users set password_hash = $1 where id = $2`, [newHash, auth.sub]);

    res.json({ success: true });
  }),
);