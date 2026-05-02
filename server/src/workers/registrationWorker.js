require("dotenv").config();

const { Worker } = require("bullmq");
const { createQueueConnection } = require("../config/queueConnection");
const { REGISTRATION_HOLD_QUEUE } = require("../queues/registrationHoldQueue");
const { expireRegistrationHold } = require("../services/registrationService");

const worker = new Worker(
  REGISTRATION_HOLD_QUEUE,
  async (job) => {
    const registrationId =
      job.data?.registration_id || job.data?.registrationId;
    await expireRegistrationHold({ registrationId });
  },
  {
    connection: createQueueConnection(),
    concurrency: Number(process.env.REGISTRATION_WORKER_CONCURRENCY || 5),
  },
);

worker.on("completed", (job) => {
  console.log(`[registrationWorker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  if (!job) {
    return;
  }
  console.error(`[registrationWorker] Job ${job.id} failed: ${err.message}`);
});

async function shutdown() {
  console.log("\n[registrationWorker] Shutting down...");
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
