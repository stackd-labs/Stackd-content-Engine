import { NextRequest, NextResponse } from 'next/server';
import { getPipelineBaseUrl } from '@/lib/pipelineUrl';
import { OAUTH_CONNECTABLE_PLATFORMS } from '@shared/constants';

const APP_URL = process.env.APP_URL || 'http://localhost:3030';

// Kicks off Connect: asks the pipeline (the sole holder of every provider's
// client id/secret) to build the provider's consent-screen URL, stashes
// whatever it needs to verify the callback in a short-lived cookie, then
// 302s the browser there. Unlike /api/run-pipeline's silent demo no-op, a
// Connect click that can't reach the pipeline has to surface a real error —
// there's no "it'll work eventually" for an OAuth redirect.
export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const settingsUrl = new URL('/settings', APP_URL);

  if (!(OAUTH_CONNECTABLE_PLATFORMS as string[]).includes(platform)) {
    settingsUrl.searchParams.set('error', `No Connect flow available yet for ${platform} — it needs an app registered first.`);
    return NextResponse.redirect(settingsUrl);
  }

  const pipelineBase = getPipelineBaseUrl();
  if (!pipelineBase) {
    settingsUrl.searchParams.set('error', 'PIPELINE_WEBHOOK_URL is not configured — the pipeline server must be reachable to connect a platform.');
    return NextResponse.redirect(settingsUrl);
  }

  const redirectUri = new URL(`/api/oauth/${platform}/callback`, APP_URL).toString();

  try {
    const res = await fetch(
      `${pipelineBase}/oauth/${platform}/authorize-url?redirectUri=${encodeURIComponent(redirectUri)}`,
    );
    const data = await res.json();

    if (!res.ok || !data.ok || !data.url) {
      settingsUrl.searchParams.set('error', data.error || `Could not start the ${platform} Connect flow.`);
      return NextResponse.redirect(settingsUrl);
    }

    const response = NextResponse.redirect(data.url);
    response.cookies.set('oauth_flow', JSON.stringify({
      platform,
      state: data.state,
      codeVerifier: data.codeVerifier,
      tokenSecret: data.tokenSecret,
    }), {
      httpOnly: true,
      secure: APP_URL.startsWith('https://'),
      sameSite: 'lax', // must survive the provider's cross-site top-level redirect back to /callback
      maxAge: 10 * 60,
      path: '/api/oauth',
    });
    return response;
  } catch (err) {
    settingsUrl.searchParams.set('error', `Could not reach the pipeline server: ${(err as Error).message}`);
    return NextResponse.redirect(settingsUrl);
  }
}
