// ============================================================
// Supabase service-role client — SERVER-ONLY. Bypasses RLS, so this
// must never be imported from a 'use client' file or leak to the browser.
// Used only by the OAuth status/disconnect API routes, which need to
// read/write platform_credentials directly without a pipeline round-trip.
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseAdminConfigured = Boolean(url && serviceRoleKey);

let client: SupabaseClient | null = null;
if (isSupabaseAdminConfigured) {
  client = createClient(url as string, serviceRoleKey as string, {
    auth: { persistSession: false },
  });
}

export const supabaseAdmin = client;
