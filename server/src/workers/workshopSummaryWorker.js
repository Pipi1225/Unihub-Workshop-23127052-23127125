require("dotenv").config();

const { Worker } = require("bullmq");
const prisma = require("../config/prisma");
const { createQueueConnection } = require("../config/queueConnection");
const { WORKSHOP_SUMMARY_QUEUE } = require("../queues/workshopSummaryQueue");
const { generateSummaryFromPdf } = require("../services/aiSummaryService");
const { invalidateWorkshopsCache } = require("../utils/workshopCache");

const worker = new Worker(
  WORKSHOP_SUMMARY_QUEUE,
  async (job) => {
    const workshopId = job.data?.workshop_id || job.data?.workshopId;
    const pdfPath = job.data?.pdf_path || job.data?.pdfPath;

    if (!workshopId || !pdfPath) {
      throw new Error("Missing workshop_id or pdf_path");
    }

    const summary = await generateSummaryFromPdf(pdfPath);

    await prisma.workshops.update({
      where: { id: workshopId },
      data: {
        description: summary,
        ai_status: "COMPLETED",
      },
    });

    await invalidateWorkshopsCache();
  },
  {
    connection: createQueueConnection(),
    concurrency: Number(process.env.WORKSHOP_AI_CONCURRENCY || 2),
  },
);

worker.on("completed", (job) => {
  console.log(`[workshopSummaryWorker] Job ${job.id} completed`);
});

worker.on("failed", async (job, err) => {
  if (!job) {
    return;
  }
  console.error(
    `[workshopSummaryWorker] Job ${job.id} failed: ${err.message}`,
  );

  const attempts = job.opts?.attempts || 0;
  if (attempts && job.attemptsMade >= attempts) {
    const workshopId = job.data?.workshop_id || job.data?.workshopId;
    if (workshopId) {
      await prisma.workshops.update({
        where: { id: workshopId },
        data: { ai_status: "FAILED" },
      });
      await invalidateWorkshopsCache();
    }
  }
});

async function shutdown() {
  console.log("\n[workshopSummaryWorker] Shutting down...");
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
