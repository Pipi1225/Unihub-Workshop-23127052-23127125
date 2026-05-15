export const RETRY_DELAYS_MS = [15 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000];
export const RETRY_STATE_KEY = "checkin_retry_state";
export const AUTH_TOKEN_KEY = "checkin_auth_token";
export const AUTH_USER_KEY = "checkin_auth_user";

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:4000";
export const PULL_ENDPOINT = process.env.EXPO_PUBLIC_SYNC_PULL_ENDPOINT || "/api/sync-data";
export const PUSH_ENDPOINT = process.env.EXPO_PUBLIC_SYNC_PUSH_ENDPOINT || "/api/registrations/sync";

export const BACKGROUND_SYNC_TASK = "CHECKIN_BACKGROUND_SYNC";
