const express = require("express");
const asyncHandler = require("../middlewares/asyncHandler");
const authorize = require("../middlewares/authorize");
const { createRateLimiter } = require("../middlewares/rateLimiter");
const registrationController = require("../controllers/registrationController");

const router = express.Router();

const registrationRateLimiter = createRateLimiter({
  keyPrefix: "rate:registration:",
  capacity: Number(process.env.REGISTRATION_RATE_LIMIT || 30),
  refillPerSecond: Number(process.env.REGISTRATION_RATE_REFILL || 0.5),
});

router.post(
  "/",
  authorize(["STUDENT"]),
  registrationRateLimiter,
  asyncHandler(registrationController.registerWorkshop),
);

router.get(
  "/",
  authorize(["STUDENT"]),
  asyncHandler(registrationController.listMyRegistrations),
);

router.get(
  "/by-workshop/:workshopId",
  authorize(["STUDENT"]),
  asyncHandler(registrationController.getRegistrationByWorkshop),
);

router.get(
  "/:id",
  authorize(["STUDENT"]),
  asyncHandler(registrationController.getRegistration),
);

router.put(
  "/sync",
  authorize(["CHECKIN_STAFF"]),
  asyncHandler(registrationController.syncRegistrations),
);

module.exports = router;
