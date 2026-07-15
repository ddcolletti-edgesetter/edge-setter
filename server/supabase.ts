/**
 * Supabase client for Edge Setter MVP persistence.
 * Used for the 5 MVP tables: waitlist, users, signals, source_notes, event_log.
 * Falls back gracefully to SQLite-only mode if env vars are not set.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_URL) return null;
  if (_client) return _client;
  // Use service key (server-side, bypasses RLS) if available, else anon
  const key = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
  if (!key) return null;
  _client = createClient(SUPABASE_URL, key);
  return _client;
}

export const supabaseEnabled = !!SUPABASE_URL && !!(SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY);

/**
 * Diagnostic snapshot of what this module captured at import time, vs. what the
 * environment holds now. A disagreement means the module was imported before the
 * env was populated, which is indistinguishable from "unset in Render" otherwise.
 */
export function supabaseEnvDiagnostics() {
  const keyLen = (v: string | undefined) => (v ? `set(${v.length} chars)` : "MISSING");
  return {
    url_at_import: JSON.stringify(SUPABASE_URL),
    url_now: JSON.stringify(process.env.SUPABASE_URL),
    service_key_now: keyLen(process.env.SUPABASE_SERVICE_KEY),
    anon_key_now: keyLen(process.env.SUPABASE_ANON_KEY),
    key_in_use: SUPABASE_SERVICE_KEY ? "service" : SUPABASE_ANON_KEY ? "anon" : "none",
  };
}
