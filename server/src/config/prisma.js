const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL in environment variables.");
}

const adapter = new PrismaPg({ connectionString });

// Khởi tạo một instance duy nhất của Prisma để dùng chung cho toàn bộ App
const prisma = new PrismaClient({
  adapter,
  // Bật log để bạn dễ debug xem Prisma sinh ra câu lệnh SQL gì (tùy chọn)
  log: ["query", "info", "warn", "error"],
});

// Xuất ra bằng module.exports để các file khác có thể gọi tới
module.exports = prisma;
