// ============================================================
// Stage 10 — Comment Monitor (runs hourly via cron)
// Fetches new comments (demo batch when no platform creds),
// classifies sentiment + drafts replies via Claude, and
// persists each comment to Supabase. Trigger-word comments
// kick off a DM sequence via dmHandler.
// ============================================================
import { pathToFileURL } from 'node:url';
import { generateJSON } from '../lib/ai.js';
import { dbInsert, dbSelect } from '../lib/supabase.js';
import { getSettings } from '../lib/settings.js';
import { log } from '../lib/logger.js';
import { startDmSequence } from './dmHandler.js';

// ---------------------------------------------------------------------------
// Demo comment batch — returned when no live platform API creds exist
// ---------------------------------------------------------------------------
async function fetchNewComments() {
  // In a real deployment each block below would call the platform's
  // comment-list API using creds from env. For now every branch falls
  // through to the demo batch.
  const hasPlatformCreds = false; // extend: has('INSTAGRAM_TOKEN') || has('TIKTOK_TOKEN') etc.

  if (hasPlatformCreds) {
    // TODO: call real platform APIs here.
    return [];
  }

  log.mock('platform comment APIs');

  // Attempt to attach a real post_id to each demo comment.
  let recentPostIds = [];
  try {
    const posts = await dbSelect('posts', { order: 'posted_at', ascending: false, limit: 5 });
    recentPostIds = posts.map((p) => p.id).filter(Boolean);
  } catch {
    // Supabase not configured — leave ids null.
  }

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const postId = (i) => recentPostIds[i] ?? null;

  return [
    {
      platform: 'instagram',
      commenter_handle: '@taylorbuilds',
      comment_text: 'This is exactly what I needed! AUTOMATE my whole workflow please 🙌',
      post_id: postId(0),
    },
    {
      platform: 'tiktok',
      commenter_handle: '@devjordan',
      comment_text: 'How long does it take to BUILD a system like this?',
      post_id: postId(1),
    },
    {
      platform: 'youtube',
      commenter_handle: '@contentqueen',
      comment_text: 'Loved this video! Your energy is so inspiring, keep it up!',
      post_id: postId(2),
    },
    {
      platform: 'linkedin',
      commenter_handle: '@marcus_ops',
      comment_text: 'Honestly this feels overhyped. None of these AI tools actually work.',
      post_id: postId(3),
    },
    {
      platform: 'twitter',
      commenter_handle: '@spambot9000',
      comment_text: 'Click here FREE money!! bit.ly/xyzspam LIMITED OFFER CLICK NOW',
      post_id: postId(4),
    },
  ];
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
      const { platform, commenter_handle, comment_text, post_id } = comment;

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
