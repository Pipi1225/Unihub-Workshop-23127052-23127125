const prisma = require("../config/prisma");
const redisClient = require("../config/redis");
const mockGateway = require("./mockPaymentGateway");

const IDEM_PREFIX = "payments:idempotency:";
const IDEM_TTL_SECONDS = 60 * 60 * 24;

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

  const existingPayment = await prisma.payments.findUnique({
    where: { idempotency_key: idempotencyKey },
  });

  if (existingPayment) {
    const payload = {
      ok: existingPayment.status === "SUCCESS",
      payment_status: existingPayment.status,
      payment_id: existingPayment.id,
      registration_id: registration.id,
    };

    await cacheResult(idempotencyKey, payload);
    return payload;
  }

  const payment = await prisma.payments.create({
    data: {
      registration_id: registration.id,
      idempotency_key: idempotencyKey,
      amount: registration.workshops.price,
      status: "PENDING",
    },
  });

  try {
    const gatewayResponse = await mockGateway.charge({
      amount: payment.amount,
      registrationId: registration.id,
      idempotencyKey,
    });

    const [updatedPayment] = await prisma.$transaction([
      prisma.payments.update({
        where: { id: payment.id },
        data: {
          status: "SUCCESS",
          gateway_response: gatewayResponse,
        },
      }),
      prisma.registrations.update({
        where: { id: registration.id },
        data: {
          payment_status: "PAID",
        },
      }),
    ]);

    const payload = {
      ok: true,
      payment_status: updatedPayment.status,
      payment_id: updatedPayment.id,
      registration_id: registration.id,
    };

    await cacheResult(idempotencyKey, payload);
    return payload;
  } catch (error) {
    const gatewayResponse = {
      status: "failed",
      reason: error.message,
      code: error.code || "PAYMENT_FAILED",
    };

    const [updatedPayment] = await prisma.$transaction([
      prisma.payments.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          gateway_response: gatewayResponse,
        },
      }),
      prisma.registrations.update({
        where: { id: registration.id },
        data: {
          payment_status: "FAILED",
        },
      }),
    ]);

    const payload = {
      ok: false,
      payment_status: updatedPayment.status,
      payment_id: updatedPayment.id,
      registration_id: registration.id,
      message: "Payment failed. Please try again later.",
    };

    await cacheResult(idempotencyKey, payload);
    return payload;
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
  getMockPaymentMode,
  setMockPaymentMode,
};
