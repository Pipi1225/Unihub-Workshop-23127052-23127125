const fs = require("fs");
const path = require("path");
const multer = require("multer");

const PDF_MAX_MB = Number(process.env.WORKSHOP_PDF_MAX_MB || 5);
const PDF_DIR =
  process.env.WORKSHOP_PDF_DIR ||
  path.join(__dirname, "..", "..", "uploads", "workshops");

const ROOM_MAP_MAX_MB = Number(process.env.WORKSHOP_ROOM_MAP_MAX_MB || 5);
const ROOM_MAP_DIR =
  process.env.WORKSHOP_ROOM_MAP_DIR ||
  path.join(__dirname, "..", "..", "uploads", "room-maps");

fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(ROOM_MAP_DIR, { recursive: true });

function sanitizePdfFileName(originalName) {
  const parsed = path.parse(originalName);
  const safeBase = parsed.name.replace(/[^a-zA-Z0-9_-]+/g, "_");
  return `${Date.now()}_${safeBase}.pdf`;
}

function sanitizeImageFileName(originalName) {
  const parsed = path.parse(originalName);
  const safeBase = parsed.name.replace(/[^a-zA-Z0-9_-]+/g, "_");
  const ext = parsed.ext ? parsed.ext.toLowerCase() : ".png";
  return `${Date.now()}_${safeBase}${ext}`;
}

const storage = multer.diskStorage({
  destination: (_req, file, cb) => {
    if (file.fieldname === "room_map") {
      return cb(null, ROOM_MAP_DIR);
    }
    return cb(null, PDF_DIR);
  },
  filename: (_req, file, cb) => {
    if (file.fieldname === "room_map") {
      return cb(null, sanitizeImageFileName(file.originalname));
    }
    return cb(null, sanitizePdfFileName(file.originalname));
  },
});

function fileFilter(_req, file, cb) {
  if (file.fieldname === "room_map") {
    const isImage =
      file.mimetype.startsWith("image/") ||
      /(\.png|\.jpg|\.jpeg|\.webp)$/i.test(file.originalname);
    if (!isImage) {
      const error = Object.assign(new Error("Only image files are allowed"), {
        statusCode: 400,
      });
      return cb(error);
    }
    return cb(null, true);
  }

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

const uploadWorkshopAssets = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: Math.max(PDF_MAX_MB, ROOM_MAP_MAX_MB) * 1024 * 1024,
  },
});

module.exports = {
  uploadWorkshopAssets,
};
