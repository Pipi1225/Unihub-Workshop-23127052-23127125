const prisma = require("../config/prisma");
const redisClient = require("../config/redis");
const mockGateway = require("./mockPaymentGateway");
const { enqueuePaymentRetry } = require("../queues/paymentRetryQueue");

const IDEM_PREFIX = "payments:idempotency:";
const IDEM_TTL_SECONDS = 60 * 60 * 24;

const CB_FAILURE_THRESHOLD = Number(process.env.PAYMENT_CB_THRESHOLD || 5);
const CB_WINDOW_MS = Number(process.env.PAYMENT_CB_WINDOW_MS || 60000);
const CB_OPEN_MS = Number(process.env.PAYMENT_CB_OPEN_MS || 30000);

const circuitState = {
  state: "CLOSED",
  failures: [],
  openUntil: 0,
  halfOpenProbeUsed: false,
};

function buildIdempotencyCacheKey(idempotencyKey) {
  return `${IDEM_PREFIX}${idempotencyKey}`;
}

async function getCachedResult(idempotencyKey) {
  const cached = await redisClient.get(
    buildIdempotencyCacheKey(idempotencyKey),
  );
  return cached ? JSON.parse(cached) : null;
}

async function cacheResult(idempotencyKey, payload) {
  await redisClient.set(
    buildIdempotencyCacheKey(idempotencyKey),
    JSON.stringify(payload),
    "EX",
    IDEM_TTL_SECONDS,
  );
}

function pruneFailures(now) {
  circuitState.failures = circuitState.failures.filter(
    (ts) => now - ts <= CB_WINDOW_MS,
  );
}

function openCircuit(now) {
  circuitState.state = "OPEN";
  circuitState.openUntil = now + CB_OPEN_MS;
  circuitState.halfOpenProbeUsed = false;
}

function recordFailure() {
  const now = Date.now();
  pruneFailures(now);
  circuitState.failures.push(now);

  if (circuitState.state === "HALF_OPEN") {
    openCircuit(now);
    return;
  }

  if (circuitState.failures.length >= CB_FAILURE_THRESHOLD) {
    openCircuit(now);
  }
}

function recordSuccess() {
  circuitState.state = "CLOSED";
  circuitState.failures = [];
  circuitState.openUntil = 0;
  circuitState.halfOpenProbeUsed = false;
}

function canAttemptPayment() {
  const now = Date.now();

  if (circuitState.state === "OPEN") {
    if (now < circuitState.openUntil) {
      return false;
    }
    circuitState.state = "HALF_OPEN";
    circuitState.halfOpenProbeUsed = false;
  }

  if (circuitState.state === "HALF_OPEN") {
    if (circuitState.halfOpenProbeUsed) {
      return false;
    }
    circuitState.halfOpenProbeUsed = true;
  }

  return true;
}

function buildQueuedResponse(payment, registrationId, message) {
  return {
    ok: false,
    queued: true,
    statusCode: 202,
    payment_status: payment.status,
    payment_id: payment.id,
    registration_id: registrationId,
    message,
  };
}

async function settlePaymentSuccess({
  paymentId,
  registrationId,
  gatewayResponse,
}) {
  const { enqueueNotification } = require("../notifications/notificationQueue");

  const [updatedPayment] = await prisma.$transaction([
    prisma.payments.update({
      where: { id: paymentId },
      data: {
        status: "SUCCESS",
        gateway_response: gatewayResponse,
      },
    }),
    prisma.registrations.update({
      where: { id: registrationId },
      data: {
        payment_status: "PAID",
      },
    }),
  ]);

  // Fetch registration and user details for email notification
  const registration = await prisma.registrations.findUnique({
    where: { id: registrationId },
    include: {
      users: true,
      workshops: true,
    },
  });

  if (registration) {
    await enqueueNotification({
      user_email: registration.users?.email,
      full_name: registration.users?.full_name || "",
      workshop_info: {
        title: registration.workshops?.title || "Workshop",
        subject: `Workshop Ticket - ${registration.workshops?.title || "Workshop"}`,
        name: registration.workshops?.title || "",
        workshop_name: registration.workshops?.title || "",
        time: registration.workshops?.start_time
          ? registration.workshops.start_time.toISOString()
          : "",
        workshop_time: registration.workshops?.start_time
          ? new Date(registration.workshops.start_time).toLocaleString()
          : "",
      },
      qr_code_hash: registration.qr_code_hash,
    });
  }

  return updatedPayment;
}

async function attemptGatewayCharge({ payment, registration, idempotencyKey }) {
  const gatewayResponse = await mockGateway.charge({
    amount: payment.amount,
    registrationId: registration.id,
    idempotencyKey,
  });

  const updatedPayment = await settlePaymentSuccess({
    paymentId: payment.id,
    registrationId: registration.id,
    gatewayResponse,
  });

  const payload = {
    ok: true,
    payment_status: updatedPayment.status,
    payment_id: updatedPayment.id,
    registration_id: registration.id,
  };

  await cacheResult(idempotencyKey, payload);
  recordSuccess();

  return payload;
}

async function ensurePaymentRecord({ registration, idempotencyKey }) {
  const existingPayment = await prisma.payments.findUnique({
    where: { idempotency_key: idempotencyKey },
  });

  if (existingPayment) {
    return existingPayment;
  }

  return prisma.payments.create({
    data: {
      registration_id: registration.id,
      idempotency_key: idempotencyKey,
      amount: registration.workshops.price,
      status: "PENDING",
    },
  });
}

async function processPayment({ userId, registrationId, idempotencyKey }) {
  if (!idempotencyKey) {
    throw Object.assign(new Error("Missing X-Idempotency-Key header"), {
      statusCode: 400,
    });
  }

  const cachedResult = await getCachedResult(idempotencyKey);
  if (cachedResult) {
    return cachedResult;
  }

  const registration = await prisma.registrations.findFirst({
    where: {
      id: registrationId,
      user_id: userId,
    },
    include: {
      workshops: true,
    },
  });

  if (!registration) {
    throw Object.assign(new Error("Registration not found"), {
      statusCode: 404,
    });
  }

  if (!registration.workshops?.is_paid || !registration.workshops.price) {
    throw Object.assign(new Error("Workshop does not require payment"), {
      statusCode: 400,
    });
  }

  if (registration.payment_status === "PAID") {
    throw Object.assign(new Error("Registration already paid"), {
      statusCode: 409,
    });
  }

  const payment = await ensurePaymentRecord({
    registration,
    idempotencyKey,
  });

  if (payment.status === "SUCCESS") {
    const payload = {
      ok: true,
      payment_status: payment.status,
      payment_id: payment.id,
      registration_id: registration.id,
    };

    await cacheResult(idempotencyKey, payload);
    return payload;
  }

  if (payment.status === "FAILED") {
    const payload = {
      ok: false,
      payment_status: payment.status,
      payment_id: payment.id,
      registration_id: registration.id,
      message: "Payment failed. Please try again later.",
    };

    await cacheResult(idempotencyKey, payload);
    return payload;
  }

  if (!canAttemptPayment()) {
    const payload = buildQueuedResponse(
      payment,
      registration.id,
      "Payment gateway is busy. Your payment will be retried.",
    );

    await enqueuePaymentRetry({
      payment_id: payment.id,
    });
    await cacheResult(idempotencyKey, payload);
    return payload;
  }

  try {
    return await attemptGatewayCharge({
      payment,
      registration,
      idempotencyKey,
    });
  } catch (error) {
    recordFailure();

    await prisma.payments.update({
      where: { id: payment.id },
      data: {
        gateway_response: {
          status: "failed",
          reason: error.message,
          code: error.code || "PAYMENT_FAILED",
        },
      },
    });

    const payload = buildQueuedResponse(
      payment,
      registration.id,
      "Payment gateway is busy. Your payment will be retried.",
    );

    await enqueuePaymentRetry({
      payment_id: payment.id,
    });
    await cacheResult(idempotencyKey, payload);
    return payload;
  }
}

async function retryPayment({ paymentId }) {
  const payment = await prisma.payments.findUnique({
    where: { id: paymentId },
    include: {
      registrations: {
        include: { workshops: true },
      },
    },
  });

  if (!payment || !payment.registrations) {
    return { ok: false, skipped: true, message: "Payment not found" };
  }

  if (payment.status === "SUCCESS") {
    return { ok: true, skipped: true };
  }

  if (payment.status === "FAILED") {
    return { ok: false, skipped: true };
  }

  if (!canAttemptPayment()) {
    return { ok: false, message: "Circuit open" };
  }

  try {
    const payload = await attemptGatewayCharge({
      payment,
      registration: payment.registrations,
      idempotencyKey: payment.idempotency_key,
    });

    return payload;
  } catch (error) {
    recordFailure();

    await prisma.payments.update({
      where: { id: payment.id },
      data: {
        gateway_response: {
          status: "failed",
          reason: error.message,
          code: error.code || "PAYMENT_FAILED",
        },
      },
    });

    return { ok: false, message: error.message };
  }
}

function getMockPaymentMode() {
  return mockGateway.getPaymentMode();
}

function setMockPaymentMode(mode) {
  return mockGateway.setPaymentMode(mode);
}

module.exports = {
  processPayment,
  retryPayment,
  getMockPaymentMode,
  setMockPaymentMode,
};
