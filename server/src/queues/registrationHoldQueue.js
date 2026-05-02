const { Queue, QueueScheduler } = require("bullmq");
const { createQueueConnection } = require("../config/queueConnection");

const REGISTRATION_HOLD_QUEUE = "registration_hold_queue";

const connection = createQueueConnection();
const registrationHoldQueue = new Queue(REGISTRATION_HOLD_QUEUE, {
  connection,
});
const registrationHoldScheduler = new QueueScheduler(REGISTRATION_HOLD_QUEUE, {
  connection,
});

function buildHoldJobOptions(delayMs) {
  return {
    delay: delayMs,
    attempts: 3,
    backoff: { type: "exponential", delay: 60000 },
    removeOnComplete: true,
    removeOnFail: false,
  };
}

async function enqueueHoldExpiry(payload, delayMs) {
  return registrationHoldQueue.add(
    "expire_hold",
    payload,
    buildHoldJobOptions(delayMs),
  );
}

module.exports = {
  REGISTRATION_HOLD_QUEUE,
  registrationHoldQueue,
  registrationHoldScheduler,
  enqueueHoldExpiry,
};
