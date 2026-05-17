const paymentService = require("../services/paymentService");

async function processPayment(req, res) {
  const idempotencyKey = req.get("X-Idempotency-Key");
  const { registration_id: registrationId } = req.body || {};

  if (!registrationId) {
    return res.status(400).json({
      ok: false,
      message: "Missing registration_id",
    });
  }

  const result = await paymentService.processPayment({
    userId: req.user.id,
    registrationId,
    idempotencyKey,
  });

  const statusCode = result.statusCode || (result.ok ? 200 : 503);
  return res.status(statusCode).json(result);
}

async function getMockPaymentMode(_req, res) {
  res.status(200).json({
    ok: true,
    mode: await paymentService.getMockPaymentMode(),
  });
}

async function updateMockPaymentMode(req, res) {
  const { mode } = req.body || {};
  await paymentService.setMockPaymentMode(mode);

  res.status(200).json({
    ok: true,
    mode: await paymentService.getMockPaymentMode(),
  });
}

module.exports = {
  processPayment,
  getMockPaymentMode,
  updateMockPaymentMode,
};
