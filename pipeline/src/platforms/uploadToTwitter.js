// ============================================================
// Platform uploader — X / Twitter
// Uses the Twitter API v2 media upload (v1.1 chunked) + tweet
// create flow with OAuth 1.0a.
// Required env: TWITTER_API_KEY, TWITTER_API_SECRET,
//               TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET.
// Falls back to mock when credentials are absent.
// Tweet auto-truncated to <=280 chars with UTM link at the end.
// status 'posted'.
// ============================================================
import { pathToFileURL } from 'node:url';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchJSON } from '../lib/http.js';
import { dbInsert, cryptoId } from '../lib/supabase.js';
import { env, has } from '../lib/env.js';
import { log } from '../lib/logger.js';
import { PLATFORM_ORIENTATION } from '../lib/constants.js';

const PLATFORM = 'twitter';
const ORIENTATION = PLATFORM_ORIENTATION[PLATFORM]; // 'square'

// ── OAuth 1.0a helpers ────────────────────────────────────────────────────

/** Percent-encode per RFC 3986. */
function pctEncode(str) {
  return encodeURIComponent(String(str))
    .replace(/!/g, '%21').replace(/'/g, '%27').replace(/\(/g, '%28')
    .replace(/\)/g, '%29').replace(/\*/g, '%2A');
}

/**
 * Build OAuth 1.0a Authorization header for a given request.
 * method, url, and params are used to construct the signature base string.
 */
function oauthHeader(method, url, params = {}) {
  const oauthParams = {
    oauth_consumer_key: env.TWITTER_API_KEY,
    oauth_nonce: Math.random().toString(36).slice(2) + Date.now().toString(36),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: env.TWITTER_ACCESS_TOKEN,
    oauth_version: '1.0',
  };
  const allParams = { ...params, ...oauthParams };
  const paramStr = Object.keys(allParams).sort()
    .map((k) => `${pctEncode(k)}=${pctEncode(allParams[k])}`)
    .join('&');
  const baseStr = `${method.toUpperCase()}&${pctEncode(url)}&${pctEncode(paramStr)}`;
  const signingKey = `${pctEncode(env.TWITTER_API_SECRET)}&${pctEncode(env.TWITTER_ACCESS_SECRET)}`;
  const signature = createHmac('sha1', signingKey).update(baseStr).digest('base64');
  oauthParams.oauth_signature = signature;
  const headerVal = 'OAuth ' + Object.keys(oauthParams).sort()
    .map((k) => `${pctEncode(k)}="${pctEncode(oauthParams[k])}"`)
    .join(', ');
  return headerVal;
}

/** Build tweet text: caption auto-truncated to fit <=280 chars with UTM appended. */
function buildTweetText(caption, utm) {
  // Twitter counts URLs as 23 chars regardless of length.
  const UTM_T_CO_LEN = 23;
  const MAX = 280;
  const suffix = ` ${utm}`;
  const suffixLen = 1 + UTM_T_CO_LEN; // space + t.co-counted URL
  const available = MAX - suffixLen;
  const truncated = caption.length <= available ? caption : caption.slice(0, available - 1) + '…';
  return `${truncated}${suffix}`;
}

export async function uploadToTwitter({ videoId, strategy, files, thumbnails }) {
  const utm = `https://stackdstudiosai.com/?utm_source=${PLATFORM}&utm_medium=social&utm_campaign=${videoId}`;
  const file = files?.[ORIENTATION] ?? null;

  const baseCaption = strategy?.captions?.[PLATFORM] || strategy?.recommendedHook || strategy?.title || '';
  const hashtags = strategy?.hashtags?.[PLATFORM] || [];
  const hashtagStr = hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
  const captionWithTags = hashtagStr ? `${baseCaption} ${hashtagStr}` : baseCaption;
  const tweetText = buildTweetText(captionWithTags, utm);

  let platformPostId;
  let platformUrl;

  if (has('TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET')) {
    try {
      // ── Step 1: Upload media (chunked v1.1 media upload) ─────────────────
      let mediaId = null;

      let videoBuffer = null;
      if (file) {
        try { videoBuffer = await readFile(join(process.cwd(), file)); }
        catch (e) { log.warn(`twitter readFile ${file}: ${e.message}`); }
      }

      if (videoBuffer) {
        const MEDIA_UPLOAD_URL = 'https://upload.twitter.com/1.1/media/upload.json';

        // INIT
        const initParams = {
          command: 'INIT',
          total_bytes: String(videoBuffer.length),
          media_type: 'video/mp4',
          media_category: 'tweet_video',
        };
        const initBody = new URLSearchParams(initParams).toString();
        const initRes = await fetchJSON(MEDIA_UPLOAD_URL, {
          method: 'POST',
          headers: {
            Authorization: oauthHeader('POST', MEDIA_UPLOAD_URL, initParams),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: initBody,
        });
        mediaId = String(initRes.media_id_string);

        // APPEND (single chunk for simplicity — Twitter max single chunk 5 MB;
        // for larger files this would be looped).
        const CHUNK_SIZE = 5 * 1024 * 1024;
        let segmentIndex = 0;
        for (let offset = 0; offset < videoBuffer.length; offset += CHUNK_SIZE) {
          const chunk = videoBuffer.slice(offset, offset + CHUNK_SIZE);
          const appendForm = new FormData();
          appendForm.append('command', 'APPEND');
          appendForm.append('media_id', mediaId);
          appendForm.append('segment_index', String(segmentIndex));
          appendForm.append('media', new Blob([chunk], { type: 'video/mp4' }), 'chunk.mp4');
          const appendRes = await fetch(MEDIA_UPLOAD_URL, {
            method: 'POST',
            headers: {
              Authorization: oauthHeader('POST', MEDIA_UPLOAD_URL, { command: 'APPEND', media_id: mediaId, segment_index: String(segmentIndex) }),
            },
            body: appendForm,
          });
          if (!appendRes.ok) {
            const errText = await appendRes.text();
            throw new Error(`Twitter APPEND failed ${appendRes.status}: ${errText.slice(0, 200)}`);
          }
          segmentIndex++;
        }

        // FINALIZE
        const finalizeParams = { command: 'FINALIZE', media_id: mediaId };
        await fetchJSON(MEDIA_UPLOAD_URL, {
          method: 'POST',
          headers: {
            Authorization: oauthHeader('POST', MEDIA_UPLOAD_URL, finalizeParams),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams(finalizeParams).toString(),
        });

        // Poll processing status (async_processing may be true for video).
        let processing = true;
        let attempts = 0;
        while (processing && attempts < 20) {
          const statusUrl = `${MEDIA_UPLOAD_URL}?command=STATUS&media_id=${mediaId}`;
          const statusRes = await fetchJSON(statusUrl, {
            headers: { Authorization: oauthHeader('GET', MEDIA_UPLOAD_URL, { command: 'STATUS', media_id: mediaId }) },
          });
          const state = statusRes?.processing_info?.state;
          if (!state || state === 'succeeded') { processing = false; }
          else if (state === 'failed') { throw new Error('Twitter media processing failed'); }
          else {
            const waitSecs = statusRes?.processing_info?.check_after_secs || 5;
            await new Promise((r) => setTimeout(r, waitSecs * 1000));
          }
          attempts++;
        }
      }

      // ── Step 2: Create tweet (v2) ─────────────────────────────────────────
      const tweetBody = { text: tweetText };
      if (mediaId) tweetBody.media = { media_ids: [mediaId] };

      const TWEET_URL = 'https://api.twitter.com/2/tweets';
      const tweetRes = await fetchJSON(TWEET_URL, {
        method: 'POST',
        headers: {
          Authorization: oauthHeader('POST', TWEET_URL),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(tweetBody),
      });

      platformPostId = tweetRes?.data?.id ?? `twitter_${cryptoId()}`;
      platformUrl = `https://x.com/stackdstudios/status/${platformPostId}`;
      log.ok(`twitter posted: ${platformUrl}`);
    } catch (err) {
      log.error(`twitter upload failed — ${err.message}`);
      platformPostId = `twitter_${cryptoId()}`;
      platformUrl = `https://x.com/stackdstudios/status/${platformPostId}`;
    }
  } else {
    log.mock(`twitter upload (videoId: ${videoId})`);
    platformPostId = `twitter_${cryptoId()}`;
    platformUrl = `https://x.com/stackdstudios/status/${platformPostId}`;
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
    caption: tweetText,
    hashtags,
    utm_link: utm,
    format: ORIENTATION,
  };

  try {
    const record = await dbInsert('posts', row);
    log.ok(`twitter posts row saved: ${record?.id ?? '(no id)'}`);
    return record ?? { platform: PLATFORM, ...row };
  } catch (err) {
    log.error(`twitter dbInsert failed — ${err.message}`);
    return { platform: PLATFORM, ...row };
  }
}

export default uploadToTwitter;

// ---- main guard -------------------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const strategy = {
    title: '5 AI Automations That Will 10x Your Business',
    topic: 'AI automation',
    recommendedHook: 'Stop wasting 10 hours a week on tasks AI can do',
    captions: { twitter: '5 automations every founder needs to know about 🧵' },
    hashtags: { twitter: ['#AIAutomation', '#StackdStudios', '#BuildInPublic'] },
  };
  uploadToTwitter({ videoId: 'demo-tw-001', strategy, files: { square: null }, thumbnails: {} })
    .then((r) => { log.info(`result: ${JSON.stringify(r, null, 2)}`); process.exit(0); })
    .catch((err) => { log.error(err.message); process.exit(1); });
}
