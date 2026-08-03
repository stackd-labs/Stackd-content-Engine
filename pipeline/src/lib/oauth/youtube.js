// ============================================================
// YouTube (Google) OAuth2 — authorization-code flow.
// Requires YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET (app-level,
// stay in .env — these identify the app, not a user connection).
// ============================================================
import { fetchJSON } from '../http.js';
import { env } from '../env.js';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// youtube.upload — posting (uploadToYouTube.js).
// yt-analytics.readonly — pulling real per-video metrics (pullAnalytics.js).
// Requesting both up front means Connect only has to happen once.
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];

/** Build the Google consent-screen URL the browser should be redirected to. */
export function getAuthorizeUrl(state, redirectUri) {
  const params = new URLSearchParams({
    client_id: env.YOUTUBE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline', // required to receive a refresh_token
    prompt: 'consent',      // force refresh_token even on a repeat connect
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/** Exchange a one-time authorization code for access + refresh tokens. */
export async function exchangeCode(code, redirectUri) {
  const res = await fetchJSON(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.YOUTUBE_CLIENT_ID,
      client_secret: env.YOUTUBE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      code,
      grant_type: 'authorization_code',
    }).toString(),
  });
  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (res.expires_in ?? 3600) * 1000).toISOString(),
    scopes: (res.scope ?? '').split(' ').filter(Boolean),
  };
}

/** Fetch the connected channel's display name, for the Settings UI. */
export async function getAccountLabel(accessToken) {
  try {
    const res = await fetchJSON('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.items?.[0]?.snippet?.title ?? null;
  } catch {
    return null;
  }
}

/** Exchange a stored refresh_token for a fresh access_token (same call uploadToYouTube.js used inline). */
export async function refreshAccessToken(refreshToken) {
  const res = await fetchJSON(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.YOUTUBE_CLIENT_ID,
      client_secret: env.YOUTUBE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });
  return {
    accessToken: res.access_token,
    expiresAt: new Date(Date.now() + (res.expires_in ?? 3600) * 1000).toISOString(),
  };
}
