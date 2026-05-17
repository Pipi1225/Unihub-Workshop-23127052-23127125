const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const BASE_URL = process.env.BASE_URL || "http://localhost:4000";
const STUDENT_TOKEN = process.env.STUDENT_TOKEN || "";
const ORGANIZER_TOKEN = process.env.ORGANIZER_TOKEN || "";

function requireToken(token, name) {
  if (!token) {
    throw new Error(`${name} is missing. Set env ${name}.`);
  }
}

async function requestJson(
  path,
  { method = "GET", token, body, headers } = {},
) {
  const url = `${BASE_URL}${path}`;
  const resolvedHeaders = {
    Accept: "application/json",
    ...headers,
  };

  if (token) {
    resolvedHeaders.Authorization = `Bearer ${token}`;
  }

  let payload;
  if (body !== undefined) {
    payload = JSON.stringify(body);
    resolvedHeaders["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method,
    headers: resolvedHeaders,
    body: payload,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_error) {
    data = null;
  }

  return { status: response.status, data, text };
}

async function ensureRegistration(workshopId) {
  requireToken(STUDENT_TOKEN, "STUDENT_TOKEN");

  const createRes = await requestJson("/api/registrations", {
    method: "POST",
    token: STUDENT_TOKEN,
    body: { workshop_id: workshopId },
  });
  // If registration_id returned immediately, we're done
  if (createRes.status === 201 && createRes.data?.registration_id) {
    return createRes.data.registration_id;
  }

  // If registration already exists (conflict), try to read existing
  if (createRes.status === 409) {
    const existing = await requestJson(
      `/api/registrations/by-workshop/${workshopId}`,
      { token: STUDENT_TOKEN },
    );

    if (existing.status === 200 && existing.data?.data?.id) {
      return existing.data.data.id;
    }
  }

  // Otherwise the registration was queued for background processing (PENDING).
  // Poll the registrations endpoint until the registration is persisted or timeout.
  const timeoutMs = Number(process.env.QUEUE_DRAIN_TIMEOUT_MS || 60000);
  const pollMs = Number(process.env.QUEUE_DRAIN_POLL_MS || 1000);
  const start = Date.now();

  while (Date.now() - start <= timeoutMs) {
    try {
      const res = await requestJson(
        `/api/registrations/by-workshop/${workshopId}`,
        {
          token: STUDENT_TOKEN,
        },
      );

      if (res.status === 200 && res.data?.data?.id) {
        return res.data.data.id;
      }
    } catch (_e) {
      // ignore transient errors and retry
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(
    `Failed to ensure registration. Status ${createRes.status}. ${createRes.text}`,
  );
}

module.exports = {
  BASE_URL,
  STUDENT_TOKEN,
  ORGANIZER_TOKEN,
  requireToken,
  requestJson,
  ensureRegistration,
  randomUUID,
};
