const crypto = require("crypto");
const redisClient = require("../config/redis");

const VALID_MODES = new Set(["success", "failure"]);
const PAYMENT_MODE_KEY = "payments:mock_mode";

let paymentMode = String(
  process.env.PAYMENT_MOCK_MODE || "success",
).toLowerCase();
if (!VALID_MODES.has(paymentMode)) {
  paymentMode = "success";
}

async function getPaymentMode() {
  const modeFromRedis = await redisClient.get(PAYMENT_MODE_KEY);
  const normalized = String(
    modeFromRedis || paymentMode || "success",
  ).toLowerCase();

  if (!VALID_MODES.has(normalized)) {
    return "success";
  }

  paymentMode = normalized;
  return normalized;
}

async function setPaymentMode(mode) {
  const normalized = String(mode || "").toLowerCase();
  if (!VALID_MODES.has(normalized)) {
    throw Object.assign(new Error("Invalid payment mock mode"), {
      statusCode: 400,
    });
  }

  paymentMode = normalized;
  await redisClient.set(PAYMENT_MODE_KEY, normalized);

  return normalized;
}

async function charge({ amount, registrationId, idempotencyKey }) {
  const mode = await getPaymentMode();
  if (mode === "failure") {
    const error = new Error("Mock payment gateway is unavailable");
    error.code = "PAYMENT_GATEWAY_DOWN";
    throw error;
  }

  return {
    status: "success",
    transaction_id: crypto.randomUUID(),
    amount,
    registration_id: registrationId,
    idempotency_key: idempotencyKey,
    processed_at: new Date().toISOString(),
  };
}

module.exports = {
  getPaymentMode,
  setPaymentMode,
  charge,
};
