const crypto = require("crypto");
const prisma = require("../config/prisma");
const redisClient = require("../config/redis");
const { enqueueNotification } = require("../notifications/notificationQueue");
const { enqueueHoldExpiry } = require("../queues/registrationHoldQueue");
const {
  enqueueRegistrationProcessing,
} = require("../queues/registrationProcessingQueue");

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

async function acquireWorkshopLock(lockKey, workshopId) {
  const lockValue = crypto.randomUUID();
  const start = Date.now();

  while (Date.now() - start < LOCK_WAIT_MS) {
    const currentSlots = await getWorkshopSlotsRedis(workshopId);
    if (currentSlots !== null && currentSlots <= 0) {
      return { acquired: false, lockValue: null, skipped: true, full: true };
    }

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

/**
 * Atomically decrement workshop slots using Redis
 * Returns new slot count after decrement, or null if Redis unavailable
 */
async function decrementWorkshopSlotsRedis(workshopId) {
  try {
    const slotKey = `slots:workshop:${workshopId}`;
    const newSlots = await redisClient.decr(slotKey);
    return newSlots;
  } catch (error) {
    console.warn(
      "[registrationService] Redis decrement failed:",
      error.message,
    );
    return null;
  }
}

async function ensureWorkshopSlotsRedis(workshopId, availableSlots) {
  try {
    const slotKey = `slots:workshop:${workshopId}`;
    const initialized = await redisClient.set(
      slotKey,
      Math.max(Number(availableSlots) || 0, 0),
      "NX",
      "EX",
      30 * 24 * 60 * 60,
    );
    return initialized === "OK";
  } catch (error) {
    console.warn(
      "[registrationService] Redis slot init failed:",
      error.message,
    );
    return false;
  }
}

async function getWorkshopSlotsRedis(workshopId) {
  try {
    const slotKey = `slots:workshop:${workshopId}`;
    const value = await redisClient.get(slotKey);
    if (value === null || value === undefined) {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  } catch (error) {
    console.warn(
      "[registrationService] Redis slot read failed:",
      error.message,
    );
    return null;
  }
}

async function setWorkshopSlotsRedis(workshopId, availableSlots) {
  try {
    const slotKey = `slots:workshop:${workshopId}`;
    await redisClient.set(
      slotKey,
      Math.max(Number(availableSlots) || 0, 0),
      "EX",
      30 * 24 * 60 * 60,
    );
    return true;
  } catch (error) {
    console.warn(
      "[registrationService] Redis slot sync failed:",
      error.message,
    );
    return false;
  }
}

/**
 * Atomically increment workshop slots (revert) using Redis
 */
async function incrementWorkshopSlotsRedis(workshopId) {
  try {
    const slotKey = `slots:workshop:${workshopId}`;
    await redisClient.incr(slotKey);
  } catch (error) {
    console.warn(
      "[registrationService] Redis increment (revert) failed:",
      error.message,
    );
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
    qr_code_hash: registration.qr_code_hash,
    full_name: registration.users?.full_name || "",
    email: registration.users?.email || "",
    phone_number: "",
    amount: registration.workshops?.price || 0,
    payment_status: registration.payment_status,
    workshop: {
      title: registration.workshops?.title || "",
      room_name: registration.workshops?.room_name || "",
      speaker_name: registration.workshops?.speaker_name || "",
      start_time: registration.workshops?.start_time
        ? registration.workshops?.start_time.toISOString()
        : null,
      end_time: registration.workshops?.end_time
        ? registration.workshops?.end_time.toISOString()
        : null,
      room_map_url: registration.workshops?.room_map_url || null,
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
    qr_code_hash: registration.qr_code_hash,
    full_name: registration.users?.full_name || "",
    email: registration.users?.email || "",
    phone_number: "",
    amount: registration.workshops?.price || 0,
    payment_status: registration.payment_status,
    workshop: {
      title: registration.workshops?.title || "",
      room_name: registration.workshops?.room_name || "",
      speaker_name: registration.workshops?.speaker_name || "",
      start_time: registration.workshops?.start_time
        ? registration.workshops?.start_time.toISOString()
        : null,
      end_time: registration.workshops?.end_time
        ? registration.workshops?.end_time.toISOString()
        : null,
      room_map_url: registration.workshops?.room_map_url || null,
      is_paid: Boolean(registration.workshops?.is_paid),
    },
  };
}

async function listRegistrationsForUser({ userId, page = 1, pageSize = 10 }) {
  const safePage =
    Number.isFinite(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const safePageSize =
    Number.isFinite(Number(pageSize)) && Number(pageSize) > 0
      ? Math.min(Number(pageSize), 50)
      : 10;
  const skip = (safePage - 1) * safePageSize;

  const [total, registrations] = await Promise.all([
    prisma.registrations.count({ where: { user_id: userId } }),
    prisma.registrations.findMany({
      where: { user_id: userId },
      include: {
        workshops: {
          select: {
            id: true,
            title: true,
            room_name: true,
            speaker_name: true,
            start_time: true,
            end_time: true,
            room_map_url: true,
            is_paid: true,
            price: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
      skip,
      take: safePageSize,
    }),
  ]);

  const items = registrations.map((row) => ({
    id: row.id,
    workshop_id: row.workshop_id,
    payment_status: row.payment_status,
    qr_code_hash: row.qr_code_hash,
    created_at: row.created_at ? row.created_at.toISOString() : null,
    workshop: {
      id: row.workshops?.id || row.workshop_id,
      title: row.workshops?.title || "",
      room_name: row.workshops?.room_name || "",
      speaker_name: row.workshops?.speaker_name || "",
      start_time: row.workshops?.start_time
        ? row.workshops?.start_time.toISOString()
        : null,
      end_time: row.workshops?.end_time
        ? row.workshops?.end_time.toISOString()
        : null,
      room_map_url: row.workshops?.room_map_url || null,
      is_paid: Boolean(row.workshops?.is_paid),
      price: row.workshops?.price || 0,
    },
  }));

  return {
    items,
    page: safePage,
    page_size: safePageSize,
    total,
    total_pages: Math.max(Math.ceil(total / safePageSize), 1),
  };
}

async function registerWorkshop({ userId, workshopId }) {
  if (!workshopId) {
    throw Object.assign(new Error("Missing workshop_id"), { statusCode: 400 });
  }

  // Step 1: Validate user and workshop exist
  const [user, workshop] = await Promise.all([
    prisma.users.findUnique({ where: { id: userId } }),
    prisma.workshops.findUnique({ where: { id: workshopId } }),
  ]);

  if (!user) {
    throw Object.assign(new Error("User not found"), { statusCode: 404 });
  }

  if (!workshop) {
    throw Object.assign(new Error("Workshop not found"), {
      statusCode: 404,
    });
  }

  // Step 2: Check for existing registration
  const existing = await prisma.registrations.findFirst({
    where: { user_id: userId, workshop_id: workshopId },
  });

  if (existing) {
    throw Object.assign(new Error("Registration already exists"), {
      statusCode: 409,
    });
  }

  // Step 3: Generate QR hash immediately
  const qrHash = crypto.randomUUID();
  const paymentStatus = workshop.is_paid ? "PENDING" : "PAID";

  // Step 4: Decide strategy based on available slots
  const EDGE_CASE_THRESHOLD = Number(
    process.env.REGISTRATION_EDGE_CASE_THRESHOLD || 5,
  );
  const currentSlots = workshop.available_slots;

  // === PATH A: OPTIMISTIC (Redis DECR) when slots > threshold ===
  if (currentSlots > EDGE_CASE_THRESHOLD) {
    await ensureWorkshopSlotsRedis(workshopId, currentSlots);

    const newSlots = await decrementWorkshopSlotsRedis(workshopId);

    if (newSlots === null) {
      // Redis unavailable - fallback to pessimistic lock
      console.warn(
        "[registrationService] Redis unavailable, falling back to lock",
      );
      return await registerWorkshopWithLock({
        userId,
        workshopId,
        user,
        workshop,
        qrHash,
        paymentStatus,
      });
    }

    if (newSlots < 0) {
      // Revert the decrement - workshop is full
      await incrementWorkshopSlotsRedis(workshopId);
      throw Object.assign(new Error("Workshop is full"), {
        statusCode: 409,
      });
    }

    // Success! Enqueue for async processing
    await enqueueRegistrationProcessing({
      user_id: userId,
      workshop_id: workshopId,
      qr_code_hash: qrHash,
      payment_status: paymentStatus,
    });

    // Return immediately with 201
    return {
      ok: true,
      registration_id: null, // Will be populated by worker
      payment_status: paymentStatus,
      qr_code_hash: qrHash,
      workshop_id: workshopId,
      is_paid: Boolean(workshop.is_paid),
      hold_expires_in_minutes: workshop.is_paid ? HOLD_MINUTES : 0,
      _note: "Registration queued for processing",
    };
  }

  // === PATH B: PESSIMISTIC (Lock) when slots <= threshold ===
  return await registerWorkshopWithLock({
    userId,
    workshopId,
    user,
    workshop,
    qrHash,
    paymentStatus,
  });
}

/**
 * Register workshop with pessimistic lock (used for edge cases)
 */
async function registerWorkshopWithLock({
  userId,
  workshopId,
  user,
  workshop,
  qrHash,
  paymentStatus,
}) {
  const lockKey = `lock:workshop:${workshopId}`;
  const redisSlots = await getWorkshopSlotsRedis(workshopId);

  if (redisSlots !== null && redisSlots <= 0) {
    throw Object.assign(new Error("Workshop is full"), {
      statusCode: 409,
    });
  }

  const lockResult = await acquireWorkshopLock(lockKey, workshopId);

  if (lockResult.full) {
    throw Object.assign(new Error("Workshop is full"), {
      statusCode: 409,
    });
  }

  if (!lockResult.acquired && !lockResult.skipped) {
    const latestSlots = await getWorkshopSlotsRedis(workshopId);
    if (latestSlots !== null && latestSlots <= 0) {
      throw Object.assign(new Error("Workshop is full"), {
        statusCode: 409,
      });
    }

    throw Object.assign(new Error("System busy. Please try again."), {
      statusCode: 503,
    });
  }

  let registrationResult;

  try {
    registrationResult = await prisma.$transaction(
      async (tx) => {
        // Double-check no duplicate registration
        const existing = await tx.registrations.findFirst({
          where: { user_id: userId, workshop_id: workshopId },
        });

        if (existing) {
          throw Object.assign(new Error("Registration already exists"), {
            statusCode: 409,
          });
        }

        // Conditional slot update (atomic in DB)
        const slotUpdate = await tx.workshops.updateMany({
          where: { id: workshopId, available_slots: { gt: 0 } },
          data: { available_slots: { decrement: 1 } },
        });

        if (slotUpdate.count === 0) {
          throw Object.assign(new Error("Workshop is full"), {
            statusCode: 409,
          });
        }

        await setWorkshopSlotsRedis(workshopId, 0);

        // Create registration record
        const registration = await tx.registrations.create({
          data: {
            user_id: userId,
            workshop_id: workshopId,
            qr_code_hash: qrHash,
            payment_status: paymentStatus,
          },
        });

        return { registration };
      },
      {
        maxWait: 10000,
        timeout: 15000,
      },
    );
  } catch (error) {
    if (error.code === "P2002") {
      throw Object.assign(new Error("Registration already exists"), {
        statusCode: 409,
      });
    }

    if (error.statusCode === 409) {
      await setWorkshopSlotsRedis(workshopId, 0);
    }

    throw error;
  } finally {
    if (lockResult.acquired) {
      await releaseWorkshopLock(lockKey, lockResult.lockValue);
    }
  }

  const { registration } = registrationResult;

  // Enqueue notifications and hold expiry for edge-case path
  if (!workshop.is_paid) {
    await enqueueNotification({
      user_email: user.email,
      full_name: user.full_name,
      workshop_info: buildWorkshopInfo(workshop),
      qr_code_hash: registration.qr_code_hash,
    });
  }

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
  listRegistrationsForUser,
  expireRegistrationHold,
  getSyncData,
  syncCheckins,
};
