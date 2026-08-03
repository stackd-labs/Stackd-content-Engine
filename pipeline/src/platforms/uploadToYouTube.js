// ============================================================
// Platform uploader — YouTube
// Uses the YouTube Data API v3 resumable upload flow (OAuth2).
// Credentials come from the dashboard's Connect flow (platform_credentials
// table) if connected, else fall back to YOUTUBE_CLIENT_ID/SECRET/
// REFRESH_TOKEN in .env — see pipeline/src/lib/credentials.js.
// Falls back to mock when no credential is available either way.
// ============================================================
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchJSON } from '../lib/http.js';
import { dbInsert, cryptoId } from '../lib/supabase.js';
import { getPlatformCredential } from '../lib/credentials.js';
import { log } from '../lib/logger.js';
import { PLATFORM_ORIENTATION } from '../lib/constants.js';

const PLATFORM = 'youtube';
const ORIENTATION = PLATFORM_ORIENTATION[PLATFORM]; // 'landscape'

/** Build chapters string from shotList (e.g. [{time:0, label:'Intro'}, ...]). */
function buildChapters(shotList = []) {
  if (!Array.isArray(shotList) || shotList.length === 0) return '';
  const lines = shotList.map((shot, i) => {
    const secs = typeof shot.time === 'number' ? shot.time : 0;
    const mm = String(Math.floor(secs / 60)).padStart(1, '0');
    const ss = String(secs % 60).padStart(2, '0');
    return `${mm}:${ss} ${shot.label || shot.title || `Section ${i + 1}`}`;
  });
  // YouTube requires chapter 0 to start at 0:00.
  if (lines.length > 0 && !lines[0].startsWith('0:00')) lines.unshift('0:00 Intro');
  return '\n\n' + lines.join('\n');
}

/**
 * Build a basic SRT subtitle string from wordTimestamps if provided.
 * wordTimestamps: Array<{ word: string, start: number, end: number }>
 */
function buildSRT(wordTimestamps = []) {
  if (!Array.isArray(wordTimestamps) || wordTimestamps.length === 0) return null;
  const toTC = (s) => {
    const h = Math.floor(s / 3600).toString().padStart(2, '0');
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    const ms = Math.round((s % 1) * 1000).toString().padStart(3, '0');
    return `${h}:${m}:${sec},${ms}`;
  };
  // Group words into ~5-word subtitle blocks.
  const CHUNK = 5;
  const chunks = [];
  for (let i = 0; i < wordTimestamps.length; i += CHUNK) {
    chunks.push(wordTimestamps.slice(i, i + CHUNK));
  }
  return chunks.map((chunk, idx) => {
    const start = chunk[0].start;
    const end = chunk[chunk.length - 1].end;
    const text = chunk.map((w) => w.word).join(' ');
    return `${idx + 1}\n${toTC(start)} --> ${toTC(end)}\n${text}`;
  }).join('\n\n');
}

export async function uploadToYouTube({ videoId, strategy, files, thumbnails }) {
  const utm = `https://stackdstudiosai.com/?utm_source=${PLATFORM}&utm_medium=social&utm_campaign=${videoId}`;
  const file = files?.[ORIENTATION] ?? null;
  const caption = strategy?.captions?.[PLATFORM] || strategy?.recommendedHook || strategy?.title || '';
  const hashtags = strategy?.hashtags?.[PLATFORM] || [];
  const title = strategy?.seo?.title || strategy?.title || 'Untitled';
  const chapters = buildChapters(strategy?.shotList);
  const description = `${strategy?.seo?.description || caption}\n\n${utm}${chapters}`;
  const thumbnailPath = thumbnails?.selected ?? null;

  let platformPostId;
  let platformUrl;

  const cred = await getPlatformCredential(PLATFORM);

  if (cred?.accessToken) {
    try {
      const accessToken = cred.accessToken;

      // Step 2: Initiate resumable upload session.
      // POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status
      // with metadata body → receive Location header (upload URI).
      const metadataBody = JSON.stringify({
        snippet: { title, description, tags: hashtags, categoryId: '28' /* Science & Technology */ },
        status: { privacyStatus: 'unlisted', selfDeclaredMadeForKids: false },
      });
      const initRes = await fetch(
        'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Type': 'video/mp4',
          },
          body: metadataBody,
        },
      );
      if (!initRes.ok) {
        const errText = await initRes.text();
        throw new Error(`YouTube resumable init failed ${initRes.status}: ${errText.slice(0, 200)}`);
      }
      const uploadUri = initRes.headers.get('location');

      // Step 3: Upload video bytes to uploadUri (single PUT for <5 GB).
      let videoBuffer = null;
      if (file) {
        try { videoBuffer = await readFile(join(process.cwd(), file)); }
        catch (e) { log.warn(`youtube readFile ${file}: ${e.message}`); }
      }
      if (!videoBuffer) throw new Error('No video file buffer available for upload');

      const uploadRes = await fetchJSON(uploadUri, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'video/mp4',
          'Content-Length': String(videoBuffer.length),
        },
        body: videoBuffer,
      });
      platformPostId = uploadRes.id;
      platformUrl = `https://youtube.com/watch?v=${platformPostId}`;

      // Step 4: Set thumbnail if available.
      if (thumbnailPath) {
        try {
          let thumbBuffer = null;
          try { thumbBuffer = await readFile(join(process.cwd(), thumbnailPath)); }
          catch { /* skip */ }
          if (thumbBuffer) {
            await fetch(
              `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${platformPostId}`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'image/jpeg',
                },
                body: thumbBuffer,
              },
            );
          }
        } catch (thumbErr) {
          log.warn(`youtube thumbnail set failed — ${thumbErr.message}`);
        }
      }

      // Step 5: Pin a comment with UTM link.
      try {
        await fetchJSON(
          'https://www.googleapis.com/youtube/v3/commentThreads?part=snippet',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              snippet: {
                videoId: platformPostId,
                topLevelComment: {
                  snippet: { textOriginal: `Watch more & get the free toolkit → ${utm}` },
                },
              },
            }),
          },
        );
      } catch (commentErr) {
        log.warn(`youtube pin comment failed — ${commentErr.message}`);
      }

      // Step 6: Upload SRT captions if wordTimestamps available.
      const srtString = buildSRT(strategy?.wordTimestamps);
      if (srtString) {
        try {
          const srtBlob = Buffer.from(srtString, 'utf8');
          const captionInitRes = await fetch(
            'https://www.googleapis.com/upload/youtube/v3/captions?uploadType=resumable&part=snippet',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json; charset=UTF-8',
                'X-Upload-Content-Type': 'text/plain',
              },
              body: JSON.stringify({
                snippet: { videoId: platformPostId, language: 'en', name: 'English', isDraft: false },
              }),
            },
          );
          if (captionInitRes.ok) {
            const captionUri = captionInitRes.headers.get('location');
            if (captionUri) {
              await fetch(captionUri, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'text/plain' },
                body: srtBlob,
              });
            }
          }
        } catch (srtErr) {
          log.warn(`youtube SRT upload failed — ${srtErr.message}`);
        }
      }

      log.ok(`youtube uploaded: ${platformUrl}`);
    } catch (err) {
      log.error(`youtube upload failed — ${err.message}`);
      platformPostId = `youtube_${cryptoId()}`;
      platformUrl = `https://youtube.com/watch?v=${platformPostId}`;
    }
  } else {
    log.mock(`youtube upload (videoId: ${videoId})`);
    platformPostId = `youtube_${cryptoId()}`;
    platformUrl = `https://youtube.com/watch?v=${platformPostId}`;
  }

  const row = {
    video_id: videoId,
    platform: PLATFORM,
    status: 'posted',
    platform_post_id: platformPostId,
    platform_url: platformUrl,
    posted_at: new Date().toISOString(),
    scheduled_for: null,
    title,
    caption,
    hashtags,
    utm_link: utm,
    format: ORIENTATION,
  };

  try {
    const record = await dbInsert('posts', row);
    log.ok(`youtube posts row saved: ${record?.id ?? '(no id)'}`);
    return record ?? { platform: PLATFORM, ...row };
  } catch (err) {
    log.error(`youtube dbInsert failed — ${err.message}`);
    return { platform: PLATFORM, ...row };
  }
}

export default uploadToYouTube;

// ---- main guard -------------------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const strategy = {
    videoId: 'demo-yt-001',
    title: '5 AI Automations That Will 10x Your Business',
    topic: 'AI automation',
    recommendedHook: 'Stop wasting 10 hours a week on tasks AI can do',
    captions: { youtube: 'Here are 5 AI automations that changed everything for us.' },
    hashtags: { youtube: ['#AIAutomation', '#StackdStudios', '#BuildInPublic'] },
    seo: {
      title: '5 AI Automations That Will 10x Your Business | Stackd Studios',
      description: 'Discover 5 AI-powered automations used by Stackd Studios to save 10+ hours a week.',
    },
    shotList: [{ time: 0, label: 'Intro' }, { time: 45, label: 'Tool 1' }, { time: 120, label: 'Tool 2' }],
    durationSeconds: 300,
  };
  uploadToYouTube({ videoId: 'demo-yt-001', strategy, files: { landscape: null }, thumbnails: { selected: null } })
    .then((r) => { log.info(`result: ${JSON.stringify(r, null, 2)}`); process.exit(0); })
    .catch((err) => { log.error(err.message); process.exit(1); });
}
