const express = require("express");
const asyncHandler = require("../middlewares/asyncHandler");
const authorize = require("../middlewares/authorize");
const statsController = require("../controllers/statsController");

const router = express.Router();

router.get("/", authorize(["ORGANIZER"]), asyncHandler(statsController.getStatistics));

router.get(
  "/workshops/:id",
  authorize(["ORGANIZER"]),
  asyncHandler(statsController.getWorkshopAnalytics),
);

module.exports = router;
