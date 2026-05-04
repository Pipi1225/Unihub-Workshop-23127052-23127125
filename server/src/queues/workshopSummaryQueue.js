const { Queue, QueueScheduler } = require("bullmq");
const { createQueueConnection } = require("../config/queueConnection");

const WORKSHOP_SUMMARY_QUEUE = "workshop_summary_queue";

const connection = createQueueConnection();
const workshopSummaryQueue = new Queue(WORKSHOP_SUMMARY_QUEUE, {
  connection,
});
const workshopSummaryScheduler = new QueueScheduler(WORKSHOP_SUMMARY_QUEUE, {
  connection,
});

function buildSummaryJobOptions() {
  return {
    attempts: 3,
    backoff: { type: "exponential", delay: 60000 },
    removeOnComplete: true,
    removeOnFail: false,
  };
}

async function enqueueWorkshopSummary(payload) {
  return workshopSummaryQueue.add(
    "summarize_pdf",
    payload,
    buildSummaryJobOptions(),
  );
}

module.exports = {
  WORKSHOP_SUMMARY_QUEUE,
  workshopSummaryQueue,
  workshopSummaryScheduler,
  enqueueWorkshopSummary,
};
