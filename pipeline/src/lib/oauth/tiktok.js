// ============================================================
// TikTok OAuth2 — authorization-code flow with PKCE.
// Requires TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET (app-level,
// stay in .env — these identify the app, not a user connection).
//
// FLAG: TikTok web apps commonly require PKCE (code_verifier /
// code_challenge) on top of the standard authorization-code flow.
// This isn't verifiable without a live TikTok app registered to this
// project, so getAuthorizeUrl always generates and returns a
// codeVerifier — if the real app doesn't require PKCE, the extra
// params are simply ignored by TikTok's token endpoint.
// ============================================================
import { createHash, randomBytes } from 'node:crypto';
import { fetchJSON } from '../http.js';
import { env } from '../env.js';

const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';

// video.upload/video.publish — posting (uploadToTikTok.js).
// video.list — pulling real per-video metrics (pullAnalytics.js).
const SCOPES = ['video.upload', 'video.publish', 'video.list'];

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Build the TikTok consent-screen URL + PKCE verifier the caller must persist until the callback. */
export function getAuthorizeUrl(state, redirectUri) {
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());

  const params = new URLSearchParams({
    client_key: env.TIKTOK_CLIENT_KEY,
    scope: SCOPES.join(','),
    response_type: 'code',
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return { url: `${AUTH_URL}?${params.toString()}`, codeVerifier };
}

/** Exchange a one-time authorization code for access + refresh tokens. */
export async function exchangeCode(code, redirectUri, codeVerifier) {
  const res = await fetchJSON(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: env.TIKTOK_CLIENT_KEY,
      client_secret: env.TIKTOK_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    }).toString(),
  });
  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (res.expires_in ?? 86400) * 1000).toISOString(),
    scopes: (res.scope ?? '').split(',').filter(Boolean),
    accountLabel: res.open_id ?? null,
  };
}

/** Fetch the connected creator's display name, for the Settings UI. */
export async function getAccountLabel(accessToken) {
  try {
    const res = await fetchJSON('https://open.tiktokapis.com/v2/user/info/?fields=display_name', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res?.data?.user?.display_name ?? null;
  } catch {
    return null;
  }
}

/** Exchange a stored refresh_token for a fresh access_token. */
export async function refreshAccessToken(refreshToken) {
  const res = await fetchJSON(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: env.TIKTOK_CLIENT_KEY,
      client_secret: env.TIKTOK_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  });
  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + (res.expires_in ?? 86400) * 1000).toISOString(),
  };
}
