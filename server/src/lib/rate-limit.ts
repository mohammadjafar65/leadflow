import type { Redis } from "ioredis";

const BUCKET_LUA = `
local cap = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local data = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(data[1]) or cap
local ts = tonumber(data[2]) or now
local elapsed = math.max(0, (now - ts) / 1000)
tokens = math.min(cap, tokens + elapsed * rate)
if tokens >= 1 then
  tokens = tokens - 1
  redis.call('HMSET', KEYS[1], 'tokens', tokens, 'ts', now)
  redis.call('EXPIRE', KEYS[1], 30)
  return {1, 0}
else
  redis.call('HMSET', KEYS[1], 'tokens', tokens, 'ts', now)
  redis.call('EXPIRE', KEYS[1], 30)
  return {0, 1}
end
`;

export interface RateLimitResult {
  allowed: boolean;
  /** seconds until a token should be available (best-effort estimate) */
  retryAfterSeconds: number;
}

/**
 * Token bucket per key (per-org for Places QPS, per-domain for crawl budget).
 * Burst equals the rate; refill is continuous. Atomic via Lua.
 */
export async function consumeToken(
  redis: Redis,
  key: string,
  ratePerSecond: number,
): Promise<RateLimitResult> {
  if (ratePerSecond <= 0) return { allowed: false, retryAfterSeconds: 1 };
  const res = (await redis.eval(
    BUCKET_LUA,
    1,
    key,
    String(ratePerSecond),
    String(ratePerSecond),
    String(Date.now()),
  )) as [number, number];
  const allowed = res[0] === 1;
  return {
    allowed,
    retryAfterSeconds: allowed ? 0 : Math.ceil(1 / ratePerSecond),
  };
}