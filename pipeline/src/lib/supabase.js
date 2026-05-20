// ============================================================
// Supabase access for the pipeline. Uses the SERVICE ROLE key
// (server-side, full write access). Every helper degrades to a
// logged no-op when Supabase isn't configured, so the pipeline
// runs end-to-end in demo mode and simply skips persistence.
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { env, has } from './env.js';
import { log } from './logger.js';

export const isSupabaseConfigured = has('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');

export const supabase = isSupabaseConfigured
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
  : null;

if (!isSupabaseConfigured) {
  log.warn('Supabase not configured — DB writes will be skipped (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).');
}

/** Insert a row, return the created record (or a synthetic one in demo mode). */
export async function dbInsert(table, row) {
  if (!supabase) return { id: row.id ?? cryptoId(), ...row };
  const { data, error } = await supabase.from(table).insert(row).select().single();
  if (error) { log.error(`insert ${table}: ${error.message}`); return null; }
  return data;
}

/** Patch a row by id. */
export async function dbUpdate(table, id, patch) {
  if (!supabase) return { id, ...patch };
  const { data, error } = await supabase.from(table).update(patch).eq('id', id).select().single();
  if (error) { log.error(`update ${table} ${id}: ${error.message}`); return null; }
  return data;
}

/** Select rows with optional eq filters / ordering / limit. */
export async function dbSelect(table, { match = {}, order, ascending = false, limit } = {}) {
  if (!supabase) return [];
  let q = supabase.from(table).select('*');
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
  if (order) q = q.order(order, { ascending, nullsFirst: false });
  if (limit) q = q.limit(limit);
  const { data, error } = await q;
  if (error) { log.error(`select ${table}: ${error.message}`); return []; }
  return data ?? [];
}

export function cryptoId() {
  return 'demo-' + Math.random().toString(36).slice(2, 10);
}
