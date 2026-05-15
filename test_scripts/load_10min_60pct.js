const {
  BASE_URL,
  STUDENT_TOKEN,
  requestJson,
  requireToken,
} = require("./common");

const TARGET_PATH = process.env.TARGET_PATH || "/api/workshops";
const METHOD = process.env.METHOD || "GET";
const TOTAL_USERS = Number(process.env.TOTAL_USERS || 12000);
const TOTAL_MINUTES = Number(process.env.TOTAL_MINUTES || 10);
const PEAK_PERCENT = Number(process.env.PEAK_PERCENT || 0.6);
const PEAK_MINUTES = Number(process.env.PEAK_MINUTES || 3);
const USE_TOKEN =
  String(process.env.USE_TOKEN || "false").toLowerCase() === "true";

async function run() {
  if (USE_TOKEN) {
    requireToken(STUDENT_TOKEN, "STUDENT_TOKEN");
  }

  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Target: ${METHOD} ${TARGET_PATH}`);
  const totalSeconds = Math.max(1, Math.floor(TOTAL_MINUTES * 60));
  const peakSeconds = Math.max(1, Math.floor(PEAK_MINUTES * 60));
  const peakUsers = Math.max(0, Math.floor(TOTAL_USERS * PEAK_PERCENT));
  const restUsers = Math.max(0, TOTAL_USERS - peakUsers);
  const ratePeak = peakUsers / peakSeconds;
  const rateRest = restUsers / Math.max(1, totalSeconds - peakSeconds);

  console.log(`Total users: ${TOTAL_USERS}`);
  console.log(`Window: ${TOTAL_MINUTES}m`);
  console.log(`Peak: ${Math.round(PEAK_PERCENT * 100)}% in ${PEAK_MINUTES}m`);
  console.log(`Rate (peak): ${ratePeak.toFixed(2)} req/s`);
  console.log(`Rate (rest): ${rateRest.toFixed(2)} req/s`);

  const stats = {
    ok: 0,
    failed: 0,
  };

  let sent = 0;
  let second = 0;
  let carry = 0;

  const timer = setInterval(async () => {
    if (second >= totalSeconds) {
      clearInterval(timer);
      console.log("\nDone.");
      console.table(stats);
      return;
    }

    const currentRate = second < peakSeconds ? ratePeak : rateRest;
    const desired = currentRate + carry;
    const requestCount = Math.floor(desired);
    carry = desired - requestCount;

    const batch = Array.from({ length: requestCount }, () =>
      requestJson(TARGET_PATH, {
        method: METHOD,
        token: USE_TOKEN ? STUDENT_TOKEN : undefined,
      }),
    );

    const results = await Promise.allSettled(batch);
    for (const result of results) {
      if (result.status === "fulfilled" && result.value.status < 400) {
        stats.ok += 1;
      } else {
        stats.failed += 1;
      }
      sent += 1;
    }

    second += 1;
    if (second % 10 === 0) {
      console.log(`Progress: ${second}s, sent ${sent}`);
    }
  }, 1000);
}

run().catch((error) => {
  console.error("Load test failed:", error.message);
  process.exit(1);
});
