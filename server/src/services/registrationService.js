const crypto = require("crypto");
const prisma = require("../config/prisma");
const redisClient = require("../config/redis");
const { enqueueNotification } = require("../notifications/notificationQueue");
const { enqueueHoldExpiry } = require("../queues/registrationHoldQueue");

const LOCK_RETRY_DELAY_MS = Number(
  process.env.REGISTRATION_LOCK_RETRY_MS || 120,
);
const LOCK_WAIT_MS = Number(process.env.REGISTRATION_LOCK_WAIT_MS || 3000);
const LOCK_TTL_SECONDS = Number(process.env.REGISTRATION_LOCK_TTL_SECONDS || 5);
const HOLD_MINUTES = Number(process.env.PAID_HOLD_MINUTES || 10);

const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireWorkshopLock(lockKey) {
  const lockValue = crypto.randomUUID();
  const start = Date.now();

  while (Date.now() - start < LOCK_WAIT_MS) {
    try {
      const result = await redisClient.set(
        lockKey,
        lockValue,
        "NX",
        "EX",
        LOCK_TTL_SECONDS,
      );
      if (result === "OK") {
        return { acquired: true, lockValue, skipped: false };
      }
    } catch (error) {
      console.warn(
        "[registrationService] Redis unavailable, skipping lock:",
        error.message,
      );
      return { acquired: false, lockValue: null, skipped: true };
    }

    await sleep(LOCK_RETRY_DELAY_MS);
  }

  return { acquired: false, lockValue: null, skipped: false };
}

async function releaseWorkshopLock(lockKey, lockValue) {
  if (!lockValue) {
    return false;
  }

  try {
    const result = await redisClient.eval(
      RELEASE_LOCK_SCRIPT,
      1,
      lockKey,
      lockValue,
    );
    return Number(result) > 0;
  } catch (error) {
    console.warn(
      "[registrationService] Failed to release lock:",
      error.message,
    );
    return false;
  }
}

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

async function getRegistrationById({ registrationId, userId }) {
  if (!registrationId) {
    throw Object.assign(new Error("Missing registration_id"), {
      statusCode: 400,
    });
  }

  const registration = await prisma.registrations.findFirst({
    where: {
      id: registrationId,
      user_id: userId,
    },
    include: {
      users: {
        select: {
          full_name: true,
          email: true,
        },
      },
      workshops: {
        select: {
          title: true,
          room_name: true,
          speaker_name: true,
          price: true,
          is_paid: true,
        },
      },
    },
  });

  if (!registration) {
    throw Object.assign(new Error("Registration not found"), {
      statusCode: 404,
    });
  }

  return {
    id: registration.id,
    registration_id: registration.id,
    full_name: registration.users?.full_name || "",
    email: registration.users?.email || "",
    phone_number: "",
    amount: registration.workshops?.price || 0,
    payment_status: registration.payment_status,
    workshop: {
      title: registration.workshops?.title || "",
      room_name: registration.workshops?.room_name || "",
      speaker_name: registration.workshops?.speaker_name || "",
      is_paid: Boolean(registration.workshops?.is_paid),
    },
  };
}

async function getRegistrationByWorkshop({ workshopId, userId }) {
  if (!workshopId) {
    throw Object.assign(new Error("Missing workshop_id"), { statusCode: 400 });
  }

  const registration = await prisma.registrations.findFirst({
    where: {
      workshop_id: workshopId,
      user_id: userId,
    },
    include: {
      users: {
        select: {
          full_name: true,
          email: true,
        },
      },
      workshops: {
        select: {
          title: true,
          room_name: true,
          speaker_name: true,
          price: true,
          is_paid: true,
        },
      },
    },
  });

  if (!registration) {
    throw Object.assign(new Error("Registration not found"), {
      statusCode: 404,
    });
  }

  return {
    id: registration.id,
    registration_id: registration.id,
    full_name: registration.users?.full_name || "",
    email: registration.users?.email || "",
    phone_number: "",
    amount: registration.workshops?.price || 0,
    payment_status: registration.payment_status,
    workshop: {
      title: registration.workshops?.title || "",
      room_name: registration.workshops?.room_name || "",
      speaker_name: registration.workshops?.speaker_name || "",
      is_paid: Boolean(registration.workshops?.is_paid),
    },
  };
}

async function registerWorkshop({ userId, workshopId }) {
  if (!workshopId) {
    throw Object.assign(new Error("Missing workshop_id"), { statusCode: 400 });
  }

  const lockKey = `lock:workshop:${workshopId}`;
  const lockResult = await acquireWorkshopLock(lockKey);

  if (!lockResult.acquired && !lockResult.skipped) {
    throw Object.assign(new Error("System busy. Please try again."), {
      statusCode: 503,
    });
  }

  let registrationResult;

  try {
    registrationResult = await prisma.$transaction(async (tx) => {
      const [user, workshop] = await Promise.all([
        tx.users.findUnique({ where: { id: userId } }),
        tx.workshops.findUnique({ where: { id: workshopId } }),
      ]);

      if (!user) {
        throw Object.assign(new Error("User not found"), { statusCode: 404 });
      }

      if (!workshop) {
        throw Object.assign(new Error("Workshop not found"), {
          statusCode: 404,
        });
      }

      const existing = await tx.registrations.findFirst({
        where: { user_id: userId, workshop_id: workshopId },
      });

      if (existing) {
        throw Object.assign(new Error("Registration already exists"), {
          statusCode: 409,
        });
      }

      const slotUpdate = await tx.workshops.updateMany({
        where: { id: workshopId, available_slots: { gt: 0 } },
        data: { available_slots: { decrement: 1 } },
      });

      if (slotUpdate.count === 0) {
        throw Object.assign(new Error("Workshop is full"), { statusCode: 409 });
      }

      const qrHash = crypto.randomUUID();
      const paymentStatus = workshop.is_paid ? "PENDING" : "PAID";

      const registration = await tx.registrations.create({
        data: {
          user_id: userId,
          workshop_id: workshopId,
          qr_code_hash: qrHash,
          payment_status: paymentStatus,
        },
      });

      return {
        user,
        workshop,
        registration,
      };
    });
  } catch (error) {
    if (error.code === "P2002") {
      throw Object.assign(new Error("Registration already exists"), {
        statusCode: 409,
      });
    }

    throw error;
  } finally {
    if (lockResult.acquired) {
      await releaseWorkshopLock(lockKey, lockResult.lockValue);
    }
  }

  const { user, workshop, registration } = registrationResult;

  if (!workshop.is_paid) {
    await enqueueNotification({
      user_email: user.email,
      full_name: user.full_name,
      workshop_info: buildWorkshopInfo(workshop),
      qr_code_hash: registration.qr_code_hash,
    });
  }

  // For paid workshops, schedule hold expiry (unpaid registrations auto-cancel after timeout)
  if (workshop.is_paid) {
    const delayMs = Math.max(HOLD_MINUTES, 1) * 60 * 1000;
    await enqueueHoldExpiry(
      {
        registration_id: registration.id,
        workshop_id: workshop.id,
        user_id: user.id,
      },
      delayMs,
    );
  }

  return {
    ok: true,
    registration_id: registration.id,
    payment_status: registration.payment_status,
    qr_code_hash: registration.qr_code_hash,
    workshop_id: workshop.id,
    is_paid: Boolean(workshop.is_paid),
    hold_expires_in_minutes: workshop.is_paid ? HOLD_MINUTES : 0,
  };
}

async function expireRegistrationHold({ registrationId }) {
  if (!registrationId) {
    return { ok: false, message: "Missing registrationId" };
  }

  return prisma.$transaction(async (tx) => {
    const registration = await tx.registrations.findUnique({
      where: { id: registrationId },
    });

    if (!registration) {
      return { ok: false, message: "Registration not found" };
    }

    if (registration.payment_status !== "PENDING") {
      return { ok: true, skipped: true };
    }

    const updatedRegistration = await tx.registrations.updateMany({
      where: { id: registrationId, payment_status: "PENDING" },
      data: { payment_status: "CANCELLED" },
    });

    if (updatedRegistration.count === 0) {
      return { ok: true, skipped: true };
    }

    await tx.workshops.update({
      where: { id: registration.workshop_id },
      data: { available_slots: { increment: 1 } },
    });

    return { ok: true, cancelled: true };
  });
}

function parseCheckinTime(value) {
  if (!value) {
    return new Date();
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

async function getSyncData({ workshopId }) {
  if (!workshopId) {
    throw Object.assign(new Error("Missing workshop_id"), { statusCode: 400 });
  }

  const registrations = await prisma.registrations.findMany({
    where: {
      workshop_id: workshopId,
      payment_status: "PAID",
    },
    include: {
      users: {
        select: { full_name: true },
      },
    },
  });

  return registrations.map((row) => ({
    registration_id: row.id,
    qr_code_hash: row.qr_code_hash,
    workshop_id: row.workshop_id,
    full_name: row.users?.full_name || "",
    checkin_status: Boolean(row.checkin_status),
    checkin_time: row.checkin_time ? row.checkin_time.toISOString() : null,
  }));
}

async function syncCheckins({ items }) {
  if (!Array.isArray(items)) {
    throw Object.assign(new Error("Invalid sync payload"), { statusCode: 400 });
  }

  const result = {
    ok: true,
    updated: 0,
    skipped: 0,
    conflicts: [],
    errors: [],
  };

  for (const item of items) {
    const registrationId = String(
      item?.registration_id || item?.id || "",
    ).trim();
    const qrHash = String(item?.qr_code_hash || "").trim();
    const workshopId = String(item?.workshop_id || "").trim();
    const incomingTime = parseCheckinTime(item?.checkin_time);

    if (!registrationId && !(qrHash && workshopId)) {
      result.errors.push({
        item,
        message: "Missing registration_id or qr_code_hash/workshop_id",
      });
      continue;
    }

    if (!incomingTime) {
      result.errors.push({ item, message: "Invalid checkin_time" });
      continue;
    }

    const registration = await prisma.registrations.findFirst({
      where: registrationId
        ? { id: registrationId }
        : { qr_code_hash: qrHash, workshop_id: workshopId },
    });

    if (!registration) {
      result.errors.push({ item, message: "Registration not found" });
      continue;
    }

    if (registration.payment_status !== "PAID") {
      result.errors.push({ item, message: "Registration not paid" });
      continue;
    }

    const updateResult = await prisma.registrations.updateMany({
      where: {
        id: registration.id,
        OR: [
          { checkin_time: null },
          { checkin_time: { gt: incomingTime } },
          { checkin_status: false },
        ],
      },
      data: {
        checkin_status: true,
        checkin_time: incomingTime,
      },
    });

    if (updateResult.count === 0) {
      result.conflicts.push({
        registration_id: registration.id,
        message: "Check-in already recorded with earlier time",
      });
      result.skipped += 1;
      continue;
    }

    result.updated += 1;
  }

  return result;
}

module.exports = {
  registerWorkshop,
  getRegistrationById,
  getRegistrationByWorkshop,
  expireRegistrationHold,
  getSyncData,
  syncCheckins,
};
