const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");
if (!fs.existsSync(envPath)) {
  console.error("Missing .env file");
  process.exit(1);
}

const envContents = fs.readFileSync(envPath, "utf8");
const lines = envContents.split(/\r?\n/);
const map = new Map();

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    continue;
  }
  const [key, ...rest] = trimmed.split("=");
  map.set(key, rest.join("=").trim());
}

const apiBaseUrl = map.get("EXPO_PUBLIC_API_BASE_URL");
if (!apiBaseUrl) {
  console.error("EXPO_PUBLIC_API_BASE_URL is missing in .env");
  process.exit(1);
}

console.log("Config OK:", apiBaseUrl);
