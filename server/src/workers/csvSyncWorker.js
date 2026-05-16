require("dotenv").config();

const path = require("path");
const IORedis = require("ioredis");
const { Queue, Worker, JobScheduler } = require("bullmq");
const prisma = require("../config/prisma");
const { runCsvSync, resolveStudentEmailDomains } = require("../services/csvSyncService");

const queueName = "csv-sync";
const jobName = "sync-students-csv";
const repeatPattern = process.env.CSV_SYNC_CRON || "0 2 * * *";
const projectRoot = path.resolve(__dirname, "../../../");
const importDir = path.join(projectRoot, "data", "import");
const archiveDir = path.join(projectRoot, "data", "archive");
const errorDir = path.join(projectRoot, "data", "error");
const batchSize = Number(process.env.CSV_SYNC_BATCH_SIZE || 1000);
const batchDelayMs = Number(process.env.CSV_SYNC_BATCH_DELAY_MS || 150);

if (!process.env.REDIS_URL) {
	throw new Error("Missing REDIS_URL in environment variables.");
}

const connection = new IORedis(process.env.REDIS_URL, {
	maxRetriesPerRequest: null,
	enableReadyCheck: false,
});

const queue = new Queue(queueName, { connection });
const scheduler = new JobScheduler(queueName, { connection });

const worker = new Worker(
	queueName,
	async (job) => {
		if (job.name !== jobName) {
			return { skipped: true };
		}

		return runCsvSync({
			importDir,
			archiveDir,
			errorDir,
			studentEmailDomains: resolveStudentEmailDomains(),
			batchSize,
			batchDelayMs,
			logger: console,
		});
	},
	{ connection }
);

worker.on("completed", (job, result) => {
	console.log(`[${job.id}] CSV sync completed`, result);
});

worker.on("failed", (job, error) => {
	console.error(`[${job?.id || "unknown"}] CSV sync failed:`, error.message);
});

async function bootstrap() {
	await scheduler.waitUntilReady();

	await queue.add(jobName, {}, {
		repeat: { pattern: repeatPattern },
		jobId: "daily-csv-sync",
		removeOnComplete: true,
		removeOnFail: 100,
	});

	console.log(`CSV sync worker is running. Cron: ${repeatPattern}`);
	console.log(`Student domains: ${resolveStudentEmailDomains().join(", ")}`);
	console.log(`Import dir: ${importDir}`);
	console.log(`Archive dir: ${archiveDir}`);
	console.log(`Error dir: ${errorDir}`);
}

async function shutdown(signal) {
	console.log(`Received ${signal}, shutting down CSV worker...`);
	await worker.close();
	await scheduler.close();
	await queue.close();
	await connection.quit();
	process.exit(0);
}

bootstrap().catch(async (error) => {
	console.error("Failed to bootstrap CSV sync worker:", error);
	await connection.quit();
	process.exit(1);
});

process.on("SIGINT", () => {
	shutdown("SIGINT");
});

process.on("SIGTERM", () => {
	shutdown("SIGTERM");
});