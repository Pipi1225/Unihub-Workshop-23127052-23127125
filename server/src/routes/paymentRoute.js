const express = require("express");
const asyncHandler = require("../middlewares/asyncHandler");
const authorize = require("../middlewares/authorize");
const paymentController = require("../controllers/paymentController");

const router = express.Router();

router.post(
  "/charge",
  authorize(["STUDENT"]),
  asyncHandler(paymentController.processPayment),
);

router.get(
  "/mock-status",
  authorize(["ORGANIZER"]),
  asyncHandler(paymentController.getMockPaymentMode),
);

router.put(
  "/mock-status",
  authorize(["ORGANIZER"]),
  asyncHandler(paymentController.updateMockPaymentMode),
);

module.exports = router;
