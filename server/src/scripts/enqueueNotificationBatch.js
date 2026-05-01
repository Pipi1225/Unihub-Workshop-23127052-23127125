require("dotenv").config();

const { enqueueNotification } = require("../notifications/notificationQueue");

function getArgValue(flag, defaultValue) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) {
    return defaultValue;
  }
  return process.argv[index + 1];
}

async function enqueueBatch() {
  const count = Number(getArgValue("--count", "1"));
  const batchSize = Number(getArgValue("--batch", "100"));

  const basePayload = {
    user_email: process.env.NOTIFICATION_TEST_EMAIL || "student@fitus.edu.vn",
    full_name: process.env.NOTIFICATION_TEST_NAME || "Test Student",
    workshop_info: {
      title: process.env.NOTIFICATION_TEST_WORKSHOP || "Intro Workshop",
      time: process.env.NOTIFICATION_TEST_TIME || "2026-04-29 08:00",
    },
    qr_code_hash: process.env.NOTIFICATION_TEST_QR || "qr-demo-0001",
  };

  const start = Date.now();
  let sent = 0;
  let queue = [];

  for (let i = 0; i < count; i += 1) {
    const payload = {
      ...basePayload,
      qr_code_hash: `${basePayload.qr_code_hash}-${i + 1}`,
    };

    queue.push(enqueueNotification(payload));

    if (queue.length >= batchSize) {
      await Promise.all(queue);
      sent += queue.length;
      queue = [];
    }
  }

  if (queue.length > 0) {
    await Promise.all(queue);
    sent += queue.length;
  }

  const elapsedMs = Date.now() - start;
  const avgMs = sent > 0 ? (elapsedMs / sent).toFixed(2) : 0;

  console.log(`Enqueued ${sent} jobs in ${elapsedMs} ms (avg ${avgMs} ms/job).`);
}

enqueueBatch().catch((error) => {
  console.error("Failed to enqueue notification jobs:", error.message);
  process.exit(1);
});
