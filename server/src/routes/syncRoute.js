const express = require("express");
const asyncHandler = require("../middlewares/asyncHandler");
const authorize = require("../middlewares/authorize");
const registrationController = require("../controllers/registrationController");

const router = express.Router();

router.get(
  "/sync-data",
  authorize(["CHECKIN_STAFF"]),
  asyncHandler(registrationController.pullSync),
);

module.exports = router;
