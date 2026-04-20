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
