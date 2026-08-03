// ============================================================
// Platform credential resolution — the single place every uploader,
// analytics fetcher, and engagement call reads tokens from.
//
// Prefers an OAuth-connected row in `platform_credentials` (populated by
// the dashboard's Connect flow, see pipeline/src/server.js's /oauth/*
// endpoints); falls back to the legacy env vars when no row exists yet,
// so nothing regresses for a deployment that still just pastes tokens
// into .env. OAuth2 access tokens are refreshed lazily here, just before
// a caller needs them, rather than on a schedule.
//
// `tenantId` defaults to a constant 'default' — this app is single-tenant
// today; every call site already threads a tenantId through so a future
// multi-tenant migration only has to start passing a real one.
// ============================================================
import { dbSelect, dbUpsert, supabase } from './supabase.js';
import { env, has } from './env.js';
import { log } from './logger.js';
import * as youtubeOAuth from './oauth/youtube.js';
import * as tiktokOAuth from './oauth/tiktok.js';

const DEFAULT_TENANT = 'default';

// Providers with a refresh mechanism (OAuth2). Twitter is OAuth1 — user
// tokens don't expire, so it has no entry here.
const REFRESHERS = {
  youtube: youtubeOAuth.refreshAccessToken,
  tiktok: tiktokOAuth.refreshAccessToken,
};

// Legacy env fallback — one accessor per platform, mirroring what each
// uploadTo*.js file already read directly before this resolver existed.
const ENV_FALLBACK = {
  youtube: () => (has('YOUTUBE_REFRESH_TOKEN') ? { accessToken: null, refreshToken: env.YOUTUBE_REFRESH_TOKEN } : null),
  tiktok: () => (has('TIKTOK_ACCESS_TOKEN') ? { accessToken: env.TIKTOK_ACCESS_TOKEN, refreshToken: null } : null),
  twitter: () => (has('TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET')
    ? { accessToken: env.TWITTER_ACCESS_TOKEN, tokenSecret: env.TWITTER_ACCESS_SECRET }
    : null),
  instagram: () => (has('INSTAGRAM_ACCESS_TOKEN') ? { accessToken: env.INSTAGRAM_ACCESS_TOKEN } : null),
  facebook: () => (has('FACEBOOK_PAGE_ACCESS_TOKEN') ? { accessToken: env.FACEBOOK_PAGE_ACCESS_TOKEN } : null),
  linkedin: () => (has('LINKEDIN_ACCESS_TOKEN') ? { accessToken: env.LINKEDIN_ACCESS_TOKEN } : null),
};

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry, not at the deadline

/**
 * Resolve the current credential for a platform: DB row (refreshed if
 * stale) if one exists from Connect, otherwise the legacy env var(s).
 * @returns {Promise<{ accessToken: string, refreshToken?: string, tokenSecret?: string } | null>}
 */
export async function getPlatformCredential(platform, tenantId = DEFAULT_TENANT) {
  const rows = await dbSelect('platform_credentials', { match: { tenant_id: tenantId, platform } });
  const row = rows?.[0];

  if (!row) {
    const fallback = ENV_FALLBACK[platform]?.();
    if (!fallback) return null;
    // YouTube's legacy fallback only ever had a refresh token in .env — mint
    // an access token from it now so callers get a uniform shape either way.
    if (platform === 'youtube' && !fallback.accessToken && fallback.refreshToken) {
      try {
        const refreshed = await youtubeOAuth.refreshAccessToken(fallback.refreshToken);
        return { accessToken: refreshed.accessToken, refreshToken: fallback.refreshToken };
      } catch (err) {
        log.error(`credentials: youtube env-fallback refresh failed — ${err.message}`);
        return null;
      }
    }
    return fallback;
  }

  const isExpiring = row.expires_at && new Date(row.expires_at).getTime() - Date.now() < REFRESH_BUFFER_MS;
  const refresher = REFRESHERS[platform];

  if (isExpiring && refresher && row.refresh_token) {
    try {
      const refreshed = await refresher(row.refresh_token);
      const updated = await dbUpsert(
        'platform_credentials',
        {
          ...row,
          access_token: refreshed.accessToken,
          refresh_token: refreshed.refreshToken ?? row.refresh_token,
          expires_at: refreshed.expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,platform' },
      );
      log.ok(`credentials: refreshed ${platform} access token (tenant ${tenantId})`);
      return { accessToken: updated?.access_token ?? refreshed.accessToken, refreshToken: updated?.refresh_token };
    } catch (err) {
      log.error(`credentials: ${platform} refresh failed — ${err.message}; using existing (possibly stale) token`);
    }
  }

  return { accessToken: row.access_token, refreshToken: row.refresh_token, tokenSecret: row.token_secret };
}

/** Upsert a connected credential — called by the /oauth/:platform/exchange handler. */
export async function savePlatformCredential(platform, {
  accessToken,
  refreshToken = null,
  tokenSecret = null,
  expiresAt = null,
  scopes = [],
  accountLabel = null,
}, tenantId = DEFAULT_TENANT) {
  return dbUpsert(
    'platform_credentials',
    {
      tenant_id: tenantId,
      platform,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_secret: tokenSecret,
      expires_at: expiresAt,
      scopes,
      account_label: accountLabel,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id,platform' },
  );
}

/** Remove a connected credential — called by the dashboard's Disconnect action. */
export async function deletePlatformCredential(platform, tenantId = DEFAULT_TENANT) {
  if (!supabase) return;
  const { error } = await supabase
    .from('platform_credentials')
    .delete()
    .match({ tenant_id: tenantId, platform });
  if (error) log.error(`credentials: delete ${platform} failed — ${error.message}`);
}
