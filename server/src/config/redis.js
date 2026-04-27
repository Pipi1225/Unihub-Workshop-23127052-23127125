const { Redis } = require("ioredis");
require("dotenv").config();

// Khởi tạo instance kết nối Redis
const redisClient = new Redis(process.env.REDIS_URL);

redisClient.on("connect", () => {
  console.log("🟢 Đã kết nối thành công tới Redis (Upstash Cloud)!");
});

redisClient.on("error", (error) => {
  console.error("🔴 Lỗi kết nối Redis:", error.message);
});

module.exports = redisClient;
