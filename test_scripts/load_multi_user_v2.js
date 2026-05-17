/**
 * All-in-One Load Test: 3000 Users / 1 Minute
 * * Mô phỏng: Tạo 3000 users (UUID) -> Bắn 50 req/s -> Tự động dọn dẹp dữ liệu.
 * * Usage:
 * WORKSHOP_ID=<uuid> node load_test_integrated.js
 */

const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

let jwt;
try {
  jwt = require("jsonwebtoken");
} catch (e) {
  jwt = require("../server/node_modules/jsonwebtoken");
}

// ============================================================================
// 1. SETUP ENVIRONMENT
// ============================================================================
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(__dirname, "../server/.env"));
loadEnvFile(path.join(__dirname, ".env"));

const BASE_URL = process.env.BASE_URL || "http://localhost:4000";
const WORKSHOP_ID =
  process.env.WORKSHOP_ID || "bed7830c-ab08-4523-bf1f-e49ceed90d8d";
const NUM_USERS = Number(process.env.TOTAL_USERS || 3000);
const TOTAL_MINUTES = Number(process.env.TOTAL_MINUTES || 1);
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const VERIFICATION_TIMEOUT_MS = Number(
  process.env.VERIFICATION_TIMEOUT_MS || 180000,
);
const VERIFICATION_POLL_MS = Number(process.env.VERIFICATION_POLL_MS || 3000);

let prismaClient = null;
function getPrismaClient() {
  if (prismaClient) return prismaClient;
  prismaClient = require(
    path.join(__dirname, "../server/src/config/prisma.js"),
  );
  return prismaClient;
}

// ============================================================================
// 2. HELPER FUNCTIONS
// ============================================================================
function createAccessToken(userId) {
  return jwt.sign({ sub: userId, role: "STUDENT" }, JWT_SECRET, {
    expiresIn: "1h",
  });
}

async function requestJson(endpoint, { method = "GET", token, body }) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (body) {
    payload = JSON.stringify(body);
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, { method, headers, body: payload });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {}
  return { status: response.status, data };
}

function formatDuration(ms) {
  return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// 3. MAIN EXECUTION
// ============================================================================
async function run() {
  console.log(
    `🚀 Bắt đầu Load Test Toàn Diện (${NUM_USERS} Users / ${TOTAL_MINUTES} Phút)`,
  );
  console.log(`Target Workshop: ${WORKSHOP_ID}\n`);

  let testUsers = [];
  const prisma = getPrismaClient();
  let workshopBefore = null;
  let loadStats = null;

  try {
    // --- BƯỚC 1: Mồi Dữ Liệu (Seed) ---
    console.log(`🌱 Đang tạo ${NUM_USERS} test users bằng bulk insert...`);
    const userRecords = Array.from({ length: NUM_USERS }, (_, i) => ({
      id: randomUUID(),
      email: `test_load_${Date.now()}_${i}@example.com`,
      full_name: `Test Load User ${i}`,
      role: "STUDENT",
      is_active: true,
    }));

    // Dùng createMany để insert 3000 users cực nhanh thay vì lặp từng record
    await prisma.users.createMany({ data: userRecords, skipDuplicates: true });

    // Gắn token cho user trên RAM để bắn request
    testUsers = userRecords.map((u) => ({
      id: u.id,
      token: createAccessToken(u.id),
    }));
    console.log(`✅ Đã tạo xong ${testUsers.length} users.\n`);

    workshopBefore = await prisma.workshops.findUnique({
      where: { id: WORKSHOP_ID },
      select: {
        id: true,
        available_slots: true,
      },
    });

    if (!workshopBefore) {
      throw new Error(`Workshop not found: ${WORKSHOP_ID}`);
    }

    console.log(
      `📌 Workshop slots before load: ${workshopBefore.available_slots}`,
    );

    // --- BƯỚC 2: Tấn công (Load Test) ---
    console.log(
      `🔥 Bắt đầu bắn ${NUM_USERS} requests trong ${TOTAL_MINUTES * 60} giây...`,
    );
    const totalSeconds = TOTAL_MINUTES * 60;
    const reqPerSec = NUM_USERS / totalSeconds;

    const stats = {
      total: 0,
      success: 0,
      conflict: 0,
      full: 0,
      rate_limited: 0,
      errors: 0,
    };
    const responseTimes = [];
    let sent = 0,
      second = 0,
      carry = 0,
      userIndex = 0;

    await new Promise((resolve) => {
      const timer = setInterval(async () => {
        if (second >= totalSeconds) {
          clearInterval(timer);
          resolve();
          return;
        }

        const desired = reqPerSec + carry;
        const requestCount = Math.floor(desired);
        carry = desired - requestCount;

        const batch = Array.from({ length: requestCount }, () => {
          if (userIndex >= testUsers.length) return Promise.resolve();
          const user = testUsers[userIndex++];
          const startTime = Date.now();

          return requestJson("/api/registrations", {
            method: "POST",
            token: user.token,
            body: { workshop_id: WORKSHOP_ID },
          })
            .then((res) => {
              responseTimes.push(Date.now() - startTime);
              stats.total++;
              if (res.status === 201) stats.success++;
              else if (res.status === 429) stats.rate_limited++;
              else if (res.status === 409) {
                if (res.data?.message?.toLowerCase().includes("full"))
                  stats.full++;
                else stats.conflict++;
              }
            })
            .catch(() => {
              stats.total++;
              stats.errors++;
            });
        });

        await Promise.allSettled(batch);
        sent += requestCount;
        second++;

        if (second % 5 === 0 || second === totalSeconds) {
          console.log(
            `[${Math.round((second / totalSeconds) * 100)
              .toString()
              .padStart(
                3,
              )}%] ${second}s | Sent: ${sent} | Success: ${stats.success} | Limited: ${stats.rate_limited}`,
          );
        }
      }, 1000);
    });

    // --- BƯỚC 3: Thống kê ---
    const sorted = responseTimes.sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;

    loadStats = {
      total: stats.total,
      success: stats.success,
      conflict: stats.conflict,
      full: stats.full,
      rate_limited: stats.rate_limited,
      errors: stats.errors,
    };

    console.log("\n📊 KẾT QUẢ LOAD TEST:");
    console.log(`├─ Tổng request xử lý: ${stats.total}`);
    console.log(`├─ Thành công (201): ${stats.success}`);
    console.log(`├─ Chặn Rate Limit (429): ${stats.rate_limited}`);
    console.log(`├─ Hết chỗ (409 Full): ${stats.full}`);
    console.log(
      `├─ P95 Response Time: ${formatDuration(p95)} (Yêu cầu < 500ms: ${p95 < 500 ? "✅" : "❌"})`,
    );
  } catch (error) {
    console.error("❌ Test thất bại:", error.message);
  } finally {
    // --- BƯỚC 4: Xác nhận worker đã xử lý xong rồi mới dọn rác ---
    if (testUsers.length > 0 && workshopBefore && loadStats) {
      const userIds = testUsers.map((u) => u.id);
      const expectedRegistrations = loadStats.success;
      const expectedSlots = Math.max(
        0,
        workshopBefore.available_slots - expectedRegistrations,
      );

      console.log("\n⏳ Đang chờ worker xử lý xong trước khi dọn dẹp...");
      const verifyStart = Date.now();
      let verified = false;

      while (Date.now() - verifyStart < VERIFICATION_TIMEOUT_MS) {
        const [registrationCount, workshopAfter] = await Promise.all([
          prisma.registrations.count({
            where: {
              user_id: { in: userIds },
              workshop_id: WORKSHOP_ID,
            },
          }),
          prisma.workshops.findUnique({
            where: { id: WORKSHOP_ID },
            select: { available_slots: true },
          }),
        ]);

        const slotsOk =
          workshopAfter && workshopAfter.available_slots === expectedSlots;
        const regsOk = registrationCount === expectedRegistrations;

        console.log(
          `  - registrations: ${registrationCount}/${expectedRegistrations}, slots: ${workshopAfter?.available_slots}/${expectedSlots}`,
        );

        if (slotsOk && regsOk) {
          verified = true;
          break;
        }

        await sleep(VERIFICATION_POLL_MS);
      }

      if (!verified) {
        console.log(
          `⚠️ Chưa xác nhận đủ slot đã trừ sau ${formatDuration(VERIFICATION_TIMEOUT_MS)}. Bỏ qua cleanup để tránh xóa sớm.`,
        );
      } else {
        console.log(
          "✅ Đã xác nhận worker xử lý xong, bắt đầu dọn dẹp database...",
        );
        try {
          await prisma.registrations.deleteMany({
            where: { user_id: { in: userIds } },
          });
          const delRes = await prisma.users.deleteMany({
            where: { id: { in: userIds } },
          });
          console.log(`✅ Đã dọn sạch ${delRes.count} users test.`);
        } catch (err) {
          console.log(`⚠️ Lỗi khi dọn dẹp: ${err.message}`);
        }
      }
    }

    if (prismaClient) await prismaClient.$disconnect();
    process.exit(0);
  }
}

run();
