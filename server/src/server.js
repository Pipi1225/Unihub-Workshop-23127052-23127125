// --- Load environment variables ---
require("dotenv").config();

// --- Express Setup & Middleware ---
const express = require("express");
const path = require("path");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const createCorsOptions = require("./config/cors");
const createSupabaseClient = require("./config/supabase");
const healthRoute = require("./routes/healthRoute");
const authRoute = require("./routes/authRoute");
const paymentRoute = require("./routes/paymentRoute");
const qrRoute = require("./routes/qrRoute");
const registrationRoute = require("./routes/registrationRoute");
const syncRoute = require("./routes/syncRoute");
const workshopRoute = require("./routes/workshopRoute");
const { errorHandler, notFoundHandler } = require("./middlewares/errorHandler");

// --- Background Jobs & Services ---
const redisClient = require("./config/redis");
const { bootstrapCsvSyncScheduler, stopCsvSyncScheduler } = require("./config/csvSyncScheduler");

const PORT = Number(process.env.PORT || 4000);

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Fail fast if Supabase config is invalid.
createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const CORS_OPTIONS = createCorsOptions(CLIENT_ORIGIN);

const app = express();
app.set("trust proxy", 1);

const WORKSHOP_PDF_DIR =
  process.env.WORKSHOP_PDF_DIR ||
  path.join(__dirname, "..", "uploads", "workshops");
const WORKSHOP_PDF_PUBLIC_PATH =
  process.env.WORKSHOP_PDF_PUBLIC_PATH || "/uploads/workshops";

// --- Cấu hình CORS ---
app.use(cors(CORS_OPTIONS));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(WORKSHOP_PDF_PUBLIC_PATH, express.static(WORKSHOP_PDF_DIR));

// --- Routes ---
app.use("/api", healthRoute);
app.use("/api/auth", authRoute);
app.use("/api/payments", paymentRoute);
app.use("/api/qr", qrRoute);
app.use("/api/registrations", registrationRoute);
app.use("/api", syncRoute);
app.use("/api/workshops", workshopRoute);

// --- Middleware Xử lý 404 ---
app.use(notFoundHandler);
app.use(errorHandler);

// --- Khởi động server ---
const server = app.listen(PORT, async () => {
  console.log(`Server listening at http://localhost:${PORT}`);

  // Bootstrap CSV sync scheduler
  try {
    await bootstrapCsvSyncScheduler(redisClient);
  } catch (err) {
    console.error("Failed to bootstrap CSV sync scheduler:", err.message);
  }
});

// --- Graceful Shutdown ---
process.on("SIGINT", () => {
  console.log("\nShutting down gracefully...");
  stopCsvSyncScheduler();
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  console.log("\nShutting down gracefully (SIGTERM)...");
  stopCsvSyncScheduler();
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
