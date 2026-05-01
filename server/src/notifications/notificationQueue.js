const { Queue } = require("bullmq");
const { createQueueConnection } = require("../config/queueConnection");

const NOTIFICATION_QUEUE = "notification_queue";
const NOTIFICATION_DLQ = "notification_dlq";

const notificationQueue = new Queue(NOTIFICATION_QUEUE, {
  connection: createQueueConnection(),
});

const notificationDlqQueue = new Queue(NOTIFICATION_DLQ, {
  connection: createQueueConnection(),
});

function normalizePayload(payload = {}) {
  const userEmail = payload.user_email || payload.userEmail || payload.email || "";
  const fullName = payload.full_name || payload.fullName || "";
  const workshopInfo = payload.workshop_info || payload.workshopInfo || {};
  const qrCodeHash = payload.qr_code_hash || payload.qrCodeHash || payload.qr_code || "";

  return {
    user_email: String(userEmail).trim(),
    full_name: String(fullName).trim(),
    workshop_info: workshopInfo,
    qr_code_hash: String(qrCodeHash).trim(),
  };
}

function buildJobOptions(options = {}) {
  const attempts = Number(process.env.NOTIFICATION_JOB_ATTEMPTS || 5);
  return {
    attempts: Number.isFinite(attempts) ? attempts : 5,
    backoff: { type: "notificationBackoff" },
    removeOnComplete: true,
    removeOnFail: false,
    ...options,
  };
}

async function enqueueNotification(payload, options = {}) {
  const normalized = normalizePayload(payload);
  return notificationQueue.add("send_notification", normalized, buildJobOptions(options));
}

module.exports = {
  NOTIFICATION_QUEUE,
  NOTIFICATION_DLQ,
  notificationQueue,
  notificationDlqQueue,
  enqueueNotification,
  normalizePayload,
};
