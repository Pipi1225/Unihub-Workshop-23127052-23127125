const nodemailer = require("nodemailer");
const QRCode = require("qrcode");
const INotificationProvider = require("./INotificationProvider");
const { renderEmailTemplate } = require("../templateRenderer");

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

  return parseBoolean(process.env.QR_CODE_EMBED, true) ? "data" : "cid";
}

class EmailProvider extends INotificationProvider {
  constructor() {
    super();
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    const smtpSecure = parseBoolean(process.env.SMTP_SECURE, smtpPort === 465);

    const smtpHost = String(process.env.SMTP_HOST || "").trim();
    const smtpUser = String(process.env.SMTP_USER || "").trim();
    const smtpPass = String(process.env.SMTP_PASS || "").replace(/\s+/g, "");

    this.from = String(process.env.SMTP_FROM || "no-reply@example.com").trim();
    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
  }

  async send(payload) {
    const to = payload.user_email;
    if (!to) {
      throw new Error("Missing user_email");
    }

    const html = await renderEmailTemplate(payload);
    const subject = payload.workshop_info?.subject
      || payload.workshop_info?.title
      || "Workshop Ticket";

    const embedMode = resolveEmbedMode();
    const attachments = [];

    if (embedMode === "cid" && payload.qr_code_hash) {
      const width = Number(process.env.QR_CODE_WIDTH || 256);
      const margin = Number(process.env.QR_CODE_MARGIN || 1);
      const errorCorrectionLevel = String(process.env.QR_CODE_ERROR_LEVEL || "M").toUpperCase();

      try {
        const buffer = await QRCode.toBuffer(payload.qr_code_hash, {
          type: "png",
          width: Number.isFinite(width) ? width : 256,
          margin: Number.isFinite(margin) ? margin : 1,
          errorCorrectionLevel,
        });

        attachments.push({
          filename: "qr-code.png",
          content: buffer,
          cid: "qr-code",
        });
      } catch (error) {
        console.warn("[EmailProvider] Failed to generate QR attachment:", error.message);
      }
    }

    return this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      html,
      attachments: attachments.length ? attachments : undefined,
    });
  }
}

module.exports = EmailProvider;
