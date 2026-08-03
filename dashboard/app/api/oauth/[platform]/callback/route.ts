import { NextRequest, NextResponse } from 'next/server';
import { getPipelineBaseUrl } from '@/lib/pipelineUrl';

const APP_URL = process.env.APP_URL || 'http://localhost:3030';

interface OAuthFlowCookie {
  platform: string;
  state: string;
  codeVerifier?: string;
  tokenSecret?: string;
}

function redirectWithError(message: string) {
  const url = new URL('/settings', APP_URL);
  url.searchParams.set('error', message);
  const response = NextResponse.redirect(url);
  response.cookies.set('oauth_flow', '', { path: '/api/oauth', maxAge: 0 });
  return response;
}

// Verifies the callback against the cookie set in /start, then asks the
// pipeline (sole holder of every provider secret) to exchange the
// code/verifier for tokens and store them.
export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const query = req.nextUrl.searchParams;

  const providerError = query.get('error');
  if (providerError) {
    return redirectWithError(`${platform} declined the connection: ${providerError}`);
  }

  const cookieValue = req.cookies.get('oauth_flow')?.value;
  if (!cookieValue) {
    return redirectWithError('Connect session expired or the cookie was blocked — please try again.');
  }

  let flow: OAuthFlowCookie;
  try {
    flow = JSON.parse(cookieValue);
  } catch {
    return redirectWithError('Invalid Connect session — please try again.');
  }

  if (flow.platform !== platform) {
    return redirectWithError('Platform mismatch in the Connect callback.');
  }

  const pipelineBase = getPipelineBaseUrl();
  if (!pipelineBase) {
    return redirectWithError('PIPELINE_WEBHOOK_URL is not configured — the pipeline server must be reachable to connect a platform.');
  }

  let body: Record<string, string>;

  if (platform === 'twitter') {
    // OAuth1 has no `state` field — the temporary oauth_token IS the
    // correlator Twitter echoes back, so it's compared against flow.state.
    const oauthToken = query.get('oauth_token');
    const oauthVerifier = query.get('oauth_verifier');
    if (!oauthToken || !oauthVerifier || oauthToken !== flow.state) {
      return redirectWithError('Twitter Connect callback did not match the pending request.');
    }
    body = { oauthToken, oauthTokenSecret: flow.tokenSecret ?? '', oauthVerifier };
  } else {
    const code = query.get('code');
    const state = query.get('state');
    if (!code || !state || state !== flow.state) {
      return redirectWithError(`${platform} Connect callback did not match the pending request.`);
    }
    const redirectUri = new URL(`/api/oauth/${platform}/callback`, APP_URL).toString();
    body = { code, redirectUri, ...(flow.codeVerifier ? { codeVerifier: flow.codeVerifier } : {}) };
  }

  try {
    const res = await fetch(`${pipelineBase}/oauth/${platform}/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      return redirectWithError(data.error || `Could not complete the ${platform} Connect flow.`);
    }

    const url = new URL('/settings', APP_URL);
    url.searchParams.set('connected', platform);
    const response = NextResponse.redirect(url);
    response.cookies.set('oauth_flow', '', { path: '/api/oauth', maxAge: 0 });
    return response;
  } catch (err) {
    return redirectWithError(`Could not reach the pipeline server: ${(err as Error).message}`);
  }
}
