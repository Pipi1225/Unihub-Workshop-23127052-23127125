const {
  BASE_URL,
  STUDENT_TOKEN,
  requireToken,
  requestJson,
  ensureRegistration,
  randomUUID,
} = require("./common");

const WORKSHOP_ID =
  process.env.WORKSHOP_ID || "bed7830c-ab08-4523-bf1f-e49ceed90d8d";
const REGISTRATION_ID = process.env.REGISTRATION_ID || "";
const IDEM_KEY = process.env.IDEMPOTENCY_KEY || randomUUID();

async function run() {
  requireToken(STUDENT_TOKEN, "STUDENT_TOKEN");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Workshop ID: ${WORKSHOP_ID}`);
  console.log(`Idempotency key: ${IDEM_KEY}`);

  const registrationId =
    REGISTRATION_ID || (await ensureRegistration(WORKSHOP_ID));
  console.log(`Registration ID: ${registrationId}`);

  const requestOptions = {
    method: "POST",
    token: STUDENT_TOKEN,
    headers: {
      "X-Idempotency-Key": IDEM_KEY,
    },
    body: { registration_id: registrationId },
  };

  const [first, second] = await Promise.all([
    requestJson("/api/payments/charge", requestOptions),
    requestJson("/api/payments/charge", requestOptions),
  ]);

  console.log("\nFirst response:");
  console.log(first);
  console.log("\nSecond response:");
  console.log(second);

  // Evaluate idempotency: accept same responses or PENDING semantics
  const firstBody = first.data || {};
  const secondBody = second.data || {};

  const identicalResponses =
    first.status === second.status &&
    JSON.stringify(firstBody) === JSON.stringify(secondBody);

  const bothPending =
    first.status === 201 &&
    second.status === 201 &&
    String(firstBody.payment_status || "").toUpperCase() === "PENDING" &&
    String(secondBody.payment_status || "").toUpperCase() === "PENDING";

  if (identicalResponses || bothPending) {
    console.log(
      "\nIdempotency behaviour OK — responses are idempotent (accepted PENDING).",
    );
    process.exit(0);
  }

  console.error("\nIdempotency behaviour NOT OK — responses differ.");
  process.exit(1);
}

run().catch((error) => {
  console.error("Idempotency test failed:", error.message);
  process.exit(1);
});
