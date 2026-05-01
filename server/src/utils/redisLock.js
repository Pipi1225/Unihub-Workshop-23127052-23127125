/**
 * Redis-based distributed lock for ensuring single instance execution
 */

/**
 * Acquire a lock from Redis
 * @param {ioredis.Redis} redis - Redis client
 * @param {string} lockKey - lock key in Redis
 * @param {number} ttlSeconds - time to live in seconds (default 60)
 * @returns {Promise<boolean>} true if lock acquired, false otherwise
 */
async function acquireLock(redis, lockKey, ttlSeconds = 60) {
  try {
    const lockValue = `${Date.now()}-${Math.random()}`;
    // SET with NX (only if not exists) and EX (expiry)
    const result = await redis.set(lockKey, lockValue, 'NX', 'EX', ttlSeconds);
    return result === 'OK';
  } catch (err) {
    console.error('[redisLock] Error acquiring lock:', err.message);
    return false;
  }
}

/**
 * Release a lock from Redis
 * @param {ioredis.Redis} redis - Redis client
 * @param {string} lockKey - lock key in Redis
 * @returns {Promise<boolean>} true if lock released, false otherwise
 */
async function releaseLock(redis, lockKey) {
  try {
    const result = await redis.del(lockKey);
    return result > 0;
  } catch (err) {
    console.error('[redisLock] Error releasing lock:', err.message);
    return false;
  }
}

module.exports = {
  acquireLock,
  releaseLock,
};
