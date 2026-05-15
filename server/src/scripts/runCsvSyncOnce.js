require("dotenv").config();

const path = require("path");
const { runCsvSync, resolveStudentEmailDomains } = require("../services/csvSyncService");

const projectRoot = path.resolve(__dirname, "../../../");
const importDir = path.join(projectRoot, "data", "import");
const archiveDir = path.join(projectRoot, "data", "archive");
const errorDir = path.join(projectRoot, "data", "error");

async function main() {
	const result = await runCsvSync({
		importDir,
		archiveDir,
		errorDir,
		studentEmailDomains: resolveStudentEmailDomains(),
		logger: console,
	});

	console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});