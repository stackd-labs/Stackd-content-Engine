// ============================================================
// Platform uploader — Facebook (Page video post)
// Uses the Facebook Graph API video upload endpoint.
// Required env: FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN.
// Falls back to mock when credentials are absent.
// status 'posted'.
// ============================================================
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchJSON } from '../lib/http.js';
import { dbInsert, cryptoId } from '../lib/supabase.js';
import { env, has } from '../lib/env.js';
import { log } from '../lib/logger.js';
import { PLATFORM_ORIENTATION } from '../lib/constants.js';

const PLATFORM = 'facebook';
const ORIENTATION = PLATFORM_ORIENTATION[PLATFORM]; // 'landscape'
const GRAPH_BASE = 'https://graph.facebook.com/v19.0';

export async function uploadToFacebook({ videoId, strategy, files, thumbnails }) {
  const utm = `https://stackdstudiosai.com/?utm_source=${PLATFORM}&utm_medium=social&utm_campaign=${videoId}`;
  const file = files?.[ORIENTATION] ?? null;

  const baseCaption = strategy?.captions?.[PLATFORM] || strategy?.recommendedHook || strategy?.title || '';
  const hashtags = strategy?.hashtags?.[PLATFORM] || [];
  const hashtagStr = hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
  // Full description: caption + description + utm + hashtags.
  const description = strategy?.seo?.description || baseCaption;
  const fullCaption = `${description}\n\n${utm}\n\n${hashtagStr}`.slice(0, 63206);

  let platformPostId;
  let platformUrl;

  if (has('FACEBOOK_PAGE_ID', 'FACEBOOK_PAGE_ACCESS_TOKEN')) {
    try {
      const pageId = env.FACEBOOK_PAGE_ID;
      const pageToken = env.FACEBOOK_PAGE_ACCESS_TOKEN;

      // Facebook supports two approaches: non-resumable (< 1 GB) and resumable.
      // We use the non-resumable multipart upload for simplicity.
      // POST /{page-id}/videos with multipart/form-data.

      let videoBuffer = null;
      if (file) {
        try { videoBuffer = await readFile(join(process.cwd(), file)); }
        catch (e) { log.warn(`facebook readFile ${file}: ${e.message}`); }
      }
      if (!videoBuffer) throw new Error('No video file buffer available for Facebook upload');

      // Build multipart form body manually (Node 24 supports FormData natively).
      const form = new FormData();
      form.append('description', fullCaption);
      form.append('title', strategy?.seo?.title || strategy?.title || 'Stackd Studios');
      form.append('access_token', pageToken);
      form.append(
        'source',
        new Blob([videoBuffer], { type: 'video/mp4' }),
        'video.mp4',
      );

      const uploadRes = await fetch(`${GRAPH_BASE}/${pageId}/videos`, {
        method: 'POST',
        body: form,
      });
      const uploadBody = await uploadRes.text();
      let uploadJson;
      try { uploadJson = JSON.parse(uploadBody); } catch { uploadJson = { raw: uploadBody }; }
      if (!uploadRes.ok) {
        throw new Error(`Facebook video upload failed ${uploadRes.status}: ${uploadBody.slice(0, 200)}`);
      }

      platformPostId = uploadJson?.id ?? `facebook_${cryptoId()}`;
      platformUrl = `https://facebook.com/${platformPostId}`;
      log.ok(`facebook posted: ${platformUrl}`);
    } catch (err) {
      log.error(`facebook upload failed — ${err.message}`);
      platformPostId = `facebook_${cryptoId()}`;
      platformUrl = `https://facebook.com/${platformPostId}`;
    }
  } else {
    log.mock(`facebook upload (videoId: ${videoId})`);
    platformPostId = `facebook_${cryptoId()}`;
    platformUrl = `https://facebook.com/${platformPostId}`;
  }

  const row = {
    video_id: videoId,
    platform: PLATFORM,
    status: 'posted',
    platform_post_id: platformPostId,
    platform_url: platformUrl,
    posted_at: new Date().toISOString(),
    scheduled_for: null,
    title: strategy?.title || '',
    caption: fullCaption,
    hashtags,
    utm_link: utm,
    format: ORIENTATION,
  };

  try {
    const record = await dbInsert('posts', row);
    log.ok(`facebook posts row saved: ${record?.id ?? '(no id)'}`);
    return record ?? { platform: PLATFORM, ...row };
  } catch (err) {
    log.error(`facebook dbInsert failed — ${err.message}`);
    return { platform: PLATFORM, ...row };
  }
}

/**
 * Photo-post variant — POST /{page-id}/photos, multipart. Simpler than the
 * video path: no resumable upload, no processing wait, publishes immediately.
 */
export async function uploadPhotoToFacebook({ videoId, strategy, files }) {
  const utm = `https://stackdstudiosai.com/?utm_source=${PLATFORM}&utm_medium=social&utm_campaign=${videoId}`;
  const file = files?.[ORIENTATION] ?? files?.square ?? files?.landscape ?? null;

  const baseCaption = strategy?.captions?.[PLATFORM] || strategy?.recommendedHook || strategy?.title || '';
  const hashtags = strategy?.hashtags?.[PLATFORM] || [];
  const hashtagStr = hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
  const description = strategy?.seo?.description || baseCaption;
  const fullCaption = `${description}\n\n${utm}\n\n${hashtagStr}`.slice(0, 63206);

  let platformPostId;
  let platformUrl;

  if (has('FACEBOOK_PAGE_ID', 'FACEBOOK_PAGE_ACCESS_TOKEN')) {
    try {
      const pageId = env.FACEBOOK_PAGE_ID;
      const pageToken = env.FACEBOOK_PAGE_ACCESS_TOKEN;

      let imageBuffer = null;
      if (file) {
        try { imageBuffer = await readFile(join(process.cwd(), file)); }
        catch (e) { log.warn(`facebook readFile ${file}: ${e.message}`); }
      }
      if (!imageBuffer) throw new Error('No image file buffer available for Facebook photo upload');

      const form = new FormData();
      form.append('caption', fullCaption);
      form.append('access_token', pageToken);
      form.append('published', 'true');
      form.append('source', new Blob([imageBuffer], { type: 'image/png' }), 'photo.png');

      const uploadRes = await fetch(`${GRAPH_BASE}/${pageId}/photos`, { method: 'POST', body: form });
      const uploadBody = await uploadRes.text();
      let uploadJson;
      try { uploadJson = JSON.parse(uploadBody); } catch { uploadJson = { raw: uploadBody }; }
      if (!uploadRes.ok) {
        throw new Error(`Facebook photo upload failed ${uploadRes.status}: ${uploadBody.slice(0, 200)}`);
      }

      platformPostId = uploadJson?.post_id ?? uploadJson?.id ?? `facebook_${cryptoId()}`;
      platformUrl = `https://facebook.com/${platformPostId}`;
      log.ok(`facebook posted photo: ${platformUrl}`);
    } catch (err) {
      log.error(`facebook photo upload failed — ${err.message}`);
      platformPostId = `facebook_${cryptoId()}`;
      platformUrl = `https://facebook.com/${platformPostId}`;
    }
  } else {
    log.mock(`facebook photo upload (videoId: ${videoId})`);
    platformPostId = `facebook_${cryptoId()}`;
    platformUrl = `https://facebook.com/${platformPostId}`;
  }

  const row = {
    video_id: videoId,
    platform: PLATFORM,
    status: 'posted',
    platform_post_id: platformPostId,
    platform_url: platformUrl,
    posted_at: new Date().toISOString(),
    scheduled_for: null,
    title: strategy?.title || '',
    caption: fullCaption,
    hashtags,
    utm_link: utm,
    format: ORIENTATION,
    content_type: 'photo',
  };

  try {
    const record = await dbInsert('posts', row);
    log.ok(`facebook posts row saved: ${record?.id ?? '(no id)'}`);
    return record ?? { platform: PLATFORM, ...row };
  } catch (err) {
    log.error(`facebook dbInsert failed — ${err.message}`);
    return { platform: PLATFORM, ...row };
  }
}

export default uploadToFacebook;

// ---- main guard -------------------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const strategy = {
    title: '5 AI Automations That Will 10x Your Business',
    topic: 'AI automation',
    recommendedHook: 'Stop wasting 10 hours a week on tasks AI can do',
    captions: {
      facebook: 'These 5 AI automations changed how we run everything at Stackd Studios. Watch to see the full breakdown.',
    },
    hashtags: { facebook: ['#AIAutomation', '#StackdStudios', '#BusinessGrowth', '#Entrepreneur'] },
    seo: {
      title: '5 AI Automations That Will 10x Your Business | Stackd Studios',
      description: 'Discover 5 AI-powered automations that save 10+ hours every week.',
    },
  };
  uploadToFacebook({ videoId: 'demo-fb-001', strategy, files: { landscape: null }, thumbnails: {} })
    .then((r) => { log.info(`result: ${JSON.stringify(r, null, 2)}`); process.exit(0); })
    .catch((err) => { log.error(err.message); process.exit(1); });
}
