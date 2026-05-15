const {
  BASE_URL,
  STUDENT_TOKEN,
  requireToken,
  requestJson,
} = require("./common");

const WORKSHOP_ID =
  process.env.WORKSHOP_ID || "bed7830c-ab08-4523-bf1f-e49ceed90d8d";
const CONCURRENCY = Number(process.env.CONCURRENCY || 100);

async function run() {
  requireToken(STUDENT_TOKEN, "STUDENT_TOKEN");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Workshop ID: ${WORKSHOP_ID}`);
  console.log(`Concurrency: ${CONCURRENCY}`);

  const requests = Array.from({ length: CONCURRENCY }, () =>
    requestJson("/api/registrations", {
      method: "POST",
      token: STUDENT_TOKEN,
      body: { workshop_id: WORKSHOP_ID },
    }),
  );

  const results = await Promise.allSettled(requests);
  const stats = {
    success: 0,
    conflict: 0,
    full: 0,
    rate_limited: 0,
    other: 0,
  };
  const otherStatuses = {};

  for (const item of results) {
    if (item.status !== "fulfilled") {
      stats.other += 1;
      continue;
    }

    const { status, data } = item.value;
    if (status === 201) {
      stats.success += 1;
    } else if (status === 409) {
      if (data?.message && data.message.toLowerCase().includes("full")) {
        stats.full += 1;
      } else {
        stats.conflict += 1;
      }
    } else if (status === 429) {
      stats.rate_limited += 1;
    } else {
      stats.other += 1;
      const statusKey = String(status || "unknown");
      otherStatuses[statusKey] = (otherStatuses[statusKey] || 0) + 1;
      if (Object.keys(otherStatuses).length <= 3) {
        console.log(
          `Other response: ${statusKey} - ${data?.message || "(no message)"}`,
        );
      }
    }
  }

  console.log("\nResults:");
  console.table(stats);
  if (Object.keys(otherStatuses).length > 0) {
    console.log("\nOther status breakdown:");
    console.table(otherStatuses);
  }
}

run().catch((error) => {
  console.error("Race condition test failed:", error.message);
  process.exit(1);
});
