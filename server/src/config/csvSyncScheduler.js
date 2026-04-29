/**
 * CSV Sync Scheduler with Redis-based distributed lock
 * Runs cron job: reads CSV_SYNC_CRON env, acquires lock, executes runCsvSync
 */

const cron = require('node-cron');
const { runCsvSync } = require('../services/csvSyncService');
const { acquireLock, releaseLock } = require('../utils/redisLock');

let scheduledTask = null;

/**
 * Bootstrap CSV sync scheduler
 * @param {ioredis.Redis} redis - Redis client for distributed locking
 * @param {Object} options - configuration options
 * @returns {Promise<void>}
 */
async function bootstrapCsvSyncScheduler(redis, options = {}) {
  const {
    cronExpression = process.env.CSV_SYNC_CRON || '0 2 * * *',
    lockKey = 'csv-sync-lock',
    lockTtl = 3600, // 1 hour max execution time
    importDir = process.env.CSV_IMPORT_DIR || 'data/import',
    archiveDir = process.env.CSV_ARCHIVE_DIR || 'data/archive',
    errorDir = process.env.CSV_ERROR_DIR || 'data/error',
  } = options;

  console.log(`[csvSyncScheduler] Bootstrapping with cron: ${cronExpression}`);

  // Schedule the cron job
  scheduledTask = cron.schedule(cronExpression, async () => {
    console.log(`[csvSyncScheduler] Cron triggered at ${new Date().toISOString()}`);

    // Try to acquire lock
    const lockAcquired = await acquireLock(redis, lockKey, lockTtl);
    if (!lockAcquired) {
      console.log(`[csvSyncScheduler] Could not acquire lock (another instance may be running)`);
      return;
    }

    try {
      console.log(`[csvSyncScheduler] Lock acquired, running CSV sync...`);
      const result = await runCsvSync({
        importDir,
        archiveDir,
        errorDir,
      });
      console.log(`[csvSyncScheduler] CSV sync completed:`, result);
    } catch (err) {
      console.error(`[csvSyncScheduler] Error running CSV sync:`, err.message);
    } finally {
      // Release lock
      const lockReleased = await releaseLock(redis, lockKey);
      if (lockReleased) {
        console.log(`[csvSyncScheduler] Lock released`);
      } else {
        console.warn(`[csvSyncScheduler] Failed to release lock`);
      }
    }
  });

  console.log(`[csvSyncScheduler] CSV sync scheduler initialized`);
}

/**
 * Stop the CSV sync scheduler
 * @returns {void}
 */
function stopCsvSyncScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    console.log(`[csvSyncScheduler] CSV sync scheduler stopped`);
  }
}

module.exports = {
  bootstrapCsvSyncScheduler,
  stopCsvSyncScheduler,
};
