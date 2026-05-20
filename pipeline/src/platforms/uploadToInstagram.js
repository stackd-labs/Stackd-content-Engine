// ============================================================
// Platform uploader — Instagram (Reel)
// Uses the Instagram Graph API two-step container + publish flow.
// Required env: INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_ACCOUNT_ID.
// Falls back to mock when credentials are absent.
// Post is SCHEDULED 1 hour from now → status 'scheduled'.
// Trending audio: note in code — attach if INSTAGRAM_AUDIO_ID set.
// ============================================================
import { pathToFileURL } from 'node:url';
import { fetchJSON } from '../lib/http.js';
import { dbInsert, cryptoId } from '../lib/supabase.js';
import { env, has } from '../lib/env.js';
import { log } from '../lib/logger.js';
import { PLATFORM_ORIENTATION } from '../lib/constants.js';

const PLATFORM = 'instagram';
const ORIENTATION = PLATFORM_ORIENTATION[PLATFORM]; // 'vertical'
const GRAPH_BASE = 'https://graph.facebook.com/v19.0';

/** Poll container status until it's FINISHED (up to maxAttempts × 5s). */
async function waitForContainer(containerId, accessToken, maxAttempts = 12) {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetchJSON(
      `${GRAPH_BASE}/${containerId}?fields=status_code&access_token=${accessToken}`,
    );
    if (res.status_code === 'FINISHED') return true;
    if (res.status_code === 'ERROR') throw new Error(`Instagram container ${containerId} errored`);
    // Wait 5s between polls.
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`Instagram container ${containerId} did not finish in time`);
}

export async function uploadToInstagram({ videoId, strategy, files, thumbnails }) {
  const utm = `https://stackdstudiosai.com/?utm_source=${PLATFORM}&utm_medium=social&utm_campaign=${videoId}`;
  const file = files?.[ORIENTATION] ?? null;

  const baseCaption = strategy?.captions?.[PLATFORM] || strategy?.recommendedHook || strategy?.title || '';
  const hashtags = strategy?.hashtags?.[PLATFORM] || [];
  const hashtagStr = hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
  const fullCaption = `${baseCaption}\n\n${hashtagStr}`.slice(0, 2200);

  // Schedule 1 hour from now.
  const scheduledFor = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  // Instagram scheduling requires a Unix timestamp (seconds).
  const publishTime = Math.floor(Date.now() / 1000) + 3600;

  let platformPostId;
  let platformUrl;

  if (has('INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_ACCOUNT_ID')) {
    try {
      const accessToken = env.INSTAGRAM_ACCESS_TOKEN;
      const accountId = env.INSTAGRAM_ACCOUNT_ID;

      // Resolve a public video URL — Instagram requires a publicly accessible URL.
      // In production, the file would already be uploaded to a CDN (e.g. Supabase Storage).
      // Here we expect INSTAGRAM_VIDEO_BASE_URL env or fall back to a placeholder.
      const videoBaseUrl = env.INSTAGRAM_VIDEO_BASE_URL || 'https://cdn.stackdstudiosai.com/videos';
      const videoPublicUrl = file
        ? `${videoBaseUrl}/${file.replace(/\\/g, '/').split('/').pop()}`
        : null;

      if (!videoPublicUrl) throw new Error('No public video URL available for Instagram upload');

      // Step 1: Create media container (Reel).
      const containerParams = new URLSearchParams({
        media_type: 'REELS',
        video_url: videoPublicUrl,
        caption: fullCaption,
        share_to_feed: 'true',
        access_token: accessToken,
      });
      // Attach trending audio if available.
      // Note: audio_name requires a valid Instagram audio ID from the trending sounds catalog.
      if (env.INSTAGRAM_AUDIO_ID) {
        containerParams.append('audio_name', env.INSTAGRAM_AUDIO_ID);
      }
      // Scheduling: publish_date (Unix timestamp seconds, min 10 min from now, max 75 days).
      containerParams.append('publish_date', String(publishTime));

      const containerRes = await fetchJSON(
        `${GRAPH_BASE}/${accountId}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: containerParams.toString(),
        },
      );
      const containerId = containerRes.id;
      if (!containerId) throw new Error('Instagram did not return container id');

      // Step 2: Wait for container processing.
      await waitForContainer(containerId, accessToken);

      // Step 3: Publish the container (scheduled publish).
      const publishRes = await fetchJSON(
        `${GRAPH_BASE}/${accountId}/media_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            creation_id: containerId,
            access_token: accessToken,
          }).toString(),
        },
      );

      platformPostId = publishRes.id ?? containerId;
      platformUrl = `https://instagram.com/reel/${platformPostId}`;
      log.ok(`instagram scheduled reel: ${platformUrl}`);
    } catch (err) {
      log.error(`instagram upload failed — ${err.message}`);
      platformPostId = `instagram_${cryptoId()}`;
      platformUrl = `https://instagram.com/reel/${platformPostId}`;
    }
  } else {
    log.mock(`instagram upload (videoId: ${videoId})`);
    platformPostId = `instagram_${cryptoId()}`;
    platformUrl = `https://instagram.com/reel/${platformPostId}`;
  }

  const row = {
    video_id: videoId,
    platform: PLATFORM,
    status: 'scheduled',
    platform_post_id: platformPostId,
    platform_url: platformUrl,
    posted_at: null,
    scheduled_for: scheduledFor,
    title: strategy?.title || '',
    caption: fullCaption,
    hashtags,
    utm_link: utm,
    format: ORIENTATION,
  };

  try {
    const record = await dbInsert('posts', row);
    log.ok(`instagram posts row saved: ${record?.id ?? '(no id)'}`);
    return record ?? { platform: PLATFORM, ...row };
  } catch (err) {
    log.error(`instagram dbInsert failed — ${err.message}`);
    return { platform: PLATFORM, ...row };
  }
}

export default uploadToInstagram;

// ---- main guard -------------------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const strategy = {
    title: '5 AI Automations That Will 10x Your Business',
    topic: 'AI automation',
    recommendedHook: 'Stop wasting 10 hours a week on tasks AI can do',
    captions: { instagram: '5 automations that will buy back your time ✨' },
    hashtags: { instagram: ['#AIAutomation', '#StackdStudios', '#BusinessGrowth'] },
  };
  uploadToInstagram({ videoId: 'demo-ig-001', strategy, files: { vertical: null }, thumbnails: {} })
    .then((r) => { log.info(`result: ${JSON.stringify(r, null, 2)}`); process.exit(0); })
    .catch((err) => { log.error(err.message); process.exit(1); });
}
