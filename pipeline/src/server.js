// ============================================================
// HTTP Trigger Server — server.js
// Exposes three endpoints so the dashboard's PIPELINE_WEBHOOK_URL
// can fire the pipeline, capture leads, and health-check.
//
// POST /run    — start a pipeline run (202 + background execution)
// POST /lead   — capture a lead / subscriber
// GET  /health — liveness check
//
// Starts on PORT env var (default 4040).
// ============================================================
import { createServer } from 'node:http';

import { env } from './lib/env.js';
import { log } from './lib/logger.js';
import { runPipeline } from './index.js';
import { captureLead } from './email/leadCapture.js';

const PORT = Number(env.PORT) || 4040;

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
  if (method === 'GET' && url === '/health') {
    return json(res, 200, { ok: true, ts: new Date().toISOString() });
  }

  // ── POST /run ────────────────────────────────────────────────
  if (method === 'POST' && url === '/run') {
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
  if (method === 'POST' && url === '/lead') {
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
  log.info('  POST /run    — trigger a pipeline run');
  log.info('  POST /lead   — capture a lead subscriber');
  log.info('  GET  /health — liveness check');
});

export { server };
export default server;
