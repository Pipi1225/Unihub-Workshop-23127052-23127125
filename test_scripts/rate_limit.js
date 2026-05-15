const {
  BASE_URL,
  STUDENT_TOKEN,
  requireToken,
  requestJson,
} = require("./common");

const WORKSHOP_ID =
  process.env.WORKSHOP_ID || "bed7830c-ab08-4523-bf1f-e49ceed90d8d";
const REQUESTS = Number(process.env.REQUESTS || 80);
const DELAY_MS = Number(process.env.DELAY_MS || 0);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  requireToken(STUDENT_TOKEN, "STUDENT_TOKEN");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Workshop ID: ${WORKSHOP_ID}`);
  console.log(`Requests: ${REQUESTS}`);

  const stats = {
    success: 0,
    conflict: 0,
    rate_limited: 0,
    other: 0,
  };

  for (let i = 0; i < REQUESTS; i += 1) {
    const res = await requestJson("/api/registrations", {
      method: "POST",
      token: STUDENT_TOKEN,
      body: { workshop_id: WORKSHOP_ID },
    });

    if (res.status === 201) {
      stats.success += 1;
    } else if (res.status === 409) {
      stats.conflict += 1;
    } else if (res.status === 429) {
      stats.rate_limited += 1;
    } else {
      stats.other += 1;
    }

    if (DELAY_MS > 0) {
      await sleep(DELAY_MS);
    }
  }

  console.log("\nResults:");
  console.table(stats);
}

run().catch((error) => {
  console.error("Rate limit test failed:", error.message);
  process.exit(1);
});
