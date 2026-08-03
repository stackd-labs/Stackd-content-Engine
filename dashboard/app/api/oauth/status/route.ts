import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabaseAdmin';
import { PLATFORMS } from '@shared/constants';
import type { Platform } from '@shared/types';

type StatusMap = Record<Platform, { connected: boolean; accountLabel?: string | null; scopes?: string[] }>;

// Reads platform_credentials directly (no pipeline round-trip — this is a
// plain read, no provider secret involved) and reports connection status
// for every platform so the Settings page can render Connect/Disconnect.
export async function GET() {
  const empty = Object.fromEntries(
    PLATFORMS.map((p) => [p, { connected: false }]),
  ) as StatusMap;

  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return NextResponse.json({ ok: true, mode: 'demo', platforms: empty });
  }

  const { data, error } = await supabaseAdmin
    .from('platform_credentials')
    .select('platform, account_label, scopes')
    .eq('tenant_id', 'default');

  if (error) {
    // Table not migrated yet, or another read error — report as
    // all-disconnected rather than failing the whole Settings page.
    return NextResponse.json({ ok: true, mode: 'fallback', platforms: empty, error: error.message });
  }

  const platforms = { ...empty };
  for (const row of data ?? []) {
    platforms[row.platform as Platform] = {
      connected: true,
      accountLabel: row.account_label,
      scopes: row.scopes ?? [],
    };
  }

  return NextResponse.json({ ok: true, mode: 'live', platforms });
}
