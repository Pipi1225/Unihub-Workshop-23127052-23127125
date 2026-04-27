// --- Load environment variables ---
require("dotenv").config();

// --- Express Setup & Middleware ---
const express = require("express");
const cors = require("cors");
const createCorsOptions = require("./config/cors");
const createSupabaseClient = require("./config/supabase");
const healthRoute = require("./routes/healthRoute");

// Khởi tạo Redis ngay khi chạy server để nó in ra log kết nối
require("./config/redis");

const PORT = Number(process.env.PORT || 4000);

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Fail fast if Supabase config is invalid.
createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const CORS_OPTIONS = createCorsOptions(CLIENT_ORIGIN);

const app = express();
app.set("trust proxy", 1);

// --- Cấu hình CORS ---
app.use(cors(CORS_OPTIONS));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// --- Routes ---
app.use("/api", healthRoute);

// --- Middleware Xử lý 404 ---
app.use((_req, res) => {
  res.status(404).json({
    ok: false,
    message: "Resource not found",
  });
});

// --- Middleware Xử lý Lỗi Cuối cùng ---
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({
    ok: false,
    message: "Internal server error",
  });
});

// --- Khởi động server ---
app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});
