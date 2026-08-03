import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';

// Receives a Run Pipeline request from the dashboard and forwards it
// to the /pipeline runner (PIPELINE_WEBHOOK_URL). In demo mode no
// runner exists, so we acknowledge and let the UI animate progress.
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* ignore */
  }

  const webhook = process.env.PIPELINE_WEBHOOK_URL;
  if (!webhook) {
    return NextResponse.json({
      ok: true,
      mode: 'demo',
      message: 'No PIPELINE_WEBHOOK_URL set — acknowledged without dispatching.',
      received: body,
    });
  }

  const sharedSecret = process.env.PIPELINE_SHARED_SECRET;

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sharedSecret ? { Authorization: `Bearer ${sharedSecret}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: res.ok, mode: 'live', runner: data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, mode: 'live', error: (err as Error).message },
      { status: 502 },
    );
  }
}
