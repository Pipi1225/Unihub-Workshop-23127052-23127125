const { Queue } = require("bullmq");
const { createQueueConnection } = require("../config/queueConnection");

const REGISTRATION_PROCESSING_QUEUE = "registration_processing_queue";

const connection = createQueueConnection();
const registrationProcessingQueue = new Queue(REGISTRATION_PROCESSING_QUEUE, {
  connection,
});

function buildProcessingJobOptions() {
  return {
    attempts: Number(process.env.REGISTRATION_PROCESSING_ATTEMPTS || 5),
    backoff: { type: "exponential", delay: 10000 },
    removeOnComplete: true,
    removeOnFail: false,
  };
}

async function enqueueRegistrationProcessing(payload) {
  return registrationProcessingQueue.add(
    "process_registration",
    payload,
    buildProcessingJobOptions(),
  );
}

module.exports = {
  REGISTRATION_PROCESSING_QUEUE,
  registrationProcessingQueue,
  enqueueRegistrationProcessing,
};
