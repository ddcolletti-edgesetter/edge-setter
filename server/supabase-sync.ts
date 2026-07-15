/**
 * Supabase dual-write sync for Edge Setter MVP tables.
 *
 * Strategy:
 * - SQLite is the primary fast store (all reads come from SQLite)
 * - Supabase is the durable cloud store (async writes, never block response)
 *
 * This means:
 * - Zero-latency impact on API responses
 * - All leads/users/events survive sandbox restarts via Supabase
 * - Admin can query Supabase directly via dashboard
 *
 * Usage: call syncToSupabase(table, row) after every write to SQLite.
 * Never await it in request handlers — fire and forget.
 */

import { getSupabase, supabaseEnvDiagnostics } from "./supabase";

export async function syncToSupabase(
  table: "waitlist" | "users" | "signals" | "source_notes" | "event_log",
  row: Record<string, any>,
  mode: "upsert" | "insert" = "upsert"
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  try {
    if (mode === "upsert") {
      // users table has unique constraint on email (not just id) — use email as conflict key
      const conflictColumn = table === "users" ? "email" : "id";
      const { error } = await sb.from(table).upsert(row, { onConflict: conflictColumn });
      if (error) console.error(`[supabase] upsert ${table} error:`, error.message);
    } else {
      const { error } = await sb.from(table).insert(row);
      if (error) console.error(`[supabase] insert ${table} error:`, error.message);
    }
  } catch (e: any) {
    console.error(`[supabase] sync ${table} failed:`, e.message);
  }
}

/**
 * Pull all signals from Supabase and return them.
 * Used on server startup to hydrate SQLite from Supabase.
 */
export async function pullSignalsFromSupabase(): Promise<any[]> {
  const sb = getSupabase();
  console.error("[supabase] pull signals env:", JSON.stringify(supabaseEnvDiagnostics()), "| client:", sb ? "created" : "NULL — pull skipped, 0 rows hydrated");
  if (!sb) return [];
  const { data, error } = await sb.from("signals").select("*").order("is_featured", { ascending: false }).order("confidence_score", { ascending: false });
  if (error) { console.error("[supabase] pull signals error:", error.message); return []; }
  console.error(`[supabase] pull signals returned ${data?.length ?? 0} rows`);
  return data ?? [];
}

export async function pullSourceNotesFromSupabase(): Promise<any[]> {
  const sb = getSupabase();
  console.error("[supabase] pull source_notes — client:", sb ? "created" : "NULL — pull skipped, 0 rows hydrated");
  if (!sb) return [];
  const { data, error } = await sb.from("source_notes").select("*");
  if (error) { console.error("[supabase] pull source_notes error:", error.message); return []; }
  console.error(`[supabase] pull source_notes returned ${data?.length ?? 0} rows`);
  return data ?? [];
}
