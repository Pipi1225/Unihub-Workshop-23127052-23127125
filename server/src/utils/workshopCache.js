const redisClient = require("../config/redis");

const WORKSHOP_CACHE_KEY =
  process.env.WORKSHOP_CACHE_KEY || "cache:workshops:list";
const WORKSHOP_CACHE_TTL = Number(process.env.WORKSHOP_CACHE_TTL || 60);

function buildWorkshopsCacheKey({ page, pageSize, includeAll }) {
  const safePage =
    Number.isFinite(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const safePageSize =
    Number.isFinite(Number(pageSize)) && Number(pageSize) > 0
      ? Number(pageSize)
      : 9;
  const scope = includeAll ? "all" : "active";
  return `${WORKSHOP_CACHE_KEY}:${scope}:${safePage}:${safePageSize}`;
}

async function getCachedWorkshops(cacheKey) {
  try {
    const cached = await redisClient.get(cacheKey);
    if (!cached) {
      return null;
    }
    return JSON.parse(cached);
  } catch (error) {
    console.warn("[workshopCache] Redis get failed:", error.message);
    return null;
  }
}

async function setCachedWorkshops(cacheKey, payload) {
  try {
    await redisClient.set(
      cacheKey,
      JSON.stringify(payload),
      "EX",
      WORKSHOP_CACHE_TTL,
    );
  } catch (error) {
    console.warn("[workshopCache] Redis set failed:", error.message);
  }
}

async function invalidateWorkshopsCache() {
  try {
    const keys = await redisClient.keys(`${WORKSHOP_CACHE_KEY}:*`);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (error) {
    console.warn("[workshopCache] Redis delete failed:", error.message);
  }
}

module.exports = {
  WORKSHOP_CACHE_KEY,
  WORKSHOP_CACHE_TTL,
  buildWorkshopsCacheKey,
  getCachedWorkshops,
  setCachedWorkshops,
  invalidateWorkshopsCache,
};
