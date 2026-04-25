require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();

const PORT = Number(process.env.PORT || 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
	console.error(
		"Missing Supabase env vars. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env"
	);
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false },
});

app.use(
	cors({
		origin: CLIENT_ORIGIN,
		credentials: true,
	})
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
	res.json({
		ok: true,
		service: "backend",
		timestamp: new Date().toISOString(),
	});
});

app.get("/api/db/check", async (req, res, next) => {
	try {
		const table = String(req.query.table || "").trim();

		if (!table) {
			return res.status(400).json({
				ok: false,
				message: "Missing query param 'table'. Example: /api/db/check?table=profiles",
			});
		}

		const { count, error } = await supabase
			.from(table)
			.select("id", { head: true, count: "exact" });

		if (error) {
			return res.status(400).json({
				ok: false,
				message: "Supabase query failed",
				error: error.message,
			});
		}

		return res.json({
			ok: true,
			message: "Supabase query successful",
			table,
			rowCount: count ?? 0,
		});
	} catch (err) {
		return next(err);
	}
});

app.use((err, _req, res, _next) => {
	console.error(err);
	res.status(500).json({
		ok: false,
		message: "Internal server error",
	});
});

app.listen(PORT, () => {
	console.log(`Server listening at http://localhost:${PORT}`);
});
