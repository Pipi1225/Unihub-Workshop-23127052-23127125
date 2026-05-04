const fs = require("fs");
const path = require("path");
const multer = require("multer");

const MAX_MB = Number(process.env.WORKSHOP_PDF_MAX_MB || 5);
const UPLOAD_DIR =
  process.env.WORKSHOP_PDF_DIR ||
  path.join(__dirname, "..", "..", "uploads", "workshops");
const PUBLIC_PATH =
  process.env.WORKSHOP_PDF_PUBLIC_PATH || "/uploads/workshops";

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function sanitizeFileName(originalName) {
  const parsed = path.parse(originalName);
  const safeBase = parsed.name.replace(/[^a-zA-Z0-9_-]+/g, "_");
  return `${Date.now()}_${safeBase}.pdf`;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    cb(null, sanitizeFileName(file.originalname));
  },
});

function fileFilter(_req, file, cb) {
  const isPdf =
    file.mimetype === "application/pdf" ||
    file.originalname.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    const error = Object.assign(new Error("Only PDF files are allowed"), {
      statusCode: 400,
    });
    return cb(error);
  }
  return cb(null, true);
}

const uploadWorkshopPdf = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_MB * 1024 * 1024,
  },
});

function buildPdfPublicUrl(fileName) {
  return `${PUBLIC_PATH}/${fileName}`;
}

module.exports = {
  uploadWorkshopPdf,
  buildPdfPublicUrl,
  UPLOAD_DIR,
  PUBLIC_PATH,
};
