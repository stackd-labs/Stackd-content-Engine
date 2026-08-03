// ============================================================
// Stage 12 — pullAnalytics.js
// Runs every 24 h via cron. Pulls performance metrics for every
// posted video — real metrics from the YouTube Analytics API,
// TikTok's video/query endpoint, and Meta's Insights API for
// whichever of those platforms have live posting creds configured
// (demo numbers otherwise), stores rows in `analytics`, then asks
// Claude for a weekly insight + calendar suggestions saved to
// output/logs/weekly-insight-<date>.json.
// ============================================================
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateJSON } from '../lib/ai.js';
import { dbInsert, dbSelect } from '../lib/supabase.js';
import { getSettings } from '../lib/settings.js';
import { logsDir, rel } from '../lib/paths.js';
import { env, has, DEMO } from '../lib/env.js';
import { fetchJSON } from '../lib/http.js';
import { getPlatformCredential } from '../lib/credentials.js';
import { log } from '../lib/logger.js';
import { PLATFORMS, HOOK_STYLES } from '../lib/constants.js';

// ---------------------------------------------------------------------------
// Deterministic-ish demo metrics — seeded from a hash of the post id so
// repeated runs return the same numbers for the same post.
// ---------------------------------------------------------------------------
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return Math.abs(h);
}

function demoMetrics(post) {
  const seed = hashStr(String(post.id || post.video_id || 'demo'));
  const base = 1000 + (seed % 49000); // 1k – 50k views
  const engagementRate = 0.03 + (seed % 7) * 0.01; // 3–9 %
  return {
    views: base,
    likes: Math.round(base * engagementRate),
    comments: Math.round(base * 0.005 + (seed % 20)),
    shares: Math.round(base * 0.012 + (seed % 30)),
    watch_time_seconds: Math.round(base * (15 + (seed % 45))), // avg 15–60 s per view
    click_throughs: Math.round(base * 0.02 + (seed % 50)),
    followers_gained: Math.round(base * 0.004 + (seed % 10)),
  };
}

// ---------------------------------------------------------------------------
// Real per-platform metric fetchers. Each reuses the exact same env creds
// already configured for posting (see platforms/uploadTo*.js) — no new
// credentials are introduced here, though some platforms need a BROADER
// SCOPE on those same tokens than posting alone requires. Flagged inline
// below, and every fetcher fails soft (caught by fetchPostMetrics, which
// falls back to demoMetrics) rather than aborting the whole run.
// ---------------------------------------------------------------------------

// --- YouTube Analytics API ---------------------------------------------------
// FLAG: requires the yt-analytics.readonly OAuth scope. The Connect flow
// (pipeline/src/lib/oauth/youtube.js) requests it up front; a token minted
// before that flow existed (uploadToYouTube.js only ever needed
// youtube.upload) will 403 here until reconnected.
async function fetchYouTubeMetrics(post, accessToken) {
  const params = new URLSearchParams({
    ids: 'channel==MINE',
    startDate: '2005-01-01', // lifetime-to-date; the analytics row is a per-video snapshot, not a period delta
    endDate: new Date().toISOString().slice(0, 10),
    metrics: 'views,likes,comments,shares,estimatedMinutesWatched,subscribersGained',
    dimensions: 'video',
    filters: `video==${post.platform_post_id}`,
  });
  const res = await fetchJSON(`https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const row = res.rows?.[0];
  if (!row) throw new Error('no analytics rows returned for this video (too new, or scope missing)');
  const [, views, likes, comments, shares, minutesWatched, subsGained] = row;
  return {
    views: views ?? 0,
    likes: likes ?? 0,
    comments: comments ?? 0,
    shares: shares ?? 0,
    watch_time_seconds: Math.round((minutesWatched ?? 0) * 60),
    click_throughs: 0, // YouTube Analytics has no simple per-video CTR metric in this report shape
    followers_gained: subsGained ?? 0,
  };
}

// --- TikTok metrics endpoint --------------------------------------------------
// FLAG: requires the video.list OAuth scope. The Connect flow
// (pipeline/src/lib/oauth/tiktok.js) requests it up front; a token minted
// before that flow existed (uploadToTikTok.js only ever needed
// video.upload/video.publish) will 403 here until reconnected. Also:
// uploadToTikTok.js posts with privacy_level SELF_ONLY (draft) — until the
// creator manually publishes from the TikTok app, there is no public
// video_id to query, and publish/status/fetch will report it as pending.
async function resolveTikTokVideoId(publishId, accessToken) {
  const res = await fetchJSON('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ publish_id: publishId }),
  });
  const videoId = res?.data?.publicly_available_post_id?.[0] ?? res?.data?.video_id ?? null;
  if (!videoId) {
    throw new Error('TikTok has no resolvable video id yet (draft not published, or publish still processing)');
  }
  return videoId;
}

async function fetchTikTokMetrics(post, accessToken) {
  const videoId = await resolveTikTokVideoId(post.platform_post_id, accessToken);
  const res = await fetchJSON(
    'https://open.tiktokapis.com/v2/video/query/?fields=id,like_count,comment_count,share_count,view_count',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({ filters: { video_ids: [videoId] } }),
    },
  );
  const video = res?.data?.videos?.[0];
  if (!video) throw new Error('TikTok video/query returned no data for this video id');
  return {
    views: video.view_count ?? 0,
    likes: video.like_count ?? 0,
    comments: video.comment_count ?? 0,
    shares: video.share_count ?? 0,
    watch_time_seconds: 0, // not exposed by this endpoint's public field set
    click_throughs: 0,
    followers_gained: 0,
  };
}

// --- Meta Insights API (Instagram + Facebook) ---------------------------------
// FLAG: both need read_insights / instagram_manage_insights permission on the
// SAME tokens used for posting (instagram_content_publish / pages_manage_posts
// alone are not sufficient) — re-authorize with insights read access added if
// this 403s. Also requires an Instagram Business/Creator account linked to a
// Facebook Page; a personal IG account has no Insights API access at all.
async function fetchInstagramMetrics(post) {
  const insightMetrics = ['impressions', 'reach', 'saved', 'shares', 'plays'];
  const [insightsRes, nodeRes] = await Promise.all([
    fetchJSON(
      `https://graph.facebook.com/v19.0/${encodeURIComponent(post.platform_post_id)}/insights` +
      `?metric=${insightMetrics.join(',')}&access_token=${env.INSTAGRAM_ACCESS_TOKEN}`,
    ),
    fetchJSON(
      `https://graph.facebook.com/v19.0/${encodeURIComponent(post.platform_post_id)}` +
      `?fields=like_count,comments_count&access_token=${env.INSTAGRAM_ACCESS_TOKEN}`,
    ),
  ]);
  const byName = Object.fromEntries((insightsRes.data || []).map((m) => [m.name, m.values?.[0]?.value ?? 0]));
  return {
    views: byName.plays ?? byName.impressions ?? 0,
    likes: nodeRes.like_count ?? 0,
    comments: nodeRes.comments_count ?? 0,
    shares: byName.shares ?? 0,
    watch_time_seconds: 0, // Instagram doesn't expose average watch time as a simple per-media metric
    click_throughs: 0,
    followers_gained: 0, // follower growth is account-level, not attributable to a single post here
  };
}

async function fetchFacebookMetrics(post) {
  const insightMetrics = ['post_impressions', 'post_video_views', 'post_reactions_by_type_total'];
  const [insightsRes, nodeRes] = await Promise.all([
    fetchJSON(
      `https://graph.facebook.com/v19.0/${encodeURIComponent(post.platform_post_id)}/insights` +
      `?metric=${insightMetrics.join(',')}&access_token=${env.FACEBOOK_PAGE_ACCESS_TOKEN}`,
    ),
    fetchJSON(
      `https://graph.facebook.com/v19.0/${encodeURIComponent(post.platform_post_id)}` +
      `?fields=shares,comments.summary(true)&access_token=${env.FACEBOOK_PAGE_ACCESS_TOKEN}`,
    ),
  ]);
  const byName = Object.fromEntries((insightsRes.data || []).map((m) => [m.name, m.values?.[0]?.value]));
  const reactions = byName.post_reactions_by_type_total || {};
  const likes = Object.values(reactions).reduce((sum, n) => sum + (Number(n) || 0), 0);
  return {
    views: byName.post_video_views ?? byName.post_impressions ?? 0,
    likes,
    comments: nodeRes.comments?.summary?.total_count ?? 0,
    shares: nodeRes.shares?.count ?? 0,
    watch_time_seconds: 0,
    click_throughs: 0,
    followers_gained: 0,
  };
}

// youtube/tiktok resolve their access token via getPlatformCredential (DB
// Connect row, else env fallback — see pipeline/src/lib/credentials.js) since
// both have a real OAuth Connect flow now. instagram/facebook don't yet, so
// they keep reading straight from env. LinkedIn and Twitter analytics weren't
// part of this request — they keep returning demoMetrics (same as an
// unconfigured platform) until that's asked for.
const METRIC_FETCHERS = {
  youtube:   { needsCredential: true, fetch: fetchYouTubeMetrics },
  tiktok:    { needsCredential: true, fetch: fetchTikTokMetrics },
  instagram: { ready: () => has('INSTAGRAM_ACCESS_TOKEN') && !DEMO, fetch: fetchInstagramMetrics },
  facebook:  { ready: () => has('FACEBOOK_PAGE_ACCESS_TOKEN') && !DEMO, fetch: fetchFacebookMetrics },
};

async function fetchPostMetrics(post) {
  const platform = post.platform || 'youtube';
  const entry = METRIC_FETCHERS[platform];

  if (!entry || !post.platform_post_id) {
    log.mock(`${platform} analytics API (post ${post.id ?? 'demo'})`);
    return demoMetrics(post);
  }

  if (entry.needsCredential) {
    const cred = DEMO ? null : await getPlatformCredential(platform);
    if (!cred?.accessToken) {
      log.mock(`${platform} analytics API (post ${post.id ?? 'demo'})`);
      return demoMetrics(post);
    }
    try {
      const metrics = await entry.fetch(post, cred.accessToken);
      log.ok(`${platform} analytics: live metrics fetched for post ${post.id}`);
      return metrics;
    } catch (err) {
      log.error(`${platform} analytics API failed for post ${post.id} — falling back to demo metrics: ${err.message}`);
      return demoMetrics(post);
    }
  }

  if (entry.ready?.()) {
    try {
      const metrics = await entry.fetch(post);
      log.ok(`${platform} analytics: live metrics fetched for post ${post.id}`);
      return metrics;
    } catch (err) {
      log.error(`${platform} analytics API failed for post ${post.id} — falling back to demo metrics: ${err.message}`);
      return demoMetrics(post);
    }
  }

  log.mock(`${platform} analytics API (post ${post.id ?? 'demo'})`);
  return demoMetrics(post);
}

// ---------------------------------------------------------------------------
// Synthetic dataset used when there are no real posts (demo/no DB).
// ---------------------------------------------------------------------------
function buildSyntheticPosts() {
  const { contentPillars } = getSettings();
  const topics = [
    'How I Automated My Lead Gen With Claude',
    'Building a Client Portal in 48 Hours',
    'My First $10k Month as a Solo Dev',
    'Stop Doing Tasks AI Can Do For You',
    '5 Zapier Flows Every Agency Needs',
    'We Built a Full SaaS in 5 Days',
    'Why Most AI Tools Fail (and What We Use)',
  ];
  return topics.map((topic, i) => ({
    id: `demo-post-${i + 1}`,
    video_id: `vid-${i + 1}`,
    platform: PLATFORMS[i % PLATFORMS.length],
    title: topic,
    hook_style: HOOK_STYLES[i % HOOK_STYLES.length],
    content_pillar: contentPillars[i % contentPillars.length],
    status: 'posted',
  }));
}

// ---------------------------------------------------------------------------
// Build the mock insight Claude falls back to when no key is configured.
// ---------------------------------------------------------------------------
function buildMockInsight(analyticsRows) {
  const { contentPillars } = getSettings();
  return {
    summary:
      'This week the channel hit peak engagement on AI Automation content. ' +
      'Short-form videos (≤60 s) outperformed long-form by 2.4× on watch-time completion. ' +
      '"Bold claim" hooks averaged 47 % higher CTR than curiosity-gap openers.',
    topHookStyle: 'bold claim',
    topPlatform: 'tiktok',
    bestVideo: {
      id: analyticsRows[0]?.post_id ?? 'demo-post-1',
      platform: analyticsRows[0]?.platform ?? 'tiktok',
      views: analyticsRows[0]?.views ?? 42800,
      insight: 'Direct how-to framing in the first 3 seconds drove completion rate above 68 %.',
    },
    recommendedTopics: [
      'How to Build an AI Agent Without Code',
      'The Automation Stack That Runs My Business',
      'Real Client Results: $0 to $5k With One System',
      'What Founders Actually Need to Automate First',
      'Inside Our Live Build: SaaS in 72 Hours',
    ],
    calendarSuggestions: [
      {
        day: 1,
        topic: 'How to Build an AI Agent Without Code',
        format: 'short',
        content_pillar: contentPillars[0],
        rationale: 'Riding high CTR on AI Automation; short format maximises TikTok push.',
      },
      {
        day: 3,
        topic: 'Real Client Win: Automated Intake → Booked Call',
        format: 'medium',
        content_pillar: contentPillars[2],
        rationale: 'Social proof performs well mid-week across LinkedIn + YouTube.',
      },
      {
        day: 5,
        topic: 'Build in Public: Week 3 of Our SaaS',
        format: 'long',
        content_pillar: contentPillars[1],
        rationale: 'Long-form depth piece ladders from earlier short teaser clips.',
      },
      {
        day: 7,
        topic: 'Top 5 Tools We Used to Automate Client Onboarding',
        format: 'short',
        content_pillar: contentPillars[4],
        rationale: 'Listicle hook + tools category; historically high save rate.',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export async function runAnalyticsPull() {
  log.stage('analytics', 'Stage 12 — pulling performance data');

  // 1. Fetch posted videos (empty in demo/no-DB mode).
  let posts = await dbSelect('posts', { match: { status: 'posted' } });
  if (!posts || posts.length === 0) {
    log.warn('No posted videos found — using synthetic demo dataset.');
    posts = buildSyntheticPosts();
  }

  log.info(`Processing metrics for ${posts.length} post(s)…`);

  // 2. Pull metrics per post and insert into analytics table.
  const analyticsRows = [];
  for (const post of posts) {
    try {
      const metrics = await fetchPostMetrics(post);
      const now = new Date().toISOString();
      const record = await dbInsert('analytics', {
        post_id: post.id,
        platform: post.platform,
        ...metrics,
        pulled_at: now,
      });
      if (record) analyticsRows.push({ ...record, _post: post });
      log.ok(`Metrics stored for post ${post.id} (${post.platform}) — ${metrics.views.toLocaleString()} views`);
    } catch (err) {
      log.error(`Failed to pull metrics for post ${post.id}: ${err.message}`);
    }
  }

  // 3. Ask Claude for a weekly insight.
  const { contentPillars, hookStyles } = getSettings();

  const analyticsSnapshot = analyticsRows.map((r) => ({
    post_id: r.post_id,
    platform: r.platform,
    title: r._post?.title ?? '(unknown)',
    hook_style: r._post?.hook_style ?? 'unknown',
    content_pillar: r._post?.content_pillar ?? 'unknown',
    views: r.views,
    likes: r.likes,
    comments: r.comments,
    shares: r.shares,
    watch_time_seconds: r.watch_time_seconds,
    click_throughs: r.click_throughs,
    followers_gained: r.followers_gained,
  }));

  const mock = buildMockInsight(analyticsRows);

  const insight = await generateJSON({
    system:
      'You are the analytics brain for STACKD STUDIOS, an AI-powered content engine. ' +
      'Analyse the provided weekly metrics snapshot and return a single JSON object with keys: ' +
      'summary (string), topHookStyle (string), topPlatform (string), ' +
      'bestVideo ({id,platform,views,insight}), ' +
      'recommendedTopics (array of 5 strings), ' +
      'calendarSuggestions (array of 3-5 objects with keys: day, topic, format, content_pillar, rationale). ' +
      'Be specific, data-driven, and actionable.',
    prompt:
      `Content pillars: ${contentPillars.join(', ')}.\n` +
      `Hook styles tracked: ${hookStyles.join(', ')}.\n\n` +
      `Analytics snapshot (${analyticsSnapshot.length} posts):\n` +
      JSON.stringify(analyticsSnapshot, null, 2) +
      '\n\nProvide a concise weekly performance insight and next-week calendar suggestions.',
    maxTokens: 1800,
    mock,
  });

  // 4. Save insight JSON to logs/.
  const dateStr = new Date().toISOString().slice(0, 10);
  const absPath = join(logsDir(), `weekly-insight-${dateStr}.json`);
  await writeFile(absPath, JSON.stringify(insight, null, 2), 'utf8');
  const insightPath = rel(absPath);

  log.ok(`Weekly insight saved → ${insightPath}`);

  return { insightPath, insight };
}

export default runAnalyticsPull;

// ---------------------------------------------------------------------------
// Main guard
// ---------------------------------------------------------------------------
if (process.argv[1] && process.argv[1].endsWith('pullAnalytics.js')) {
  runAnalyticsPull()
    .then(({ insightPath }) => {
      log.ok(`Done. Insight path: ${insightPath}`);
    })
    .catch((err) => {
      log.error(`runAnalyticsPull failed: ${err.message}`);
      process.exit(1);
    });
}
