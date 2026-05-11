const express = require("express");
const asyncHandler = require("../middlewares/asyncHandler");
const authorize = require("../middlewares/authorize");
const { createRateLimiter } = require("../middlewares/rateLimiter");
const { uploadWorkshopAssets } = require("../middlewares/uploadWorkshopAssets");
const workshopController = require("../controllers/workshopController");

const router = express.Router();

const workshopListLimiter = createRateLimiter({
  keyPrefix: "rate:workshops:list:",
  capacity: Number(process.env.WORKSHOP_LIST_RATE_LIMIT || 300),
  refillPerSecond: Number(process.env.WORKSHOP_LIST_REFILL || 20),
});

router.get(
  "/",
  workshopListLimiter,
  asyncHandler(workshopController.listWorkshops),
);

router.get("/:id", asyncHandler(workshopController.getWorkshop));

router.post(
  "/",
  authorize(["ORGANIZER"]),
  uploadWorkshopAssets.fields([
    { name: "pdf", maxCount: 1 },
    { name: "room_map", maxCount: 1 },
  ]),
  asyncHandler(workshopController.createWorkshop),
);

router.put(
  "/:id",
  authorize(["ORGANIZER"]),
  uploadWorkshopAssets.fields([
    { name: "pdf", maxCount: 1 },
    { name: "room_map", maxCount: 1 },
  ]),
  asyncHandler(workshopController.updateWorkshop),
);

router.delete(
  "/:id",
  authorize(["ORGANIZER"]),
  asyncHandler(workshopController.deleteWorkshop),
);

module.exports = router;
