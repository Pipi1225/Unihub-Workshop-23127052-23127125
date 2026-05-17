/**
 * Dọn dẹp toàn bộ test users sau khi load test xong.
 * Usage: node server/src/scripts/cleanupTestUsers.js
 */
const prisma = require("../config/prisma");

async function cleanupTestUsers() {
  console.log("🧹 Bắt đầu dọn dẹp test users...");

  try {
    // Tùy chọn: Nếu không dùng Cascade Delete trong Schema, bạn phải xóa dữ liệu đăng ký trước.
    // Xóa comment dòng dưới nếu bạn gặp lỗi khóa ngoại (Foreign Key Constraint):
    // await prisma.registrations.deleteMany({ where: { users: { email: { startsWith: 'testuser' } } } });

    const result = await prisma.users.deleteMany({
      where: {
        email: {
          startsWith: "testuser", // Chỉ xóa những user được tạo từ file seed
        },
      },
    });

    console.log(
      `✅ Dọn dẹp hoàn tất! Đã xóa thành công ${result.count} test users.`,
    );
  } catch (error) {
    console.error("❌ Lỗi trong quá trình dọn dẹp:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupTestUsers();
