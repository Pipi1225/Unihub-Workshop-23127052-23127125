const { Redis } = require("ioredis");
require("dotenv").config();

function createQueueConnection() {
  return new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
}

module.exports = {
  createQueueConnection,
};
