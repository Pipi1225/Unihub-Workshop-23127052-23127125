const { Queue } = require("bullmq");
const { createQueueConnection } = require("../config/queueConnection");

const PAYMENT_RETRY_QUEUE = "payment_retry_queue";

const connection = createQueueConnection();
const paymentRetryQueue = new Queue(PAYMENT_RETRY_QUEUE, { connection });

function buildRetryJobOptions() {
  return {
    attempts: Number(process.env.PAYMENT_RETRY_ATTEMPTS || 3),
    backoff: { type: "exponential", delay: 60000 },
    removeOnComplete: true,
    removeOnFail: false,
  };
}

async function enqueuePaymentRetry(payload) {
  return paymentRetryQueue.add(
    "retry_payment",
    payload,
    buildRetryJobOptions(),
  );
}

module.exports = {
  PAYMENT_RETRY_QUEUE,
  paymentRetryQueue,
  enqueuePaymentRetry,
};
