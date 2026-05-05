const fsp = require("fs/promises");
const path = require("path");
const QRCode = require("qrcode");

const TEMPLATE_PATH = path.join(__dirname, "templates", "emailTicket.html");

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return ["true", "1", "yes", "y"].includes(String(value).toLowerCase());
}

function resolveEmbedMode() {
  const explicit = String(process.env.QR_CODE_EMBED_MODE || "").trim().toLowerCase();
  if (explicit) {
    return explicit;
  }

  return parseBoolean(process.env.QR_CODE_EMBED, false) ? "data" : "cid";
}

function replaceTokens(template, tokens) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(tokens, key)) {
      return String(tokens[key] ?? "");
    }
    return "";
  });
}

async function renderEmailTemplate(payload) {
  const template = await fsp.readFile(TEMPLATE_PATH, "utf8");

  const workshopInfo = payload.workshop_info || {};
  const qrCodeBaseUrl = process.env.QR_CODE_BASE_URL || "";
  const embedMode = resolveEmbedMode();
  const hasQrCode = Boolean(payload.qr_code_hash);

  const qrCodeUrl = workshopInfo.qr_code_url
    || (qrCodeBaseUrl ? `${qrCodeBaseUrl.replace(/\/$/, "")}/${payload.qr_code_hash}` : "");

  let qrCodeImage = qrCodeUrl || "#";
  if (embedMode === "cid" && payload.qr_code_hash) {
    qrCodeImage = "cid:qr-code";
  }

  if (embedMode === "data" && payload.qr_code_hash) {
    const width = Number(process.env.QR_CODE_WIDTH || 256);
    const margin = Number(process.env.QR_CODE_MARGIN || 1);
    const errorCorrectionLevel = String(process.env.QR_CODE_ERROR_LEVEL || "M").toUpperCase();

    try {
      qrCodeImage = await QRCode.toDataURL(payload.qr_code_hash, {
        width: Number.isFinite(width) ? width : 256,
        margin: Number.isFinite(margin) ? margin : 1,
        errorCorrectionLevel,
      });
    } catch (error) {
      console.warn("[templateRenderer] Failed to embed QR image:", error.message);
    }
  }

  const tokens = {
    full_name: payload.full_name || "Student",
    qr_code_hash: payload.qr_code_hash || "N/A",
    workshop_name: workshopInfo.name || workshopInfo.title || "Workshop",
    workshop_time: workshopInfo.time || workshopInfo.date || "",
    qr_code_url: qrCodeUrl || "#",
    qr_code_image: qrCodeImage,
    has_qr_code: hasQrCode ? "" : 'style="display:none"',
  };

  let result = replaceTokens(template, tokens);

  // If no QR code, remove QR-related sections from HTML
  if (!hasQrCode) {
    result = result.replace(/<p><strong>QR Code Hash:[\s\S]*?<\/div>/gi, "");
  }

  return result;
}

module.exports = {
  renderEmailTemplate,
};
