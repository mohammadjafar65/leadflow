/**
 * Thin fetch wrapper: base URL, access-token injection with silent
 * refresh-on-401 (httpOnly cookie rotation, architecture.md §6), typed
 * errors, and idempotency-key support for mutating calls (§3).
 */
const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) ?? "/api/v1";

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    const serverMessage =
      typeof body === "object" && body !== null && "message" in body
        ? String((body as { message: unknown }).message)
        : typeof body === "object" && body !== null && "error" in body
          ? String((body as { error: unknown }).error)
          : `API error ${status}`;
    super(serverMessage);
  }
}

const TOKEN_KEY = "leadflow.access_token";

let accessToken: string | null = (() => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
})();

/** Persisted in localStorage for reload resilience (documented tradeoff —
 *  a memory-only holder is the safer alternative for high-security orgs). */
export function setAccessToken(token: string | null) {
  accessToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode) — keep in-memory only */
  }
}

export function getAccessToken() {
  return accessToken;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  idempotencyKey?: string;
  /** internal: skip the 401->refresh retry loop */
  _skipAuthRetry?: boolean;
}

let refreshPromise: Promise<string | null> | null = null;

/** Exchanged via the httpOnly cookie; rotates server-side on every call. */
async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${BASE_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) {
          setAccessToken(null);
          return null;
        }
        const data = (await res.json()) as { accessToken: string };
        setAccessToken(data.accessToken);
        return data.accessToken;
      } catch {
        setAccessToken(null);
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { body, idempotencyKey, headers, _skipAuthRetry, ...rest } = opts;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      ...(headers ?? {}),
    },
    credentials: "include", // httpOnly refresh cookie
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !_skipAuthRetry && !path.startsWith("/auth/")) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request<T>(path, { ...opts, _skipAuthRetry: true });
    }
    throw new ApiError(401, { error: "unauthenticated" });
  }

  if (!res.ok) {
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      /* no body */
    }
    throw new ApiError(res.status, parsed);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown, idempotencyKey?: string) =>
    request<T>(path, { method: "POST", body, idempotencyKey }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};