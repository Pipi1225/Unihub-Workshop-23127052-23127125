/**
 * Seed 3,000 test users để dùng cho load test.
 * Usage: node server/src/scripts/seedTestUsers.js [count] [startId]
 */
const prisma = require("../config/prisma");

async function seedTestUsers(count = 3000, startId = 1) {
  console.log(`🌱 Seeding ${count} test users...`);

  const batchSize = 1000;
  let created = 0;

  for (let batch = 0; batch < Math.ceil(count / batchSize); batch++) {
    const start = batch * batchSize;
    const end = Math.min(start + batchSize, count);
    const users = [];

    for (let i = start; i < end; i++) {
      const userId = startId + i;
      users.push({
        email: `testuser${userId}@example.com`,
        full_name: `Test User ${userId}`,
        role: "STUDENT",
        is_active: true,
      });
    }

    try {
      const result = await prisma.users.createMany({
        data: users,
        skipDuplicates: true,
      });

      created += result.count;
      console.log(
        `  [${batch + 1}/${Math.ceil(count / batchSize)}] Created ${result.count} users (total: ${created})`,
      );
    } catch (error) {
      console.error(`  ❌ Error creating batch ${batch + 1}:`, error.message);
    }
  }

  console.log(`\n✅ Seeding complete! Created ${created} test users.`);
}

seedTestUsers()
  .catch((error) => {
    console.error("❌ Seeding failed:", error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
