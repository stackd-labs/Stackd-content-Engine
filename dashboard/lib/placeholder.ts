// ============================================================
// Placeholder data. Used whenever Supabase is not configured so
// the command center is fully explorable out of the box.
//
// IMPORTANT: all timestamps are derived from a FIXED base date
// (not Date.now()) so server-render and client-hydration match.
// ============================================================

import type {
  Analytics,
  CalendarEntry,
  Comment,
  EmailSubscriber,
  Lead,
  Platform,
  Post,
  PipelineRun,
  Video,
} from '@shared/types';
import {
  DEFAULT_CONTENT_PILLARS,
  DEFAULT_HOOK_STYLES,
  PIPELINE_STAGES,
  PLATFORMS,
} from '@shared/constants';

// Fixed "now" — keeps SSR and CSR deterministic.
export const NOW = new Date('2026-05-20T12:00:00.000Z');

const day = 86_400_000;
const iso = (offsetDays: number, offsetMs = 0) =>
  new Date(NOW.getTime() + offsetDays * day + offsetMs).toISOString();

// tiny deterministic PRNG so the dataset is stable build-to-build
function seeded(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const rnd = seeded(42);
const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
const int = (min: number, max: number) =>
  Math.floor(rnd() * (max - min + 1)) + min;

const TOPICS = [
  'The 3-tool AI stack that runs my agency on autopilot',
  'I automated my entire content pipeline — here is the system',
  'Why most founders fail at delegation (and the fix)',
  'Build a lead magnet that prints clients while you sleep',
  'The Claude prompt that writes a week of content in 4 minutes',
  'How we render 30 videos a day with zero editors',
  'Stop posting manually — this engine does it for you',
  'The $0 marketing system that booked 11 calls last week',
  'Turn one idea into 12 platform-native posts instantly',
  'The hook formula that 10x our watch time',
  'From comment to paying client: the DM flow that converts',
  'Your CRM should fill itself — here is how mine does',
  'The weekly newsletter my AI writes and I just approve',
  'Analytics that actually tell you what to make next',
  'How I went from 0 to a content machine in one weekend',
  'The virality score we run every script through',
];

const HANDLES = [
  '@growthwithmaya', '@thefoundersam', '@buildwithleo', '@aria.codes',
  '@jaytheoperator', '@nina_scales', '@devon.builds', '@theofficecat',
  '@marisol.ai', '@kingsleybuilds', '@quietlaunch', '@thesolofounder',
  '@reeses_pieces', '@automate_or_die',
];

const CAPTIONS = [
  'Save this before it gets buried 👇',
  'The system in 60 seconds. Comment STACKD for the blueprint.',
  'This took me 2 years to figure out. Here it is free.',
  'Most people overcomplicate this. Watch.',
  'Drop a 🔥 if you want the template.',
  'Comment BUILD and I will send the workflow.',
];

// ---- Videos --------------------------------------------------
const STATUSES = ['live', 'live', 'live', 'rendering', 'producing', 'posting', 'flagged', 'failed'] as const;
const FORMATS = ['short', 'short', 'medium', 'long'] as const;

export const placeholderVideos: Video[] = TOPICS.map((topic, i) => {
  const status = i < 9 ? 'live' : STATUSES[i % STATUSES.length];
  const format = FORMATS[i % FORMATS.length];
  const createdOffset = -(TOPICS.length - i) * 1.4;
  const stagesDone = status === 'live' ? PIPELINE_STAGES.length : int(3, PIPELINE_STAGES.length - 2);
  return {
    id: `vid-${String(i + 1).padStart(3, '0')}`,
    title: topic,
    topic,
    script: `HOOK: ${topic}\n\nMost people think growth needs a big team. It doesn't — it needs a system.\n\nHere are the three moves:\n\n1. Capture every idea in one place.\n2. Let the engine script, score, and render it.\n3. Auto-post and let the comments fill your CRM.\n\nThat's it. The machine runs while you sleep.\n\nCTA: Comment STACKD and I'll send you the full blueprint.`,
    status,
    created_at: iso(createdOffset),
    published_at: status === 'live' ? iso(createdOffset + 0.5) : null,
    duration_seconds: format === 'short' ? int(22, 58) : format === 'medium' ? int(120, 280) : int(420, 720),
    format,
    thumbnail_url: null,
    video_file_path: status === 'live' ? `/output/videos/vid-${i + 1}.mp4` : null,
    audio_file_path: stagesDone > 5 ? `/output/audio/vid-${i + 1}.mp3` : null,
    virality_score: int(4, 10),
    hook_style: DEFAULT_HOOK_STYLES[i % DEFAULT_HOOK_STYLES.length],
    content_pillar: DEFAULT_CONTENT_PILLARS[i % DEFAULT_CONTENT_PILLARS.length],
    run_log: PIPELINE_STAGES.map((stage, s) => ({
      stage,
      status: s < stagesDone ? 'done' : s === stagesDone && status !== 'live' ? 'failed' : 'pending',
      message: s < stagesDone ? 'ok' : undefined,
      at: s < stagesDone ? iso(createdOffset, s * 4000) : undefined,
    })),
  };
});

// ---- Posts ---------------------------------------------------
const fmtForPlatform = (p: Platform): Post['format'] =>
  p === 'youtube' || p === 'twitter' || p === 'facebook' ? 'landscape'
  : p === 'instagram' ? 'square' : 'vertical';

export const placeholderPosts: Post[] = [];
placeholderVideos.forEach((v, vi) => {
  if (v.status !== 'live' && v.status !== 'posting') return;
  const platformsForVideo = PLATFORMS.filter((_, pi) => (vi + pi) % 2 === 0 || pi < 3);
  platformsForVideo.forEach((platform, pi) => {
    const idx = placeholderPosts.length + 1;
    placeholderPosts.push({
      id: `post-${String(idx).padStart(3, '0')}`,
      video_id: v.id,
      platform,
      status: v.status === 'posting' && pi > 1 ? 'scheduled' : 'posted',
      platform_post_id: `${platform}_${1000 + idx}`,
      platform_url: `https://${platform}.com/stackdstudios/p/${1000 + idx}`,
      posted_at: v.published_at,
      scheduled_for: v.status === 'posting' ? iso(0.5) : null,
      title: v.title,
      caption: pick(CAPTIONS),
      hashtags: ['#aiautomation', '#buildinpublic', '#stackdstudios', '#contentengine'].slice(0, int(2, 4)),
      utm_link: `https://stackdstudiosai.com/?utm_source=${platform}&utm_medium=social&utm_campaign=${v.id}`,
      format: fmtForPlatform(platform),
    });
  });
});

// ---- Analytics (one row per posted post) ---------------------
export const placeholderAnalytics: Analytics[] = placeholderPosts
  .filter((p) => p.status === 'posted')
  .map((p, i) => {
    const views = int(800, 240_000);
    return {
      id: `an-${String(i + 1).padStart(3, '0')}`,
      post_id: p.id,
      platform: p.platform,
      pulled_at: iso(-0.2),
      views,
      likes: Math.floor(views * (0.03 + rnd() * 0.07)),
      comments: Math.floor(views * (0.002 + rnd() * 0.01)),
      shares: Math.floor(views * (0.001 + rnd() * 0.008)),
      watch_time_seconds: Math.floor(views * int(6, 22)),
      click_throughs: Math.floor(views * (0.004 + rnd() * 0.02)),
      followers_gained: int(2, 480),
    };
  });

// ---- Leads ---------------------------------------------------
const LEAD_STATUSES = ['new', 'new', 'contacted', 'qualified', 'booked', 'converted', 'dead'] as const;
export const placeholderLeads: Lead[] = HANDLES.map((handle, i) => {
  const v = placeholderVideos[i % placeholderVideos.length];
  const status = LEAD_STATUSES[i % LEAD_STATUSES.length];
  const trigger = pick(['STACKD', 'BUILD', 'AUTOMATE', 'SYSTEM', 'BLUEPRINT']);
  return {
    id: `lead-${String(i + 1).padStart(3, '0')}`,
    source_platform: pick(PLATFORMS),
    source_post_id: pick(placeholderPosts).id,
    source_video_id: v.id,
    name: handle.replace(/[@._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim(),
    handle,
    email: status === 'new' ? null : `${handle.replace(/[@.]/g, '')}@gmail.com`,
    trigger_word: trigger,
    conversation_log: [
      { role: 'lead', text: trigger, at: iso(-(i + 1)) },
      { role: 'agent', text: `Hey! Thanks for the interest 🙌 Here's the ${trigger} blueprint — want me to walk you through setting it up?`, at: iso(-(i + 1), 60000) },
      ...(status !== 'new' ? [{ role: 'lead' as const, text: 'Yes please, that would be amazing.', at: iso(-(i + 1), 600000) }] : []),
    ],
    status,
    created_at: iso(-(i + 1)),
    notes: status === 'booked' ? 'Call booked for next Tuesday.' : status === 'converted' ? 'Signed onto the Build Lab.' : '',
  };
});

// ---- Comments ------------------------------------------------
const SENTIMENTS = ['positive', 'question', 'trigger', 'negative', 'spam'] as const;
const COMMENT_TEXT: Record<(typeof SENTIMENTS)[number], string[]> = {
  positive: ['This is gold 🔥', 'Saved. Instantly subscribed.', 'Best breakdown I have seen all week.'],
  question: ['Which tool do you use for the rendering part?', 'Does this work for a service business?', 'How long did the setup take?'],
  trigger: ['STACKD', 'BUILD', 'Comment says AUTOMATE 👀'],
  negative: ['This feels overhyped tbh', 'Sounds too good to be true.'],
  spam: ['Check my profile for free followers!!', 'DM me to 10x your income today 💰'],
};
const RESP_STATUS = ['pending', 'pending', 'approved', 'posted', 'skipped'] as const;
export const placeholderComments: Comment[] = Array.from({ length: 22 }, (_, i) => {
  const sentiment = SENTIMENTS[i % SENTIMENTS.length];
  const post = placeholderPosts[i % placeholderPosts.length];
  const respStatus = sentiment === 'spam' ? 'skipped' : RESP_STATUS[i % RESP_STATUS.length];
  return {
    id: `cmt-${String(i + 1).padStart(3, '0')}`,
    post_id: post.id,
    platform: post.platform,
    commenter_handle: pick(HANDLES),
    comment_text: pick(COMMENT_TEXT[sentiment]),
    sentiment,
    response_text:
      sentiment === 'spam' ? null
      : sentiment === 'trigger' ? "Sent you the blueprint in your DMs! 🚀"
      : sentiment === 'question' ? 'Great question — Remotion handles the render, ElevenLabs the voice. Full stack is in my pinned post.'
      : 'Appreciate you! 🙏',
    response_status: respStatus,
    created_at: iso(-(i % 6) - 0.3),
  };
});

// ---- Email subscribers --------------------------------------
export const placeholderEmails: EmailSubscriber[] = Array.from({ length: 34 }, (_, i) => ({
  id: `em-${String(i + 1).padStart(3, '0')}`,
  subscriber_email: `subscriber${i + 1}@${pick(['gmail.com', 'outlook.com', 'proton.me', 'company.co'])}`,
  first_name: pick(['Alex', 'Sam', 'Jordan', 'Taylor', 'Maya', 'Leo', 'Nina', 'Devon', 'Aria', 'Kingsley']),
  source_video_id: pick(placeholderVideos).id,
  source_platform: pick(PLATFORMS),
  subscribed_at: iso(-(i % 30) - 1),
  sequence_step: int(0, 5),
  last_email_sent: i % 4 === 0 ? null : iso(-(i % 7)),
  status: i % 11 === 0 ? 'unsubscribed' : 'active',
}));

// ---- Content calendar ---------------------------------------
const CAL_STATUSES = ['posted', 'posted', 'ready', 'in_production', 'planned', 'planned', 'skipped'] as const;
export const placeholderCalendar: CalendarEntry[] = Array.from({ length: 34 }, (_, i) => {
  const offset = i - 12; // ~12 days back to ~3 weeks forward
  const status =
    offset < -1 ? 'posted'
    : offset < 1 ? pick(['ready', 'in_production'] as any)
    : CAL_STATUSES[i % CAL_STATUSES.length];
  return {
    id: `cal-${String(i + 1).padStart(3, '0')}`,
    scheduled_date: iso(offset).slice(0, 10),
    topic: TOPICS[i % TOPICS.length],
    content_pillar: DEFAULT_CONTENT_PILLARS[i % DEFAULT_CONTENT_PILLARS.length],
    format: FORMATS[i % FORMATS.length],
    status: status as CalendarEntry['status'],
    video_id: offset < 0 ? placeholderVideos[i % placeholderVideos.length].id : null,
    notes: '',
  };
});

// ---- Pipeline runs ------------------------------------------
export const placeholderPipelineRuns: PipelineRun[] = [
  {
    id: 'run-006',
    started_at: iso(0, -90_000),
    completed_at: null,
    topic: 'The Claude prompt that writes a week of content in 4 minutes',
    status: 'running',
    stages_completed: PIPELINE_STAGES.slice(0, 5) as unknown as string[],
    error_message: null,
    output_log: PIPELINE_STAGES.map((stage, s) => ({
      stage,
      status: s < 5 ? 'done' : s === 5 ? 'running' : 'pending',
      at: s <= 5 ? iso(0, -90_000 + s * 12_000) : undefined,
    })),
  },
  ...Array.from({ length: 5 }, (_, i) => {
    const failed = i === 2;
    return {
      id: `run-00${5 - i}`,
      started_at: iso(-(i + 1)),
      completed_at: iso(-(i + 1), 320_000),
      topic: TOPICS[i + 3],
      status: (failed ? 'failed' : 'completed') as PipelineRun['status'],
      stages_completed: (failed ? PIPELINE_STAGES.slice(0, 6) : PIPELINE_STAGES) as unknown as string[],
      error_message: failed ? 'ElevenLabs quota exceeded — voiceover stage failed.' : null,
      output_log: [],
    };
  }),
];

// ---- registry used by the data hook --------------------------
export const PLACEHOLDERS = {
  videos: placeholderVideos,
  posts: placeholderPosts,
  analytics: placeholderAnalytics,
  leads: placeholderLeads,
  comments: placeholderComments,
  emails: placeholderEmails,
  content_calendar: placeholderCalendar,
  pipeline_runs: placeholderPipelineRuns,
} as const;

export type TableName = keyof typeof PLACEHOLDERS;
