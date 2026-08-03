// ============================================================
// Platform uploader — TikTok
// Uses the TikTok Content Posting API v2 (Direct Post flow).
// Credentials come from the dashboard's Connect flow (platform_credentials
// table) if connected, else fall back to TIKTOK_ACCESS_TOKEN in .env —
// see pipeline/src/lib/credentials.js.
// Falls back to mock when no credential is available either way.
// Video is posted as DRAFT → status 'scheduled'.
// Trending sound: attach TIKTOK_TRENDING_SOUND_ID if provided.
// ============================================================
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchJSON } from '../lib/http.js';
import { dbInsert, cryptoId } from '../lib/supabase.js';
import { env } from '../lib/env.js';
import { getPlatformCredential } from '../lib/credentials.js';
import { log } from '../lib/logger.js';
import { PLATFORM_ORIENTATION } from '../lib/constants.js';

const PLATFORM = 'tiktok';
const ORIENTATION = PLATFORM_ORIENTATION[PLATFORM]; // 'vertical'

export async function uploadToTikTok({ videoId, strategy, files, thumbnails }) {
  const utm = `https://stackdstudiosai.com/?utm_source=${PLATFORM}&utm_medium=social&utm_campaign=${videoId}`;
  const file = files?.[ORIENTATION] ?? null;

  const baseCaption = strategy?.captions?.[PLATFORM] || strategy?.recommendedHook || strategy?.title || '';
  const hashtags = strategy?.hashtags?.[PLATFORM] || [];
  const hashtagStr = hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
  // TikTok caption = hook + hashtags (kept under 2200 chars).
  const fullCaption = `${baseCaption}\n\n${hashtagStr}`.slice(0, 2200);

  let platformPostId;
  let platformUrl;

  const cred = await getPlatformCredential(PLATFORM);

  if (cred?.accessToken) {
    try {
      const accessToken = cred.accessToken;

      // Step 1: Query creator info to confirm account is eligible to post.
      // POST https://open.tiktokapis.com/v2/post/publish/creator_info/query/
      await fetchJSON('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({}),
      });

      // Step 2: Read video bytes.
      let videoBuffer = null;
      if (file) {
        try { videoBuffer = await readFile(join(process.cwd(), file)); }
        catch (e) { log.warn(`tiktok readFile ${file}: ${e.message}`); }
      }
      if (!videoBuffer) throw new Error('No video file buffer available for TikTok upload');

      // Step 3: Init upload — FILE_UPLOAD source type, post as DRAFT.
      // Attach trending sound id if TIKTOK_TRENDING_SOUND_ID is present.
      const postInfo = {
        title: fullCaption,
        privacy_level: 'SELF_ONLY', // DRAFT mode — user can review before publishing
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000,
      };
      if (env.TIKTOK_TRENDING_SOUND_ID) {
        // Attach trending sound — note: sound attachment requires creator approval scopes.
        postInfo.music_id = env.TIKTOK_TRENDING_SOUND_ID;
      }

      const initRes = await fetchJSON(
        'https://open.tiktokapis.com/v2/post/publish/video/init/',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
          body: JSON.stringify({
            post_info: postInfo,
            source_info: {
              source: 'FILE_UPLOAD',
              video_size: videoBuffer.length,
              chunk_size: videoBuffer.length,
              total_chunk_count: 1,
            },
          }),
        },
      );

      const publishId = initRes?.data?.publish_id;
      const uploadUrl = initRes?.data?.upload_url;
      if (!uploadUrl) throw new Error('TikTok init did not return upload_url');

      // Step 4: Upload video bytes in a single chunk.
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Range': `bytes 0-${videoBuffer.length - 1}/${videoBuffer.length}`,
          'Content-Length': String(videoBuffer.length),
        },
        body: videoBuffer,
      });
      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`TikTok chunk upload failed ${uploadRes.status}: ${errText.slice(0, 200)}`);
      }

      platformPostId = publishId ?? `tiktok_${cryptoId()}`;
      platformUrl = `https://tiktok.com/@stackdstudios/video/${platformPostId}`;
      log.ok(`tiktok draft uploaded: ${platformUrl}`);
    } catch (err) {
      log.error(`tiktok upload failed — ${err.message}`);
      platformPostId = `tiktok_${cryptoId()}`;
      platformUrl = `https://tiktok.com/@stackdstudios/video/${platformPostId}`;
    }
  } else {
    log.mock(`tiktok upload (videoId: ${videoId})`);
    platformPostId = `tiktok_${cryptoId()}`;
    platformUrl = `https://tiktok.com/@stackdstudios/video/${platformPostId}`;
  }

  const row = {
    video_id: videoId,
    platform: PLATFORM,
    status: 'scheduled', // draft = scheduled; user publishes from TikTok app
    platform_post_id: platformPostId,
    platform_url: platformUrl,
    posted_at: null,
    scheduled_for: null,
    title: strategy?.title || '',
    caption: fullCaption,
    hashtags,
    utm_link: utm,
    format: ORIENTATION,
  };

  try {
    const record = await dbInsert('posts', row);
    log.ok(`tiktok posts row saved: ${record?.id ?? '(no id)'}`);
    return record ?? { platform: PLATFORM, ...row };
  } catch (err) {
    log.error(`tiktok dbInsert failed — ${err.message}`);
    return { platform: PLATFORM, ...row };
  }
}

/**
 * Photo-post variant — TikTok's Content Posting API has a separate photo
 * endpoint (distinct from the video/init one above) that only accepts
 * PULL_FROM_URL — TikTok's servers fetch the image themselves, there's no
 * FILE_UPLOAD chunking path for photos the way there is for video — so this
 * needs the same "resolve a public URL" step uploadToInstagram uses.
 * Posts as a single-image "photo mode" post (draft, same as the video path).
 */
export async function uploadPhotoToTikTok({ videoId, strategy, files }) {
  const utm = `https://stackdstudiosai.com/?utm_source=${PLATFORM}&utm_medium=social&utm_campaign=${videoId}`;
  const file = files?.[ORIENTATION] ?? files?.square ?? files?.landscape ?? null;

  const baseCaption = strategy?.captions?.[PLATFORM] || strategy?.recommendedHook || strategy?.title || '';
  const hashtags = strategy?.hashtags?.[PLATFORM] || [];
  const hashtagStr = hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
  const fullCaption = `${baseCaption}\n\n${hashtagStr}`.slice(0, 2200);

  let platformPostId;
  let platformUrl;

  const cred = await getPlatformCredential(PLATFORM);

  if (cred?.accessToken) {
    try {
      const accessToken = cred.accessToken;

      await fetchJSON('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({}),
      });

      const photoBaseUrl = env.TIKTOK_PHOTO_BASE_URL || 'https://cdn.stackdstudiosai.com/photos';
      const photoPublicUrl = file
        ? `${photoBaseUrl}/${file.replace(/\\/g, '/').split('/').pop()}`
        : null;
      if (!photoPublicUrl) throw new Error('No public image URL available for TikTok photo upload');

      const initRes = await fetchJSON(
        'https://open.tiktokapis.com/v2/post/publish/content/init/',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
          body: JSON.stringify({
            post_info: {
              title: fullCaption,
              privacy_level: 'SELF_ONLY',
              disable_comment: false,
            },
            source_info: {
              source: 'PULL_FROM_URL',
              photo_images: [photoPublicUrl],
              photo_cover_index: 0,
            },
            post_mode: 'DIRECT_POST',
            media_type: 'PHOTO',
          }),
        },
      );

      platformPostId = initRes?.data?.publish_id ?? `tiktok_${cryptoId()}`;
      platformUrl = `https://tiktok.com/@stackdstudios/photo/${platformPostId}`;
      log.ok(`tiktok draft photo uploaded: ${platformUrl}`);
    } catch (err) {
      log.error(`tiktok photo upload failed — ${err.message}`);
      platformPostId = `tiktok_${cryptoId()}`;
      platformUrl = `https://tiktok.com/@stackdstudios/photo/${platformPostId}`;
    }
  } else {
    log.mock(`tiktok photo upload (videoId: ${videoId})`);
    platformPostId = `tiktok_${cryptoId()}`;
    platformUrl = `https://tiktok.com/@stackdstudios/photo/${platformPostId}`;
  }

  const row = {
    video_id: videoId,
    platform: PLATFORM,
    status: 'scheduled',
    platform_post_id: platformPostId,
    platform_url: platformUrl,
    posted_at: null,
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
    log.ok(`tiktok posts row saved: ${record?.id ?? '(no id)'}`);
    return record ?? { platform: PLATFORM, ...row };
  } catch (err) {
    log.error(`tiktok dbInsert failed — ${err.message}`);
    return { platform: PLATFORM, ...row };
  }
}

export default uploadToTikTok;

// ---- main guard -------------------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const strategy = {
    title: '5 AI Automations That Will 10x Your Business',
    topic: 'AI automation',
    recommendedHook: 'Stop wasting 10 hours a week on tasks AI can do',
    captions: { tiktok: 'These 5 automations changed how we run our whole studio 👇' },
    hashtags: { tiktok: ['#AIAutomation', '#StackdStudios', '#SmallBusiness'] },
  };
  uploadToTikTok({ videoId: 'demo-tt-001', strategy, files: { vertical: null }, thumbnails: {} })
    .then((r) => { log.info(`result: ${JSON.stringify(r, null, 2)}`); process.exit(0); })
    .catch((err) => { log.error(err.message); process.exit(1); });
}
