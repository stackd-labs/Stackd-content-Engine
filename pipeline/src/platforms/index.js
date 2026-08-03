// ============================================================
// platforms/index.js — Stage 8 orchestrator
// Fans out to all enabled platform uploaders in parallel.
// Any individual failure is caught and reported without
// crashing the batch.
// ============================================================
import { pathToFileURL } from 'node:url';
import { uploadToYouTube } from './uploadToYouTube.js';
import { uploadToTikTok, uploadPhotoToTikTok } from './uploadToTikTok.js';
import { uploadToInstagram, uploadPhotoToInstagram } from './uploadToInstagram.js';
import { uploadToLinkedIn, uploadPhotoToLinkedIn } from './uploadToLinkedIn.js';
import { uploadToFacebook, uploadPhotoToFacebook } from './uploadToFacebook.js';
import { uploadToTwitter, uploadPhotoToTwitter } from './uploadToTwitter.js';
import { getSettings } from '../lib/settings.js';
import { setVideoStatus, updateVideo, appendVideoLog } from '../lib/runState.js';
import { dbSelect } from '../lib/supabase.js';
import { log } from '../lib/logger.js';
import { PHOTO_CAPABLE_PLATFORMS } from '../lib/constants.js';

const UPLOADER_MAP = {
  youtube:   uploadToYouTube,
  tiktok:    uploadToTikTok,
  instagram: uploadToInstagram,
  linkedin:  uploadToLinkedIn,
  facebook:  uploadToFacebook,
  twitter:   uploadToTwitter,
};

// No youtube entry — it has no photo-post equivalent in this pipeline.
const PHOTO_UPLOADER_MAP = {
  tiktok:    uploadPhotoToTikTok,
  instagram: uploadPhotoToInstagram,
  linkedin:  uploadPhotoToLinkedIn,
  facebook:  uploadPhotoToFacebook,
  twitter:   uploadPhotoToTwitter,
};

/**
 * Post to all enabled (or explicitly specified) platforms in parallel.
 *
 * @param {{
 *   videoId: string,
 *   strategy: object,
 *   files: { landscape?: string|null, vertical?: string|null, square?: string|null },
 *   thumbnails: { selected?: string|null, options?: string[] },
 *   platforms?: string[],
 *   contentType?: 'video' | 'photo',
 * }} opts
 * @returns {Promise<Array<{ platform: string, ok: boolean, post?: object, error?: string }>>}
 */
export async function postToPlatforms({ videoId, strategy, files, thumbnails, platforms, contentType = 'video' }) {
  log.stage('post', videoId);

  const isPhoto = contentType === 'photo';
  const uploaderMap = isPhoto ? PHOTO_UPLOADER_MAP : UPLOADER_MAP;

  const settings = getSettings();
  let targetPlatforms = Array.isArray(platforms) && platforms.length > 0
    ? platforms
    : (settings.enabledPlatforms || Object.keys(UPLOADER_MAP));

  if (isPhoto) {
    const dropped = targetPlatforms.filter((p) => !PHOTO_CAPABLE_PLATFORMS.includes(p));
    if (dropped.length > 0) {
      log.warn(`postToPlatforms: dropping [${dropped.join(', ')}] — no photo-post support`);
    }
    targetPlatforms = targetPlatforms.filter((p) => PHOTO_CAPABLE_PLATFORMS.includes(p));
  }

  log.info(`postToPlatforms: targeting [${targetPlatforms.join(', ')}] for ${contentType} ${videoId}`);

  // Fan out in parallel — each uploader is independently try/caught.
  const settled = await Promise.allSettled(
    targetPlatforms.map((platform) => {
      const uploader = uploaderMap[platform];
      if (!uploader) {
        return Promise.reject(new Error(`No ${contentType} uploader registered for platform: ${platform}`));
      }
      return uploader({ videoId, strategy, files, thumbnails });
    }),
  );

  const results = settled.map((result, i) => {
    const platform = targetPlatforms[i];
    if (result.status === 'fulfilled') {
      log.ok(`post ${platform}: success`);
      return { platform, ok: true, post: result.value };
    } else {
      const errMsg = result.reason?.message ?? String(result.reason);
      log.error(`post ${platform}: ${errMsg}`);
      return { platform, ok: false, error: errMsg };
    }
  });

  const okCount = results.filter((r) => r.ok).length;

  // Update video status if at least one platform succeeded.
  if (okCount > 0) {
    try { await setVideoStatus(videoId, 'live'); }
    catch (err) { log.warn(`postToPlatforms setVideoStatus failed — ${err.message}`); }

    try { await updateVideo(videoId, { published_at: new Date().toISOString() }); }
    catch (err) { log.warn(`postToPlatforms updateVideo failed — ${err.message}`); }
  }

  const logMsg = `posted to ${okCount}/${targetPlatforms.length}`;
  try { await appendVideoLog(videoId, 'post', 'done', logMsg); }
  catch (err) { log.warn(`postToPlatforms appendVideoLog failed — ${err.message}`); }

  log.ok(`postToPlatforms done — ${logMsg}`);
  return results;
}

/**
 * Approve & Post — picks up a video where viralityCheck's "flagged" status
 * left off, using the { strategy, files, thumbnails, platforms } snapshot
 * saved to videos.pending_post_payload at flag time, and re-enters
 * postToPlatforms for it. Called by the dashboard's Approve & Post button
 * via POST /approve/:videoId.
 *
 * @param {string} videoId
 * @returns {Promise<Array<{ platform: string, ok: boolean, post?: object, error?: string }>>}
 */
export async function approveAndPost(videoId) {
  const [video] = await dbSelect('videos', { match: { id: videoId } });
  if (!video) throw new Error(`approveAndPost: video ${videoId} not found`);
  if (video.status !== 'flagged') {
    throw new Error(`approveAndPost: video ${videoId} is not flagged (status: ${video.status})`);
  }

  const payload = video.pending_post_payload;
  if (!payload) {
    throw new Error(`approveAndPost: no pending_post_payload for video ${videoId} — cannot resume posting`);
  }

  log.info(`approveAndPost: resuming post for video ${videoId}`);
  await setVideoStatus(videoId, 'posting');

  const results = await postToPlatforms({
    videoId,
    strategy: payload.strategy,
    files: payload.files,
    thumbnails: payload.thumbnails,
    platforms: payload.platforms,
    contentType: payload.contentType,
  });

  try { await updateVideo(videoId, { pending_post_payload: null }); }
  catch (err) { log.warn(`approveAndPost: could not clear pending_post_payload — ${err.message}`); }

  return results;
}

export default postToPlatforms;

// ---- main guard -------------------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const strategy = {
    title: '5 AI Automations That Will 10x Your Business',
    topic: 'AI automation',
    recommendedHook: 'Stop wasting 10 hours a week on tasks AI can do',
    captions: {
      youtube:   'Here are 5 AI automations that changed everything.',
      tiktok:    'These 5 automations changed how we run our whole studio 👇',
      instagram: '5 automations that will buy back your time ✨',
      linkedin:  'I automated 80% of our content ops. Here\'s how:',
      facebook:  'Watch our full breakdown of the 5 AI automations we use.',
      twitter:   '5 automations every founder needs to know about 🧵',
    },
    hashtags: {
      youtube:   ['#AIAutomation', '#StackdStudios'],
      tiktok:    ['#AIAutomation', '#SmallBusiness'],
      instagram: ['#AIAutomation', '#BuildInPublic'],
      linkedin:  ['#AIAutomation', '#FounderMindset'],
      facebook:  ['#AIAutomation', '#Entrepreneur'],
      twitter:   ['#AIAutomation', '#BuildInPublic'],
    },
    seo: {
      title: '5 AI Automations That Will 10x Your Business | Stackd Studios',
      description: 'Discover 5 AI-powered automations that save 10+ hours every week.',
    },
    shotList: [{ time: 0, label: 'Intro' }, { time: 60, label: 'Automation 1' }],
    durationSeconds: 300,
  };

  postToPlatforms({
    videoId: 'demo-post-001',
    strategy,
    files: { landscape: null, vertical: null, square: null },
    thumbnails: { selected: null, options: [] },
  }).then((results) => {
    for (const r of results) {
      if (r.ok) {
        log.ok(`${r.platform}: ${r.post?.platform_url ?? '(no url)'}`);
      } else {
        log.error(`${r.platform}: ${r.error}`);
      }
    }
    process.exit(0);
  }).catch((err) => { log.error(err.message); process.exit(1); });
}
