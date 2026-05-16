require("dotenv").config();

const { Worker } = require("bullmq");
const prisma = require("../config/prisma");
const redisClient = require("../config/redis");
const { createQueueConnection } = require("../config/queueConnection");
const {
  REGISTRATION_PROCESSING_QUEUE,
} = require("../queues/registrationProcessingQueue");
const { enqueueNotification } = require("../notifications/notificationQueue");
const { enqueueHoldExpiry } = require("../queues/registrationHoldQueue");

async function compensateRedisSlot(workshopId) {
  try {
    const slotKey = `slots:workshop:${workshopId}`;
    await redisClient.incr(slotKey);
  } catch (error) {
    console.warn(
      "[registrationProcessingWorker] Failed to compensate Redis slot:",
      error.message,
    );
  }
}

const worker = new Worker(
  REGISTRATION_PROCESSING_QUEUE,
  async (job) => {
    const {
      user_id: userId,
      workshop_id: workshopId,
      qr_code_hash: qrHash,
      payment_status: paymentStatus,
    } = job.data;

    if (!userId || !workshopId || !qrHash) {
      throw new Error("Missing required fields for registration processing");
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const [user, workshop] = await Promise.all([
          tx.users.findUnique({ where: { id: userId } }),
          tx.workshops.findUnique({ where: { id: workshopId } }),
        ]);

        if (!user) {
          const error = new Error(`User not found: ${userId}`);
          error.code = "USER_NOT_FOUND";
          throw error;
        }

        if (!workshop) {
          const error = new Error(`Workshop not found: ${workshopId}`);
          error.code = "WORKSHOP_NOT_FOUND";
          throw error;
        }

        // Idempotent retry protection: if already created, do not decrement slots again.
        const existing = await tx.registrations.findFirst({
          where: { user_id: userId, workshop_id: workshopId },
        });

        if (existing) {
          return {
            registration: existing,
            user,
            workshop,
            alreadyProcessed: true,
          };
        }

        const slotUpdate = await tx.workshops.updateMany({
          where: { id: workshopId, available_slots: { gt: 0 } },
          data: { available_slots: { decrement: 1 } },
        });

        if (slotUpdate.count === 0) {
          const error = new Error("Workshop is full");
          error.code = "WORKSHOP_FULL";
          throw error;
        }

        const registration = await tx.registrations.create({
          data: {
            user_id: userId,
            workshop_id: workshopId,
            qr_code_hash: qrHash,
            payment_status: paymentStatus,
          },
        });

        return {
          registration,
          user,
          workshop,
          alreadyProcessed: false,
        };
      });

      // Skip side effects on already-processed retries.
      if (result.alreadyProcessed) {
        return {
          ok: true,
          skipped: true,
          registration_id: result.registration.id,
        };
      }

      if (!result.workshop.is_paid) {
        await enqueueNotification({
          user_email: result.user.email,
          full_name: result.user.full_name,
          workshop_info: buildWorkshopInfo(result.workshop),
          qr_code_hash: qrHash,
        });
      }

      if (result.workshop.is_paid) {
        const holdMinutes = Number(process.env.PAID_HOLD_MINUTES || 10);
        const delayMs = Math.max(holdMinutes, 1) * 60 * 1000;
        await enqueueHoldExpiry(
          {
            registration_id: result.registration.id,
            workshop_id: result.workshop.id,
            user_id: result.user.id,
          },
          delayMs,
        );
      }

      return { ok: true, registration_id: result.registration.id };
    } catch (error) {
      const permanentFailureCodes = new Set([
        "USER_NOT_FOUND",
        "WORKSHOP_NOT_FOUND",
        "WORKSHOP_FULL",
      ]);

      // Permanent failures should release the previously reserved Redis slot
      // and finish the job without retries.
      if (permanentFailureCodes.has(error.code)) {
        await compensateRedisSlot(workshopId);
        return {
          ok: false,
          skipped: true,
          reason: error.message,
        };
      }

      throw error;
    }
  },
  {
    connection: createQueueConnection(),
    concurrency: Number(process.env.REGISTRATION_PROCESSING_CONCURRENCY || 10),
  },
);

function buildWorkshopInfo(workshop) {
  if (!workshop) {
    return {};
  }

  return {
    title: workshop.title,
    subject: workshop.title,
    name: workshop.title,
    workshop_name: workshop.title,
    time: workshop.start_time ? workshop.start_time.toISOString() : "",
    workshop_time: workshop.start_time
      ? new Date(workshop.start_time).toLocaleString()
      : "",
  };
}

worker.on("completed", (job) => {
  console.log(`[registrationProcessingWorker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  if (!job) {
    return;
  }
  console.error(
    `[registrationProcessingWorker] Job ${job.id} failed: ${err.message}`,
  );
});

async function shutdown() {
  console.log("\n[registrationProcessingWorker] Shutting down...");
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
