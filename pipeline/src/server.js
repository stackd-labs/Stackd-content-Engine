// ============================================================
// HTTP Trigger Server — server.js
// Exposes endpoints so the dashboard's PIPELINE_WEBHOOK_URL
// can fire the pipeline, capture leads, resume approved posts,
// run the OAuth Connect flow, and health-check.
//
// POST /run                       — start a pipeline run (202 + background execution)
// POST /lead                      — capture a lead / subscriber
// POST /approve/:videoId          — resume postToPlatforms for a flagged video (202 + background)
// GET  /oauth/:platform/authorize-url — build the provider consent-screen URL for Connect
// POST /oauth/:platform/exchange  — exchange a code/verifier for tokens, store them
// GET  /health                    — liveness check
//
// Starts on PORT env var (default 4040).
// ============================================================
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

import { env } from './lib/env.js';
import { log } from './lib/logger.js';
import { runPipeline } from './index.js';
import { captureLead } from './email/leadCapture.js';
import { approveAndPost } from './platforms/index.js';
import { savePlatformCredential } from './lib/credentials.js';
import * as youtubeOAuth from './lib/oauth/youtube.js';
import * as tiktokOAuth from './lib/oauth/tiktok.js';
import * as twitterOAuth from './lib/oauth/twitter.js';

const PORT = Number(env.PORT) || 4040;

// ──────────────────────────────────────────────────────────────
// Auth helpers
// ──────────────────────────────────────────────────────────────

/**
 * POST /run kicks off a full pipeline run (real API calls, real spend) and
 * has no other gate in front of it once this server is reachable off
 * localhost. When PIPELINE_SHARED_SECRET is set, require it as a Bearer
 * token — the dashboard's /api/run-pipeline route sends it automatically.
 * Left optional (rather than required) so local dev keeps working with zero
 * config, matching every other credential in this codebase.
 */
function hasValidSharedSecret(req) {
  if (!env.PIPELINE_SHARED_SECRET) return true;
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  return token === env.PIPELINE_SHARED_SECRET;
}

/**
 * POST /lead is the public lead-magnet capture endpoint — it's meant to be
 * called directly by anonymous visitors' browsers from the toolkit landing
 * page (settings.leadMagnet.url), so it can't be gated behind a login like
 * the internal endpoints. Instead: restrict which browser origin may call
 * it, and rate-limit per IP to blunt scripted spam. Neither stops a
 * determined direct API caller (Origin is attacker-controlled outside a
 * real browser) — that tradeoff is intentional so the real funnel keeps
 * working unauthenticated.
 */
const LEAD_ALLOWED_ORIGIN = env.LEAD_CAPTURE_ALLOWED_ORIGIN || 'https://stackdstudiosai.com';
const LEAD_RATE_LIMIT_MAX = 5;
const LEAD_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const leadRateLimitByIp = new Map();

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function isLeadOriginAllowed(req) {
  const origin = req.headers['origin'];
  // No Origin header at all (e.g. a server-to-server call, curl) isn't a
  // browser CORS scenario — only enforce the allowlist when one is present.
  return !origin || origin === LEAD_ALLOWED_ORIGIN;
}

function isLeadRateLimited(ip) {
  const now = Date.now();
  const entry = leadRateLimitByIp.get(ip);
  if (!entry || now - entry.windowStart > LEAD_RATE_LIMIT_WINDOW_MS) {
    leadRateLimitByIp.set(ip, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= LEAD_RATE_LIMIT_MAX) return true;
  entry.count += 1;
  return false;
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

/** Read and JSON-parse the request body. Throws on malformed JSON. */
async function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(new Error(`Invalid JSON: ${e.message}`)); }
    });
    req.on('error', reject);
  });
}

/** Send a JSON response. */
function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(payload);
}

// ──────────────────────────────────────────────────────────────
// Request handler
// ──────────────────────────────────────────────────────────────
async function handleRequest(req, res) {
  const { method, url } = req;
  const [pathname, queryString] = url.split('?');
  log.info(`${method} ${url}`);

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  // ── GET /health ──────────────────────────────────────────────
  if (method === 'GET' && pathname === '/health') {
    return json(res, 200, { ok: true, ts: new Date().toISOString() });
  }

  // ── POST /run ────────────────────────────────────────────────
  if (method === 'POST' && pathname === '/run') {
    if (!hasValidSharedSecret(req)) {
      return json(res, 401, { ok: false, error: 'Unauthorized' });
    }

    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      return json(res, 400, { ok: false, error: err.message });
    }

    const { topic, format, pillar, contentPillar, platforms, autoPost } = body;

    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      return json(res, 400, { ok: false, error: '"topic" is required and must be a non-empty string' });
    }

    // Respond immediately with 202 — pipeline runs in background.
    json(res, 202, { ok: true, message: 'pipeline started' });

    runPipeline({
      topic: topic.trim(),
      format: format || 'short',
      contentPillar: contentPillar || pillar,
      platforms: Array.isArray(platforms) ? platforms : undefined,
      autoPost: Boolean(autoPost),
    }).catch((err) => log.error(`/run background pipeline error: ${err.message}`));

    return;
  }

  // ── POST /lead ───────────────────────────────────────────────
  if (method === 'POST' && pathname === '/lead') {
    if (!isLeadOriginAllowed(req)) {
      return json(res, 403, { ok: false, error: 'Origin not allowed' });
    }
    if (isLeadRateLimited(clientIp(req))) {
      return json(res, 429, { ok: false, error: 'Too many requests — try again later' });
    }

    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      return json(res, 400, { ok: false, error: err.message });
    }

    const {
      email,
      first_name,
      firstName,
      source_video_id,
      sourceVideoId,
      source_platform,
      sourcePlatform,
    } = body;

    if (!email) {
      return json(res, 400, { ok: false, error: '"email" is required' });
    }

    try {
      const result = await captureLead({
        email,
        firstName: firstName || first_name,
        sourceVideoId: sourceVideoId || source_video_id,
        sourcePlatform: sourcePlatform || source_platform,
      });
      return json(res, 200, result);
    } catch (err) {
      log.error(`/lead error: ${err.message}`);
      return json(res, 500, { ok: false, error: err.message });
    }
  }

  // ── POST /approve/:videoId ──────────────────────────────────
  const approveMatch = method === 'POST' && pathname.match(/^\/approve\/([^/]+)$/);
  if (approveMatch) {
    const videoId = decodeURIComponent(approveMatch[1]);

    // Respond immediately with 202 — posting runs in background and the
    // dashboard picks up the resulting status change via Supabase realtime.
    json(res, 202, { ok: true, message: 'approval received — posting in background' });

    approveAndPost(videoId).catch((err) =>
      log.error(`/approve/${videoId} background post error: ${err.message}`),
    );

    return;
  }

  // ── GET /oauth/:platform/authorize-url ──────────────────────
  const authorizeMatch = method === 'GET' && pathname.match(/^\/oauth\/([^/]+)\/authorize-url$/);
  if (authorizeMatch) {
    const platform = authorizeMatch[1];
    const query = new URLSearchParams(queryString || '');
    const redirectUri = query.get('redirectUri');

    if (!redirectUri) {
      return json(res, 400, { ok: false, error: '"redirectUri" query param is required' });
    }

    try {
      if (platform === 'youtube') {
        const state = randomBytes(16).toString('hex');
        const url = youtubeOAuth.getAuthorizeUrl(state, redirectUri);
        return json(res, 200, { ok: true, url, state });
      }
      if (platform === 'tiktok') {
        const state = randomBytes(16).toString('hex');
        const { url, codeVerifier } = tiktokOAuth.getAuthorizeUrl(state, redirectUri);
        return json(res, 200, { ok: true, url, state, codeVerifier });
      }
      if (platform === 'twitter') {
        // OAuth1 has no `state` field — the temporary oauth_token IS the
        // correlator Twitter echoes back on callback, so it's returned as
        // `state` too, letting the dashboard use one uniform cookie shape.
        const { oauthToken, oauthTokenSecret, authorizeUrl } = await twitterOAuth.getRequestToken(redirectUri);
        return json(res, 200, { ok: true, url: authorizeUrl, state: oauthToken, tokenSecret: oauthTokenSecret });
      }
      return json(res, 400, { ok: false, error: `No OAuth Connect flow wired up for platform: ${platform}` });
    } catch (err) {
      log.error(`/oauth/${platform}/authorize-url failed: ${err.message}`);
      return json(res, 502, { ok: false, error: err.message });
    }
  }

  // ── POST /oauth/:platform/exchange ──────────────────────────
  const exchangeMatch = method === 'POST' && pathname.match(/^\/oauth\/([^/]+)\/exchange$/);
  if (exchangeMatch) {
    const platform = exchangeMatch[1];
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      return json(res, 400, { ok: false, error: err.message });
    }

    try {
      let credential;
      let accountLabel = null;

      if (platform === 'youtube') {
        const { code, redirectUri } = body;
        if (!code || !redirectUri) throw new Error('"code" and "redirectUri" are required');
        const result = await youtubeOAuth.exchangeCode(code, redirectUri);
        accountLabel = await youtubeOAuth.getAccountLabel(result.accessToken);
        credential = { accessToken: result.accessToken, refreshToken: result.refreshToken, expiresAt: result.expiresAt, scopes: result.scopes };
      } else if (platform === 'tiktok') {
        const { code, redirectUri, codeVerifier } = body;
        if (!code || !redirectUri) throw new Error('"code" and "redirectUri" are required');
        const result = await tiktokOAuth.exchangeCode(code, redirectUri, codeVerifier);
        accountLabel = await tiktokOAuth.getAccountLabel(result.accessToken);
        credential = { accessToken: result.accessToken, refreshToken: result.refreshToken, expiresAt: result.expiresAt, scopes: result.scopes };
      } else if (platform === 'twitter') {
        const { oauthToken, oauthTokenSecret, oauthVerifier } = body;
        if (!oauthToken || !oauthTokenSecret || !oauthVerifier) {
          throw new Error('"oauthToken", "oauthTokenSecret", and "oauthVerifier" are required');
        }
        const result = await twitterOAuth.exchangeVerifier(oauthToken, oauthTokenSecret, oauthVerifier);
        accountLabel = result.screenName ? `@${result.screenName}` : null;
        credential = { accessToken: result.accessToken, tokenSecret: result.accessTokenSecret };
      } else {
        throw new Error(`No OAuth Connect flow wired up for platform: ${platform}`);
      }

      await savePlatformCredential(platform, { ...credential, accountLabel });
      log.ok(`/oauth/${platform}/exchange: connected${accountLabel ? ` (${accountLabel})` : ''}`);
      return json(res, 200, { ok: true, accountLabel });
    } catch (err) {
      log.error(`/oauth/${platform}/exchange failed: ${err.message}`);
      return json(res, 502, { ok: false, error: err.message });
    }
  }

  // ── 404 ───────────────────────────────────────────────────────
  return json(res, 404, { ok: false, error: `Not found: ${method} ${url}` });
}

// ──────────────────────────────────────────────────────────────
// Create and start the HTTP server
// ──────────────────────────────────────────────────────────────
const server = createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    log.error(`Unhandled request error: ${err.message}`);
    try { json(res, 500, { ok: false, error: 'Internal server error' }); } catch (_) { res.end(); }
  });
});

server.listen(PORT, () => {
  log.ok(`Pipeline HTTP server listening on http://localhost:${PORT}`);
  log.info('  POST /run                       — trigger a pipeline run');
  log.info('  POST /lead                      — capture a lead subscriber');
  log.info('  POST /approve/:videoId          — resume posting for a flagged video');
  log.info('  GET  /oauth/:platform/authorize-url — build the Connect consent-screen URL');
  log.info('  POST /oauth/:platform/exchange  — exchange a code/verifier for tokens');
  log.info('  GET  /health                    — liveness check');
  if (!env.PIPELINE_SHARED_SECRET) {
    log.warn('PIPELINE_SHARED_SECRET is not set — POST /run is unauthenticated. Set it before deploying this server beyond localhost.');
  }
});

export { server };
export default server;
