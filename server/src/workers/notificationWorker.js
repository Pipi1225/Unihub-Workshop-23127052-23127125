require("dotenv").config();

const { Worker, Queue, UnrecoverableError } = require("bullmq");
const { createQueueConnection } = require("../config/queueConnection");
const { NOTIFICATION_QUEUE, NOTIFICATION_DLQ, normalizePayload } = require("../notifications/notificationQueue");
const { NotificationService } = require("../notifications/notificationService");

const notificationService = new NotificationService();

const backoffScheduleMs = [60000, 180000, 300000, 300000, 300000];

function notificationBackoff(attemptsMade) {
  const index = Math.max(attemptsMade - 1, 0);
  return backoffScheduleMs[Math.min(index, backoffScheduleMs.length - 1)];
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const worker = new Worker(
  NOTIFICATION_QUEUE,
  async (job) => {
    const payload = normalizePayload(job.data || {});
    const userEmail = payload.user_email.toLowerCase();

    if (!userEmail || !isValidEmail(userEmail)) {
      throw new UnrecoverableError("Invalid email address");
    }

    if (!payload.full_name) {
      throw new UnrecoverableError("Missing full_name");
    }

    await notificationService.send({
      ...payload,
      user_email: userEmail,
    });
  },
  {
    connection: createQueueConnection(),
    concurrency: Number(process.env.NOTIFICATION_WORKER_CONCURRENCY || 5),
    limiter: {
      max: Number(process.env.NOTIFICATION_RATE_LIMIT || 50),
      duration: 1000,
    },
    settings: {
      backoffStrategies: {
        notificationBackoff,
      },
    },
  }
);

const dlqQueue = new Queue(NOTIFICATION_DLQ, {
  connection: createQueueConnection(),
});

worker.on("completed", (job) => {
  console.log(`[notificationWorker] Job ${job.id} completed`);
});

worker.on("failed", async (job, err) => {
  if (!job) {
    return;
  }

  const attempts = job.opts.attempts || 1;
  console.error(`[notificationWorker] Job ${job.id} failed: ${err.message}`);

  if (job.attemptsMade >= attempts) {
    await dlqQueue.add(
      "notification_dead",
      {
        ...job.data,
        failed_at: new Date().toISOString(),
        failed_reason: err.message,
        job_id: job.id,
      },
      {
        removeOnComplete: true,
      }
    );
  }
});

async function shutdown() {
  console.log("\n[notificationWorker] Shutting down...");
  await worker.close();
  await dlqQueue.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
