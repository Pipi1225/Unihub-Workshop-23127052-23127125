const crypto = require("crypto");

const VALID_MODES = new Set(["success", "failure"]);

let paymentMode = String(
  process.env.PAYMENT_MOCK_MODE || "success",
).toLowerCase();
if (!VALID_MODES.has(paymentMode)) {
  paymentMode = "success";
}

function getPaymentMode() {
  return paymentMode;
}

function setPaymentMode(mode) {
  const normalized = String(mode || "").toLowerCase();
  if (!VALID_MODES.has(normalized)) {
    throw Object.assign(new Error("Invalid payment mock mode"), {
      statusCode: 400,
    });
  }

  paymentMode = normalized;
}

async function charge({ amount, registrationId, idempotencyKey }) {
  if (paymentMode === "failure") {
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
