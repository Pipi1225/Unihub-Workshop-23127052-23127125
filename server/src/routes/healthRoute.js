const express = require("express");
const prisma = require("../config/prisma");
const redisClient = require("../config/redis");

const router = express.Router();

router.get("/health", async (_req, res) => {
  try {
    // Ping thử PostgreSQL thông qua Prisma
    await prisma.$queryRaw`SELECT 1`;

    // Ping thử Redis
    await redisClient.ping();

    res.status(200).json({
      ok: true,
      service: "UniHub Backend",
      database: "Connected",
      redis: "Connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health Check Error:", error);
    res.status(500).json({
      ok: false,
      service: "UniHub Backend",
      message: "Hạ tầng đang gặp sự cố (Lỗi DB hoặc Redis)",
      error: error.message,
    });
  }
});

module.exports = router;
