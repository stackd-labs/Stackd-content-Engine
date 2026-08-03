import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabaseAdmin';

// Deletes the platform_credentials row directly — no provider secret is
// involved in disconnecting, so this needs no pipeline round-trip.
export async function POST(_req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;

  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return NextResponse.json({ ok: true, mode: 'demo' });
  }

  const { error } = await supabaseAdmin
    .from('platform_credentials')
    .delete()
    .eq('tenant_id', 'default')
    .eq('platform', platform);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
