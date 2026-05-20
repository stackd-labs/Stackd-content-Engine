// ============================================================
// Supabase browser client. Returns null when env vars are absent
// so the rest of the app can transparently fall back to
// placeholder data (see useTable).
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anon);

let client: SupabaseClient | null = null;
if (isSupabaseConfigured) {
  client = createClient(url as string, anon as string, {
    realtime: { params: { eventsPerSecond: 5 } },
  });
}

export const supabase = client;
