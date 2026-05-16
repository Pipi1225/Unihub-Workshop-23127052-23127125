/**
 * Test Case 1-Multi: Race Condition from Multiple Users
 *
 * Scenario: 100 different users simultaneously attempt to register for a workshop
 * with exactly 1 available slot. Only 1 should succeed (201 Created), 99 should
 * fail with 409 Conflict (workshop full), NOT due to duplicate registration.
 *
 * Prerequisites:
 * - WORKSHOP_ID env var pointing to a workshop with 1 available slot
 * - BASE_URL pointing to backend server (default: http://localhost:4000)
 * - JWT_SECRET and other auth config must be set on backend
 *
 * Usage:
 *   WORKSHOP_ID=<uuid> node race_condition_multiuser.js
 *   WORKSHOP_ID=<uuid> NUM_USERS=100 node race_condition_multiuser.js
 */

const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

// Try to load jwt from server/node_modules or current node_modules
let jwt;
try {
  jwt = require("jsonwebtoken");
} catch (_e1) {
  try {
    jwt = require("../server/node_modules/jsonwebtoken");
  } catch (_e2) {
    throw new Error(
      "Cannot find jsonwebtoken module. Please run: npm install jsonwebtoken " +
        "in test_scripts/ or server/ directory",
    );
  }
}

// ============================================================================
// SETUP
// ============================================================================

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

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

// Load .env from server directory first (contains DATABASE_URL, JWT_SECRET, etc.)
const serverEnvPath = path.join(__dirname, "../server/.env");
loadEnvFile(serverEnvPath);

// Then load .env from test_scripts directory (can override)
const testScriptsEnvPath = path.join(__dirname, ".env");
loadEnvFile(testScriptsEnvPath);

const BASE_URL = process.env.BASE_URL || "http://localhost:4000";
const WORKSHOP_ID = process.env.WORKSHOP_ID || "";
const NUM_USERS = Number(process.env.NUM_USERS || 100);
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const QUEUE_DRAIN_TIMEOUT_MS = Number(
  process.env.QUEUE_DRAIN_TIMEOUT_MS || 60000,
);
const QUEUE_DRAIN_POLL_MS = Number(process.env.QUEUE_DRAIN_POLL_MS || 1000);

function requireEnv(value, name) {
  if (!value) {
    throw new Error(`${name} is missing. Set env ${name}.`);
  }
}

let prismaClient = null;

function getPrismaClient() {
  if (prismaClient) {
    return prismaClient;
  }

  const prismaPath = path.join(__dirname, "../server/src/config/prisma.js");
  prismaClient = require(prismaPath);
  return prismaClient;
}

// ============================================================================
// USER & TOKEN MANAGEMENT
// ============================================================================

/**
 * Generate a JWT access token for a test user
 * Mimics authService.createAccessToken()
 */
function createAccessToken(userId, role = "STUDENT") {
  const expiresIn = process.env.JWT_ACCESS_TTL || "15m";

  return jwt.sign(
    {
      sub: userId,
      role: role,
    },
    JWT_SECRET,
    { expiresIn },
  );
}

/**
 * Create test users directly in database
 * Returns array of { userId, email, token }
 */
async function createTestUsers(count) {
  console.log(`Creating ${count} test users...`);

  let prisma;
  try {
    prisma = getPrismaClient();
  } catch (error) {
    throw new Error(
      `Failed to load Prisma client: ${error.message}. ` +
        "Make sure you're running from project root.",
    );
  }

  const users = [];

  try {
    for (let i = 1; i <= count; i++) {
      const userId = randomUUID();
      const email = `test_race_${i}@example.com`;

      // Create user in database
      const user = await prisma.users.create({
        data: {
          id: userId,
          email: email,
          full_name: `Test User ${i}`,
          role: "STUDENT",
          is_active: true,
        },
      });

      // Generate JWT token
      const token = createAccessToken(userId, "STUDENT");

      users.push({
        userId: user.id,
        email: user.email,
        token: token,
      });

      if (i % 10 === 0) {
        console.log(`  Created ${i}/${count} users`);
      }
    }

    console.log(`✓ Successfully created ${count} test users`);
    return users;
  } catch (error) {
    throw new Error(`Failed to create test users: ${error.message}`);
  }
}

/**
 * Cleanup test users from database
 */
async function cleanupTestUsers(userIds) {
  console.log(`\nCleaning up ${userIds.length} test users...`);

  let prisma;
  try {
    prisma = getPrismaClient();
  } catch (error) {
    console.warn(`Warning: Could not cleanup users. ${error.message}`);
    return;
  }

  try {
    await prisma.registrations.deleteMany({
      where: {
        user_id: {
          in: userIds,
        },
      },
    });

    const result = await prisma.users.deleteMany({
      where: {
        id: {
          in: userIds,
        },
      },
    });

    console.log(`✓ Cleaned up ${result.count} test users`);
  } catch (error) {
    console.warn(`Warning: Cleanup failed. ${error.message}`);
  }
}

async function waitForPersistedRegistrations({
  workshopId,
  userIds,
  expectedCount,
  timeoutMs,
  pollMs,
}) {
  if (!expectedCount || expectedCount <= 0) {
    return { done: true, persisted: 0 };
  }

  const prisma = getPrismaClient();
  const start = Date.now();

  while (Date.now() - start <= timeoutMs) {
    const persisted = await prisma.registrations.count({
      where: {
        workshop_id: workshopId,
        user_id: { in: userIds },
      },
    });

    if (persisted >= expectedCount) {
      return { done: true, persisted };
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  const persisted = await prisma.registrations.count({
    where: {
      workshop_id: workshopId,
      user_id: { in: userIds },
    },
  });

  return { done: false, persisted };
}

// ============================================================================
// REQUEST HELPERS
// ============================================================================

async function requestJson(
  endpoint,
  { method = "GET", token, body, headers } = {},
) {
  const url = `${BASE_URL}${endpoint}`;
  const resolvedHeaders = {
    Accept: "application/json",
    ...headers,
  };

  if (token) {
    resolvedHeaders.Authorization = `Bearer ${token}`;
  }

  let payload;
  if (body !== undefined) {
    payload = JSON.stringify(body);
    resolvedHeaders["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method,
    headers: resolvedHeaders,
    body: payload,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_error) {
    data = null;
  }

  return { status: response.status, data, text };
}

// ============================================================================
// TEST EXECUTION
// ============================================================================

async function run() {
  requireEnv(WORKSHOP_ID, "WORKSHOP_ID");

  console.log("=== Race Condition Test: Multiple Users ===\n");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Workshop ID: ${WORKSHOP_ID}`);
  console.log(`Number of Users: ${NUM_USERS}\n`);

  let testUsers = [];
  let exitCode = 0; // Thêm biến lưu mã thoát
  let safeToCleanup = true;

  try {
    // Step 1: Create test users
    testUsers = await createTestUsers(NUM_USERS);

    // Step 2: Send concurrent registration requests
    console.log(`\nSending ${NUM_USERS} concurrent registration requests...`);

    const requests = testUsers.map((user) =>
      requestJson("/api/registrations", {
        method: "POST",
        token: user.token,
        body: { workshop_id: WORKSHOP_ID },
      }),
    );

    const results = await Promise.allSettled(requests);

    // Step 3: Analyze results
    console.log("\nAnalyzing results...\n");

    const stats = {
      success: 0, // 201 Created (got the slot)
      conflict: 0, // 409 Conflict - workshop full
      duplicate: 0, // 409 Conflict - already registered
      rate_limited: 0, // 429 Too Many Requests
      unauthorized: 0, // 401 Unauthorized
      other: 0, // Other errors
    };

    const otherStatuses = {};
    const detailedResults = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const user = testUsers[i];

      if (result.status !== "fulfilled") {
        stats.other += 1;
        detailedResults.push({
          user: user.email,
          status: "ERROR",
          message: result.reason?.message || "Request failed",
        });
        continue;
      }

      const { status, data } = result.value;
      const message = data?.message || "";

      detailedResults.push({
        user: user.email,
        status: status,
        message: message,
      });

      if (status === 201) {
        stats.success += 1;
      } else if (status === 409) {
        // Distinguish between "duplicate registration" and "workshop full"
        if (
          message.toLowerCase().includes("already registered") ||
          message.toLowerCase().includes("đã đăng ký")
        ) {
          stats.duplicate += 1;
        } else {
          stats.conflict += 1;
        }
      } else if (status === 429) {
        stats.rate_limited += 1;
      } else if (status === 401) {
        stats.unauthorized += 1;
      } else {
        stats.other += 1;
        const statusKey = String(status || "unknown");
        otherStatuses[statusKey] = (otherStatuses[statusKey] || 0) + 1;
      }
    }

    // Step 4: Display results
    console.log("Summary:");
    console.table(stats);

    console.log("\nExpected Outcome:");
    console.log("  ✓ Success: 1 (one user got the slot)");
    console.log(
      "  ✓ Conflict (workshop full): " +
        (NUM_USERS - 1) +
        " (others cannot register)",
    );
    console.log("  ✓ Duplicate: 0 (each user is unique)");

    console.log("\nActual Outcome:");
    console.log(
      `  ${stats.success === 1 ? "✓" : "✗"} Success: ${stats.success}`,
    );
    console.log(
      `  ${stats.conflict === NUM_USERS - 1 ? "✓" : "✗"} Conflict: ${stats.conflict}`,
    );
    console.log(
      `  ${stats.duplicate === 0 ? "✓" : "✗"} Duplicate: ${stats.duplicate}`,
    );

    if (Object.keys(otherStatuses).length > 0) {
      console.log("\nOther status breakdown:");
      console.table(otherStatuses);
    }

    // Show first few and last few results for reference
    console.log("\nSample Results (first 5 & last 5):");
    console.log(
      detailedResults
        .slice(0, 5)
        .concat(["..."])
        .concat(detailedResults.slice(-5))
        .map((r) => {
          if (r === "...") return r;
          return `  ${r.status === 201 ? "✓" : "✗"} ${r.user}: ${r.status} ${r.message}`;
        })
        .join("\n"),
    );

    const expectedPersisted = stats.success;
    if (expectedPersisted > 0) {
      console.log(
        `\nWaiting for queue drain (${expectedPersisted} registrations expected in DB)...`,
      );

      const persisted = await waitForPersistedRegistrations({
        workshopId: WORKSHOP_ID,
        userIds: testUsers.map((u) => u.userId),
        expectedCount: expectedPersisted,
        timeoutMs: QUEUE_DRAIN_TIMEOUT_MS,
        pollMs: QUEUE_DRAIN_POLL_MS,
      });

      if (persisted.done) {
        console.log(
          `✓ Queue drain completed: ${persisted.persisted}/${expectedPersisted} registrations persisted`,
        );
      } else {
        console.log(
          `✗ Queue drain timeout: ${persisted.persisted}/${expectedPersisted} registrations persisted`,
        );
        console.log(
          "Skipping cleanup to avoid deleting users while jobs may still be processing.",
        );
        safeToCleanup = false;
        exitCode = 1;
      }
    }

    // Step 5: Verify test success
    const testPassed =
      stats.success === 1 &&
      stats.conflict === NUM_USERS - 1 &&
      stats.duplicate === 0;

    console.log(`\n${testPassed ? "✓ TEST PASSED" : "✗ TEST FAILED"}`);

    // Gán biến thay vì gọi process.exit()
    exitCode = testPassed ? 0 : 1;
  } catch (error) {
    console.error("\nTest execution failed:", error.message);
    // Gán lỗi nếu có exception
    exitCode = 1;
  } finally {
    // Always cleanup
    if (testUsers.length > 0 && safeToCleanup) {
      await cleanupTestUsers(testUsers.map((u) => u.userId));
    } else if (testUsers.length > 0) {
      console.log("\nSkipping cleanup due to pending async processing.");
    }

    if (prismaClient) {
      await prismaClient.$disconnect().catch(() => {});
    }

    // Đảm bảo chương trình thoát ra ĐÚNG CHUẨN sau khi đã chạy xong dọn dẹp
    process.exit(exitCode);
  }
}

run();
