const express = require("express");
const asyncHandler = require("../middlewares/asyncHandler");
const authController = require("../controllers/authController");

const router = express.Router();

router.post("/google", asyncHandler(authController.googleLogin));
router.post("/login", asyncHandler(authController.passwordLogin));
router.post("/refresh-token", asyncHandler(authController.refreshToken));
router.post("/logout", asyncHandler(authController.logout));

module.exports = router;
