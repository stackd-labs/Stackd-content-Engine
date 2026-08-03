// ============================================================
// Stage 10 — Comment Monitor (runs hourly via cron)
// Fetches new comments — real platform APIs for whichever platform
// has live creds configured, demo examples for the rest — classifies
// sentiment + drafts replies via Claude, and persists each comment to
// Supabase. Trigger-word comments kick off a DM sequence via dmHandler.
// ============================================================
import { pathToFileURL } from 'node:url';
import { generateJSON } from '../lib/ai.js';
import { dbInsert, dbSelect } from '../lib/supabase.js';
import { getSettings } from '../lib/settings.js';
import { env, has, DEMO } from '../lib/env.js';
import { fetchJSON } from '../lib/http.js';
import { getPlatformCredential } from '../lib/credentials.js';
import { log } from '../lib/logger.js';
import { signOAuth1 } from '../platforms/uploadToTwitter.js';
import { startDmSequence } from './dmHandler.js';

// ---------------------------------------------------------------------------
// Per-platform comment fetchers. Each takes a `posts` row (needs
// platform_post_id) and returns normalized comments:
//   { commenter_handle, comment_text, platform_comment_id }[]
// platform_comment_id is only meaningful for instagram/facebook, where
// dmHandler needs it to send a private-reply DM off a specific comment.
// ---------------------------------------------------------------------------

async function fetchYouTubeComments(post) {
  const res = await fetchJSON(
    `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${encodeURIComponent(post.platform_post_id)}` +
    `&maxResults=20&order=time&textFormat=plainText&key=${env.YOUTUBE_API_KEY}`,
  );
  return (res.items || []).map((item) => {
    const top = item.snippet?.topLevelComment?.snippet;
    return {
      commenter_handle: top?.authorDisplayName ?? 'unknown',
      comment_text: top?.textDisplay ?? '',
      platform_comment_id: item.snippet?.topLevelComment?.id ?? null,
    };
  });
}

async function fetchInstagramComments(post) {
  const res = await fetchJSON(
    `https://graph.facebook.com/v19.0/${encodeURIComponent(post.platform_post_id)}/comments` +
    `?fields=id,username,text&access_token=${env.INSTAGRAM_ACCESS_TOKEN}`,
  );
  return (res.data || []).map((c) => ({
    commenter_handle: c.username ? `@${c.username}` : 'unknown',
    comment_text: c.text ?? '',
    platform_comment_id: c.id ?? null,
  }));
}

async function fetchFacebookComments(post) {
  const res = await fetchJSON(
    `https://graph.facebook.com/v19.0/${encodeURIComponent(post.platform_post_id)}/comments` +
    `?fields=id,from,message&access_token=${env.FACEBOOK_PAGE_ACCESS_TOKEN}`,
  );
  return (res.data || []).map((c) => ({
    commenter_handle: c.from?.name ?? 'unknown',
    comment_text: c.message ?? '',
    platform_comment_id: c.id ?? null,
  }));
}

async function fetchLinkedInComments(post) {
  // Social Actions API — comments live on the share/ugcPost URN.
  const shareUrn = post.platform_post_id;
  const url = `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(shareUrn)}/comments`;
  const res = await fetchJSON(url, {
    headers: {
      Authorization: `Bearer ${env.LINKEDIN_ACCESS_TOKEN}`,
      'X-Restli-Protocol-Version': '2.0.0',
    },
  });
  return (res.elements || []).map((c) => ({
    commenter_handle: c.actor ?? 'unknown',
    comment_text: c.message?.text ?? '',
    platform_comment_id: null, // LinkedIn has no reply-DM path, unused
  }));
}

async function fetchTwitterComments(post, cred) {
  // "Comments" on a tweet = replies, found via conversation_id search.
  const url = `https://api.twitter.com/2/tweets/search/recent` +
    `?query=${encodeURIComponent(`conversation_id:${post.platform_post_id}`)}` +
    `&tweet.fields=author_id,text&expansions=author_id&user.fields=username`;
  const auth = signOAuth1('GET', url, {}, { token: cred.accessToken, tokenSecret: cred.tokenSecret });
  const res = await fetchJSON(url, { headers: { Authorization: auth } });
  const usernames = new Map((res.includes?.users || []).map((u) => [u.id, u.username]));
  return (res.data || []).map((t) => ({
    commenter_handle: usernames.has(t.author_id) ? `@${usernames.get(t.author_id)}` : 'unknown',
    comment_text: t.text ?? '',
    platform_comment_id: null, // Twitter DM targets a user id (resolved by handle), not a tweet id
  }));
}

// Platforms with a genuine "list comments for this post" API given the
// creds this project supports. TikTok's Content Posting API has no public
// comment-read endpoint for standard apps, so it's intentionally absent
// here and always falls through to the demo example below.
// twitter resolves its credential via getPlatformCredential (DB Connect row,
// else env fallback — see pipeline/src/lib/credentials.js) since it has a
// real OAuth Connect flow now. The rest don't yet, so they keep reading
// straight from env.
const PLATFORM_FETCHERS = {
  youtube:   { ready: () => has('YOUTUBE_API_KEY') && !DEMO, fetch: fetchYouTubeComments },
  instagram: { ready: () => has('INSTAGRAM_ACCESS_TOKEN') && !DEMO, fetch: fetchInstagramComments },
  facebook:  { ready: () => has('FACEBOOK_PAGE_ACCESS_TOKEN') && !DEMO, fetch: fetchFacebookComments },
  linkedin:  { ready: () => has('LINKEDIN_ACCESS_TOKEN') && !DEMO, fetch: fetchLinkedInComments },
  twitter:   { needsCredential: true, fetch: fetchTwitterComments },
};

// ---------------------------------------------------------------------------
// Demo comment batch — used per-platform when that platform has no live
// creds configured, so the pipeline still runs end-to-end in demo mode.
// ---------------------------------------------------------------------------
const DEMO_COMMENTS = [
  {
    platform: 'instagram',
    commenter_handle: '@taylorbuilds',
    comment_text: 'This is exactly what I needed! AUTOMATE my whole workflow please 🙌',
  },
  {
    platform: 'tiktok',
    commenter_handle: '@devjordan',
    comment_text: 'How long does it take to BUILD a system like this?',
  },
  {
    platform: 'youtube',
    commenter_handle: '@contentqueen',
    comment_text: 'Loved this video! Your energy is so inspiring, keep it up!',
  },
  {
    platform: 'linkedin',
    commenter_handle: '@marcus_ops',
    comment_text: 'Honestly this feels overhyped. None of these AI tools actually work.',
  },
  {
    platform: 'twitter',
    commenter_handle: '@spambot9000',
    comment_text: 'Click here FREE money!! bit.ly/xyzspam LIMITED OFFER CLICK NOW',
  },
];

async function fetchNewComments() {
  let recentPosts = [];
  try {
    recentPosts = await dbSelect('posts', { order: 'posted_at', ascending: false, limit: 25 });
  } catch {
    // Supabase not configured — nothing to fetch live comments against.
  }

  // Resolve readiness (and, for twitter, the credential to sign with) once
  // per platform up front — reused by both the live-fetch loop and the
  // demo-fallback exclusion set below.
  const resolved = {};
  for (const [platform, entry] of Object.entries(PLATFORM_FETCHERS)) {
    if (entry.needsCredential) {
      const cred = DEMO ? null : await getPlatformCredential(platform);
      resolved[platform] = { ready: Boolean(cred?.accessToken), cred };
    } else {
      resolved[platform] = { ready: entry.ready(), cred: null };
    }
  }

  const collected = [];

  // --- Live platforms: call the real API against each of that platform's
  //     recent posts. Independent per platform/post — one failure doesn't
  //     block the rest (same resilience shape as postToPlatforms).
  for (const [platform, entry] of Object.entries(PLATFORM_FETCHERS)) {
    if (!resolved[platform].ready) continue;

    const platformPosts = recentPosts.filter((p) => p.platform === platform && p.platform_post_id);
    if (platformPosts.length === 0) continue;

    for (const post of platformPosts.slice(0, 3)) {
      try {
        const comments = await entry.fetch(post, resolved[platform].cred);
        for (const c of comments) collected.push({ platform, post_id: post.id, ...c });
        log.ok(`commentMonitor: fetched ${comments.length} comment(s) from ${platform} post ${post.id}`);
      } catch (err) {
        log.warn(`commentMonitor: ${platform} comment fetch failed for post ${post.id}: ${err.message}`);
      }
    }
  }

  // --- Demo fallback: only for platforms that don't have live creds, so a
  //     partially-configured deployment still gets a full realistic batch.
  const livePlatforms = new Set(
    Object.keys(PLATFORM_FETCHERS).filter((p) => resolved[p].ready),
  );
  const demoEntries = DEMO_COMMENTS.filter((c) => !livePlatforms.has(c.platform));

  if (demoEntries.length > 0) {
    log.mock(`platform comment APIs (${demoEntries.map((c) => c.platform).join(', ')})`);
  }

  const postId = (i) => recentPosts[i]?.id ?? null;
  const demoComments = demoEntries.map((c, i) => ({ ...c, post_id: postId(i) }));

  return [...collected, ...demoComments];
}

// ---------------------------------------------------------------------------
// Cheap keyword mock so Claude fallback still feels realistic
// ---------------------------------------------------------------------------
function buildMock(commentText, triggerWords) {
  const lower = commentText.toLowerCase();
  const hasQuestion = lower.includes('?');
  const isSpam =
    lower.includes('free money') ||
    lower.includes('click here') ||
    lower.includes('limited offer') ||
    /bit\.ly|t\.co\/spam/i.test(lower);
  const isNegative =
    !isSpam &&
    (lower.includes('overhyped') ||
      lower.includes('doesn\'t work') ||
      lower.includes('not worth') ||
      lower.includes('waste'));
  const hasTrigger = triggerWords.some((w) => lower.includes(w.toLowerCase()));

  let sentiment = 'positive';
  if (hasTrigger) sentiment = 'trigger';
  else if (isSpam) sentiment = 'spam';
  else if (isNegative) sentiment = 'negative';
  else if (hasQuestion) sentiment = 'question';

  const responses = {
    trigger:
      "Hey! I saw you're interested — I'm sliding into your DMs with something special just for you 🔥",
    positive:
      "Thank you so much! This means the world 💛 Stay tuned — more value coming your way!",
    question:
      "Great question! Drop your email or DM me and I'll send you everything you need to know.",
    negative:
      "I hear you — I'd love to change your mind. Let's connect and talk through it.",
    spam: null,
  };

  return { sentiment, response: responses[sentiment] };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export async function runCommentMonitor() {
  log.stage('commentMonitor', 'fetching & classifying comments');
  const settings = getSettings();
  const triggerWords = settings.triggerWords ?? [];

  const comments = await fetchNewComments();
  log.info(`commentMonitor: processing ${comments.length} comments`);

  let processed = 0;

  for (const comment of comments) {
    try {
      const { platform, commenter_handle, comment_text, post_id, platform_comment_id } = comment;

      // --- 1. Claude: classify sentiment + draft reply in one call ----------
      const mock = buildMock(comment_text, triggerWords);

      const result = await generateJSON({
        system: `You are the social media engagement assistant for ${settings.brand?.voicePersona || 'Chanel Gray at Stackd Studios'}, an AI-powered build lab and venture studio. Classify the comment sentiment and draft a short, authentic reply in Chanel's brand voice — confident, warm, high-value, with a subtle CTA when appropriate.`,
        prompt: `Comment from ${commenter_handle} on ${platform}:\n"${comment_text}"\n\nTrigger words to watch for: ${triggerWords.join(', ')}\n\nReturn JSON: { "sentiment": "positive"|"question"|"negative"|"spam"|"trigger", "response": "reply text or null for spam" }`,
        maxTokens: 400,
        mock,
      });

      let { sentiment, response } = result;

      // --- 2. Force trigger if comment contains a trigger word --------------
      const lowerText = comment_text.toLowerCase();
      const matchedTrigger = triggerWords.find((w) => lowerText.includes(w.toLowerCase()));
      if (matchedTrigger) {
        sentiment = 'trigger';
        response = response ?? mock.response ?? "Sliding into your DMs with something special for you!";
      }

      // --- 3. Determine response_status ------------------------------------
      let response_status;
      if (sentiment === 'spam') {
        response_status = 'skipped';
        response = null; // no reply for spam
      } else if (sentiment === 'negative') {
        response_status = 'skipped'; // flag for manual review
      } else if (sentiment === 'trigger') {
        response_status = 'posted';
        // Kick off DM sequence (non-fatal)
        try {
          await startDmSequence({
            platform,
            handle: commenter_handle,
            triggerWord: matchedTrigger,
            sourceVideoId: null,
            sourcePostId: post_id,
            commentText: comment_text,
            platformCommentId: platform_comment_id ?? null,
          });
        } catch (dmErr) {
          log.warn(`commentMonitor: dmHandler failed for ${commenter_handle}: ${dmErr.message}`);
        }
      } else if ((sentiment === 'positive' || sentiment === 'question') && settings.autoRespond) {
        response_status = 'posted';
      } else {
        response_status = 'pending';
      }

      // --- 4. Persist -------------------------------------------------------
      const record = await dbInsert('comments', {
        post_id,
        platform,
        commenter_handle,
        comment_text,
        sentiment,
        response_text: response ?? null,
        response_status,
        created_at: new Date().toISOString(),
      });

      log.ok(
        `commentMonitor: [${platform}] ${commenter_handle} → sentiment=${sentiment} status=${response_status} id=${record?.id ?? 'n/a'}`,
      );
      processed++;
    } catch (err) {
      log.error(`commentMonitor: failed to process comment from ${comment.commenter_handle}: ${err.message}`);
    }
  }

  log.ok(`commentMonitor: processed ${processed}/${comments.length} comments`);
  return { processed };
}

export default runCommentMonitor;

// ---------------------------------------------------------------------------
// Main guard — node src/engagement/commentMonitor.js
// ---------------------------------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCommentMonitor()
    .then((r) => { log.ok('done', r); process.exit(0); })
    .catch((err) => { log.error('fatal', err); process.exit(1); });
}
