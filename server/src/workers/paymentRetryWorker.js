require("dotenv").config();

const { Worker } = require("bullmq");
const prisma = require("../config/prisma");
const { createQueueConnection } = require("../config/queueConnection");
const { PAYMENT_RETRY_QUEUE } = require("../queues/paymentRetryQueue");
const paymentService = require("../services/paymentService");

const worker = new Worker(
  PAYMENT_RETRY_QUEUE,
  async (job) => {
    const paymentId = job.data?.payment_id || job.data?.paymentId;
    if (!paymentId) {
      throw new Error("Missing payment_id");
    }

    const result = await paymentService.retryPayment({ paymentId });
    if (!result.ok && !result.skipped) {
      throw new Error(result.message || "Retry payment failed");
    }
  },
  {
    connection: createQueueConnection(),
    concurrency: Number(process.env.PAYMENT_RETRY_CONCURRENCY || 2),
  },
);

worker.on("completed", (job) => {
  console.log(`[paymentRetryWorker] Job ${job.id} completed`);
});

worker.on("failed", async (job, err) => {
  if (!job) {
    return;
  }

  console.error(`[paymentRetryWorker] Job ${job.id} failed: ${err.message}`);

  const attempts = job.opts?.attempts || 0;
  if (attempts && job.attemptsMade >= attempts) {
    const paymentId = job.data?.payment_id || job.data?.paymentId;
    if (paymentId) {
      const payment = await prisma.payments.findUnique({
        where: { id: paymentId },
      });

      if (payment && payment.status === "PENDING") {
        await prisma.$transaction([
          prisma.payments.update({
            where: { id: paymentId },
            data: { status: "FAILED" },
          }),
          prisma.registrations.update({
            where: { id: payment.registration_id },
            data: { payment_status: "FAILED" },
          }),
        ]);
      }
    }
  }
});

async function shutdown() {
  console.log("\n[paymentRetryWorker] Shutting down...");
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
