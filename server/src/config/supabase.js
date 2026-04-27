const { createClient } = require("@supabase/supabase-js");

module.exports = function createSupabaseClient(supabaseUrl, supabaseServiceRoleKey) {
	try {
		if (!supabaseUrl || !String(supabaseUrl).trim()) {
			throw new Error("Missing SUPABASE_URL");
		}

		if (!supabaseServiceRoleKey || !String(supabaseServiceRoleKey).trim()) {
			throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
		}

		return createClient(String(supabaseUrl).trim(), String(supabaseServiceRoleKey).trim(), {
			auth: { persistSession: false },
		});
	} catch (error) {
		throw new Error(`Supabase client initialization failed: ${error.message}`);
	}
};
