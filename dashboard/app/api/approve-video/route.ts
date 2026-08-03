import { NextResponse } from 'next/server';

// Receives an "Approve & Post" request from the Videos page and forwards
// it to the pipeline runner's POST /approve/:videoId (derived from
// PIPELINE_WEBHOOK_URL, which points at .../run). In demo mode no
// runner exists, so we acknowledge without dispatching.
export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* ignore */
  }

  const { videoId } = body;
  if (!videoId || typeof videoId !== 'string') {
    return NextResponse.json(
      { ok: false, error: '"videoId" is required and must be a string' },
      { status: 400 },
    );
  }

  const runWebhook = process.env.PIPELINE_WEBHOOK_URL;
  if (!runWebhook) {
    return NextResponse.json({
      ok: true,
      mode: 'demo',
      message: 'No PIPELINE_WEBHOOK_URL set — acknowledged without dispatching.',
      videoId,
    });
  }

  const approveUrl = runWebhook.replace(/\/run\/?$/, `/approve/${encodeURIComponent(videoId)}`);

  try {
    const res = await fetch(approveUrl, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: res.ok, mode: 'live', runner: data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, mode: 'live', error: (err as Error).message },
      { status: 502 },
    );
  }
}
