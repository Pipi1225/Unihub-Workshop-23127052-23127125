const redisClient = require("../config/redis");

const TOKEN_BUCKET_SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])

local data = redis.call("HMGET", key, "tokens", "ts")
local tokens = tonumber(data[1])
local ts = tonumber(data[2])

if tokens == nil then
  tokens = capacity
  ts = now
end

local delta = math.max(0, now - ts)
local refillTokens = (delta / 1000) * refill

tokens = math.min(capacity, tokens + refillTokens)
local allowed = tokens >= 1
if allowed then
  tokens = tokens - 1
end

redis.call("HMSET", key, "tokens", tokens, "ts", now)
redis.call("PEXPIRE", key, ttl)

if allowed then
  return 1
end
return 0
`;

const fallbackBuckets = new Map();

function consumeFallback({ key, capacity, refillPerSecond, now }) {
  const existing = fallbackBuckets.get(key) || { tokens: capacity, ts: now };
  const delta = Math.max(0, now - existing.ts);
  const refillTokens = (delta / 1000) * refillPerSecond;

  let tokens = Math.min(capacity, existing.tokens + refillTokens);
  const allowed = tokens >= 1;
  if (allowed) {
    tokens -= 1;
  }

  fallbackBuckets.set(key, { tokens, ts: now });
  return allowed;
}

function createRateLimiter(options = {}) {
  const capacity = Number(
    options.capacity || process.env.RATE_LIMIT_CAPACITY || 30,
  );
  const refillPerSecond = Number(
    options.refillPerSecond || process.env.RATE_LIMIT_REFILL_PER_SEC || 0.5,
  );
  const fallbackCapacity = Number(
    options.fallbackCapacity ||
      process.env.RATE_LIMIT_FALLBACK_CAPACITY ||
      Math.max(1, Math.floor(capacity / 5)),
  );
  const fallbackRefillPerSecond = Number(
    options.fallbackRefillPerSecond ||
      process.env.RATE_LIMIT_FALLBACK_REFILL_PER_SEC ||
      Math.max(0.1, refillPerSecond / 5),
  );
  const keyPrefix = String(options.keyPrefix || "rate:default:");
  const ttlMs = Number(
    options.ttlMs ||
      process.env.RATE_LIMIT_TTL_MS ||
      Math.ceil((capacity / Math.max(refillPerSecond, 0.1)) * 1000 * 2),
  );

  return async (req, res, next) => {
    const identity = req.user?.id || req.ip || "anonymous";
    const key = `${keyPrefix}${identity}`;
    const now = Date.now();

    try {
      const allowed = await redisClient.eval(
        TOKEN_BUCKET_SCRIPT,
        1,
        key,
        capacity,
        refillPerSecond,
        now,
        ttlMs,
      );
      if (Number(allowed) !== 1) {
        return res.status(429).json({
          ok: false,
          message: "Too many requests. Please try again later.",
        });
      }
    } catch (error) {
      console.warn(
        "[rateLimiter] Redis unavailable, skipping rate limit:",
        error.message,
      );

      const fallbackKey = `fallback:${key}`;
      const fallbackAllowed = consumeFallback({
        key: fallbackKey,
        capacity: fallbackCapacity,
        refillPerSecond: fallbackRefillPerSecond,
        now,
      });

      if (!fallbackAllowed) {
        return res.status(429).json({
          ok: false,
          message: "Too many requests (fallback mode). Please try again later.",
        });
      }
    }

    return next();
  };
}

module.exports = {
  createRateLimiter,
};
