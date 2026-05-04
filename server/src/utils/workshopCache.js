const redisClient = require("../config/redis");

const WORKSHOP_CACHE_KEY =
  process.env.WORKSHOP_CACHE_KEY || "cache:workshops:list";
const WORKSHOP_CACHE_TTL = Number(process.env.WORKSHOP_CACHE_TTL || 60);

async function getCachedWorkshops() {
  try {
    const cached = await redisClient.get(WORKSHOP_CACHE_KEY);
    if (!cached) {
      return null;
    }
    return JSON.parse(cached);
  } catch (error) {
    console.warn("[workshopCache] Redis get failed:", error.message);
    return null;
  }
}

async function setCachedWorkshops(items) {
  try {
    await redisClient.set(
      WORKSHOP_CACHE_KEY,
      JSON.stringify(items),
      "EX",
      WORKSHOP_CACHE_TTL,
    );
  } catch (error) {
    console.warn("[workshopCache] Redis set failed:", error.message);
  }
}

async function invalidateWorkshopsCache() {
  try {
    await redisClient.del(WORKSHOP_CACHE_KEY);
  } catch (error) {
    console.warn("[workshopCache] Redis delete failed:", error.message);
  }
}

module.exports = {
  WORKSHOP_CACHE_KEY,
  WORKSHOP_CACHE_TTL,
  getCachedWorkshops,
  setCachedWorkshops,
  invalidateWorkshopsCache,
};
