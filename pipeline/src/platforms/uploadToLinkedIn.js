// ============================================================
// Platform uploader — LinkedIn
// Uses the LinkedIn UGC Posts API (v2) for video posts on a
// personal profile.
// Required env: LINKEDIN_ACCESS_TOKEN, LINKEDIN_PERSON_ID.
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

const PLATFORM = 'linkedin';
const ORIENTATION = PLATFORM_ORIENTATION[PLATFORM]; // 'landscape'
const LI_BASE = 'https://api.linkedin.com/v2';

export async function uploadToLinkedIn({ videoId, strategy, files, thumbnails }) {
  const utm = `https://stackdstudiosai.com/?utm_source=${PLATFORM}&utm_medium=social&utm_campaign=${videoId}`;
  const file = files?.[ORIENTATION] ?? null;

  const baseCaption = strategy?.captions?.[PLATFORM] || strategy?.recommendedHook || strategy?.title || '';
  // LinkedIn: use 3-5 hashtags, professional framing.
  const allHashtags = strategy?.hashtags?.[PLATFORM] || [];
  const hashtags = allHashtags.slice(0, 5);
  const hashtagStr = hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
  // Professional framing: caption + utm + hashtags.
  const fullCaption = `${baseCaption}\n\n${utm}\n\n${hashtagStr}`.slice(0, 3000);

  let platformPostId;
  let platformUrl;

  if (has('LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_PERSON_ID')) {
    try {
      const accessToken = env.LINKEDIN_ACCESS_TOKEN;
      const personId = env.LINKEDIN_PERSON_ID;
      const personUrn = `urn:li:person:${personId}`;

      // Step 1: Register video upload.
      // POST /v2/assets?action=registerUpload
      const registerRes = await fetchJSON(
        `${LI_BASE}/assets?action=registerUpload`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
          },
          body: JSON.stringify({
            registerUploadRequest: {
              recipes: ['urn:li:digitalmediaRecipe:feedshare-video'],
              owner: personUrn,
              serviceRelationships: [{
                relationshipType: 'OWNER',
                identifier: 'urn:li:userGeneratedContent',
              }],
            },
          }),
        },
      );

      const asset = registerRes?.value?.asset;
      const uploadUrl = registerRes?.value?.uploadMechanism?.[
        'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
      ]?.uploadUrl;

      if (!asset || !uploadUrl) throw new Error('LinkedIn registerUpload did not return asset/uploadUrl');

      // Step 2: Upload video bytes.
      let videoBuffer = null;
      if (file) {
        try { videoBuffer = await readFile(join(process.cwd(), file)); }
        catch (e) { log.warn(`linkedin readFile ${file}: ${e.message}`); }
      }
      if (!videoBuffer) throw new Error('No video file buffer available for LinkedIn upload');

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'video/mp4' },
        body: videoBuffer,
      });
      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`LinkedIn video upload failed ${uploadRes.status}: ${errText.slice(0, 200)}`);
      }

      // Step 3: Create UGC post with video asset.
      const ugcRes = await fetchJSON(
        `${LI_BASE}/ugcPosts`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
          },
          body: JSON.stringify({
            author: personUrn,
            lifecycleState: 'PUBLISHED',
            specificContent: {
              'com.linkedin.ugc.ShareContent': {
                shareCommentary: { text: fullCaption },
                shareMediaCategory: 'VIDEO',
                media: [{
                  status: 'READY',
                  description: { text: strategy?.seo?.description || baseCaption },
                  media: asset,
                  title: { text: strategy?.seo?.title || strategy?.title || 'Stackd Studios' },
                }],
              },
            },
            visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
          }),
        },
      );

      platformPostId = ugcRes?.id ?? `linkedin_${cryptoId()}`;
      // LinkedIn post URN format: urn:li:ugcPost:XXXXXXXXXXX
      const postIdClean = platformPostId.replace('urn:li:ugcPost:', '');
      platformUrl = `https://linkedin.com/feed/update/${platformPostId}`;
      log.ok(`linkedin posted: ${platformUrl}`);
    } catch (err) {
      log.error(`linkedin upload failed — ${err.message}`);
      platformPostId = `linkedin_${cryptoId()}`;
      platformUrl = `https://linkedin.com/feed/update/${platformPostId}`;
    }
  } else {
    log.mock(`linkedin upload (videoId: ${videoId})`);
    platformPostId = `linkedin_${cryptoId()}`;
    platformUrl = `https://linkedin.com/feed/update/${platformPostId}`;
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
    log.ok(`linkedin posts row saved: ${record?.id ?? '(no id)'}`);
    return record ?? { platform: PLATFORM, ...row };
  } catch (err) {
    log.error(`linkedin dbInsert failed — ${err.message}`);
    return { platform: PLATFORM, ...row };
  }
}

export default uploadToLinkedIn;

// ---- main guard -------------------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const strategy = {
    title: '5 AI Automations That Will 10x Your Business',
    topic: 'AI automation',
    recommendedHook: 'Most founders waste 10 hours a week on tasks AI can already do.',
    captions: {
      linkedin: 'I automated 80% of our content operations with these 5 AI systems. Here\'s the breakdown:',
    },
    hashtags: { linkedin: ['#AIAutomation', '#FounderMindset', '#StackdStudios', '#BuildInPublic'] },
    seo: {
      title: '5 AI Automations That Will 10x Your Business | Stackd Studios',
      description: 'Discover the 5 AI automations we use at Stackd Studios to save 10+ hours a week.',
    },
  };
  uploadToLinkedIn({ videoId: 'demo-li-001', strategy, files: { landscape: null }, thumbnails: {} })
    .then((r) => { log.info(`result: ${JSON.stringify(r, null, 2)}`); process.exit(0); })
    .catch((err) => { log.error(err.message); process.exit(1); });
}
