const {
  BASE_URL,
  STUDENT_TOKEN,
  ORGANIZER_TOKEN,
  requireToken,
  requestJson,
  ensureRegistration,
  randomUUID,
} = require("./common");

const WORKSHOP_ID =
  process.env.WORKSHOP_ID || "bed7830c-ab08-4523-bf1f-e49ceed90d8d";
const REGISTRATION_ID = process.env.REGISTRATION_ID || "";
const ATTEMPTS = Number(process.env.ATTEMPTS || 8);
const READ_PINGS = Number(process.env.READ_PINGS || 5);

async function setMockMode(mode) {
  if (!ORGANIZER_TOKEN) {
    console.log(
      "Organizer token missing, skip changing payment mock mode.\n" +
        "Set PAYMENT_MOCK_MODE=failure in server env and restart, or provide ORGANIZER_TOKEN.",
    );
    return false;
  }

  await requestJson("/api/payments/mock-status", {
    method: "PUT",
    token: ORGANIZER_TOKEN,
    body: { mode },
  });
  console.log(`Mock payment mode set to: ${mode}`);
  return true;
}

async function run() {
  requireToken(STUDENT_TOKEN, "STUDENT_TOKEN");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Workshop ID: ${WORKSHOP_ID}`);

  const registrationId =
    REGISTRATION_ID || (await ensureRegistration(WORKSHOP_ID));

  await setMockMode("failure");

  const stats = {
    ok: 0,
    queued: 0,
    failed: 0,
  };
  const readStats = {
    ok: 0,
    failed: 0,
  };

  for (let i = 0; i < ATTEMPTS; i += 1) {
    const res = await requestJson("/api/payments/charge", {
      method: "POST",
      token: STUDENT_TOKEN,
      headers: {
        "X-Idempotency-Key": randomUUID(),
      },
      body: { registration_id: registrationId },
    });

    if (res.data?.ok) {
      stats.ok += 1;
    } else if (res.data?.queued) {
      stats.queued += 1;
    } else {
      stats.failed += 1;
    }
  }

  for (let i = 0; i < READ_PINGS; i += 1) {
    const res = await requestJson("/api/workshops", {
      method: "GET",
      token: STUDENT_TOKEN,
    });
    if (res.status === 200) {
      readStats.ok += 1;
    } else {
      readStats.failed += 1;
    }
  }

  console.log("\nResults:");
  console.table(stats);
  console.log("\nRead health (GET /api/workshops):");
  console.table(readStats);

  await setMockMode("success");
}

run().catch((error) => {
  console.error("Circuit breaker test failed:", error.message);
  process.exit(1);
});
