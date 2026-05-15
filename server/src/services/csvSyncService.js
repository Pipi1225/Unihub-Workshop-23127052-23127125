const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const csvParser = require("csv-parser");
const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");

function getDateStamp(date = new Date()) {
	return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripDiacritics(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/đ/g, "d")
		.replace(/Đ/g, "D");
}

function normalizeHeader(header) {
	return stripDiacritics(header)
		.replace(/^\uFEFF/, "")
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_|_$/g, "");
}

function pickValue(row, keys) {
	for (const key of keys) {
		const value = row[key];
		if (value !== undefined && value !== null && String(value).trim() !== "") {
			return String(value).trim();
		}
	}

	return "";
}

function normalizeEmail(email) {
	return String(email || "").trim().toLowerCase();
}

function normalizeFullName(fullName) {
	return String(fullName || "")
		.trim()
		.replace(/\s+/g, " ")
		.split(" ")
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(" ");
}

function resolveStudentEmailDomains() {
	// Parse multiple domains (comma-separated) from env
	const override = process.env.CSV_STUDENT_EMAIL_DOMAIN;
	if (override && String(override).trim()) {
		return String(override)
			.split(",")
			.map((domain) => domain.trim().toLowerCase())
			.filter(Boolean);
	}

	const allowedDomains = String(process.env.ALLOWED_EMAIL_DOMAINS || "")
		.split(",")
		.map((domain) => domain.trim().toLowerCase())
		.filter(Boolean);

	const studentDomains = allowedDomains.filter((domain) => domain.startsWith("student."));
	return studentDomains.length > 0 ? studentDomains : ["student.fitus.edu.vn"];
}

async function ensureDirectory(directoryPath) {
	await fsp.mkdir(directoryPath, { recursive: true });
}

async function findLatestCsvFile(importDir) {
	const entries = await fsp.readdir(importDir, { withFileTypes: true });
	const candidates = [];

	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".csv")) {
			continue;
		}

		const filePath = path.join(importDir, entry.name);
		const stats = await fsp.stat(filePath);
		candidates.push({
			fileName: entry.name,
			filePath,
			mtimeMs: stats.mtimeMs,
		});
	}

	candidates.sort((first, second) => second.mtimeMs - first.mtimeMs);
	return candidates[0] || null;
}

async function appendErrorLog(errorLogPath, message) {
	await fsp.appendFile(errorLogPath, `${message}\n`, "utf8");
}

function buildInsertQuery(batch) {
	const values = Prisma.join(
		batch.map(
			(record) =>
				Prisma.sql`(${record.email}, ${record.full_name}, ${record.password_hash})`
		)
	);

	return Prisma.sql`
		INSERT INTO users (email, full_name, password_hash)
		VALUES ${values}
		ON CONFLICT (email) DO UPDATE
		SET full_name = EXCLUDED.full_name,
			updated_at = NOW()
	`;
}

async function flushBatch(batch) {
	if (!batch.length) {
		return 0;
	}

	await prisma.$executeRaw(buildInsertQuery(batch));
	return batch.length;
}

async function processCsvFile({ filePath, fileName, importDir, archiveDir, errorDir, studentEmailDomains, batchSize, batchDelayMs, logger }) {
	const dateStamp = getDateStamp();
	const errorLogPath = path.join(errorDir, `error_${dateStamp}.log`);
	const archiveFileName = fileName.replace(/\.csv$/i, "_DONE.csv");
	const archivedPath = path.join(archiveDir, archiveFileName);

	let processedCount = 0;
	let skippedCount = 0;
	let batch = [];
	let lineNumber = 1;

	const stream = fs.createReadStream(filePath).pipe(
		csvParser({
			mapHeaders: ({ header }) => normalizeHeader(header),
			skipLines: 0,
		})
	);

	try {
		for await (const row of stream) {
			lineNumber += 1;

			try {
				const email = normalizeEmail(pickValue(row, ["email", "student_email", "mail"]));
				const fullName = normalizeFullName(
					pickValue(row, ["full_name", "fullname", "name", "ho_ten", "hoten"])
				);

				if (!email) {
					throw new Error("Missing email");
				}

				if (!fullName) {
					throw new Error("Missing full_name");
				}

				if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
					throw new Error("Invalid email format");
				}

				// Check if email ends with any of the allowed student domains
				const hasValidDomain = studentEmailDomains.some((domain) =>
					email.endsWith(`@${domain}`)
				);
				if (!hasValidDomain) {
					throw new Error(
						`Email must end with one of: @${studentEmailDomains.join(", @")}`
					);
				}

				batch.push({
					email,
					full_name: fullName,
					password_hash: null,
				});

				if (batch.length >= batchSize) {
					const flushed = await flushBatch(batch);
					processedCount += flushed;
					batch = [];

					if (batchDelayMs > 0) {
						await sleep(batchDelayMs);
					}
				}
			} catch (rowError) {
				skippedCount += 1;
				await appendErrorLog(
					errorLogPath,
					`[${new Date().toISOString()}] line=${lineNumber} reason=${rowError.message} row=${JSON.stringify(row)}`
				);
			}
		}

		if (batch.length) {
			const flushed = await flushBatch(batch);
			processedCount += flushed;
		}

		await ensureDirectory(archiveDir);
		await fsp.rename(filePath, archivedPath);

		logger.info(
			`Đã đồng bộ thành công ${processedCount} bản ghi, thất bại ${skippedCount} bản ghi`
		);

		return {
			ok: true,
			fileName,
			archivedFileName: archiveFileName,
			processedCount,
			skippedCount,
			errorLogPath,
		};
	} catch (error) {
		throw new Error(`CSV sync failed for ${fileName}: ${error.message}`);
	}
}

async function runCsvSync({
	importDir,
	archiveDir,
	errorDir,
	studentEmailDomains = resolveStudentEmailDomains(),
	batchSize = Number(process.env.CSV_SYNC_BATCH_SIZE || 1000),
	batchDelayMs = Number(process.env.CSV_SYNC_BATCH_DELAY_MS || 150),
	logger = console,
} = {}) {
	if (!importDir || !archiveDir || !errorDir) {
		throw new Error("Missing CSV sync directories");
	}

	await ensureDirectory(importDir);
	await ensureDirectory(archiveDir);
	await ensureDirectory(errorDir);

	const latestCsv = await findLatestCsvFile(importDir);
	if (!latestCsv) {
		logger.warn(`Không tìm thấy file CSV đồng bộ ngày ${getDateStamp()}`);
		return {
			ok: true,
			skipped: true,
			processedCount: 0,
			skippedCount: 0,
		};
	}

	return processCsvFile({
		...latestCsv,
		importDir,
		archiveDir,
		errorDir,
		studentEmailDomains,
		batchSize,
		batchDelayMs,
		logger,
	});
}

module.exports = {
	runCsvSync,
	resolveStudentEmailDomains,
	findLatestCsvFile,
	normalizeFullName,
	normalizeEmail,
};