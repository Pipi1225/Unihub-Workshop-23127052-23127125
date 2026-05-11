const fs = require("fs");
const path = require("path");
const multer = require("multer");

const ROOM_MAP_MAX_MB = Number(process.env.WORKSHOP_ROOM_MAP_MAX_MB || 5);
const ROOM_MAP_DIR =
  process.env.WORKSHOP_ROOM_MAP_DIR ||
  path.join(__dirname, "..", "..", "uploads", "room-maps");
const ROOM_MAP_PUBLIC_PATH =
  process.env.WORKSHOP_ROOM_MAP_PUBLIC_PATH || "/uploads/room-maps";

fs.mkdirSync(ROOM_MAP_DIR, { recursive: true });

function sanitizeImageFileName(originalName) {
  const parsed = path.parse(originalName);
  const safeBase = parsed.name.replace(/[^a-zA-Z0-9_-]+/g, "_");
  const ext = parsed.ext ? parsed.ext.toLowerCase() : ".png";
  return `${Date.now()}_${safeBase}${ext}`;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, ROOM_MAP_DIR);
  },
  filename: (_req, file, cb) => {
    cb(null, sanitizeImageFileName(file.originalname));
  },
});

function fileFilter(_req, file, cb) {
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

const uploadRoomMap = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: ROOM_MAP_MAX_MB * 1024 * 1024,
  },
});

function buildRoomMapPublicUrl(fileName) {
  return `${ROOM_MAP_PUBLIC_PATH}/${fileName}`;
}

module.exports = {
  uploadRoomMap,
  buildRoomMapPublicUrl,
  ROOM_MAP_DIR,
  ROOM_MAP_PUBLIC_PATH,
};
