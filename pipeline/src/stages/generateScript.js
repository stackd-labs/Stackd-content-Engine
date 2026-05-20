// ============================================================
// Stage 2 — generateScript
// Produces the full content strategy: hooks, script, shot list,
// platform captions & hashtags, SEO, virality score.
// Inserts a 'videos' row with status 'producing' and returns the
// strategy object consumed by every downstream stage.
// ============================================================
import { pathToFileURL } from 'node:url';

import { generateJSON } from '../lib/ai.js';
import { getTrending } from '../lib/youtube.js';
import { webSearch } from '../lib/search.js';
import { getSettings } from '../lib/settings.js';
import { FORMAT_DURATIONS, HOOK_STYLES, PLATFORMS } from '../lib/constants.js';
import { dbInsert, cryptoId } from '../lib/supabase.js';
import { appendVideoLog } from '../lib/runState.js';
import { log } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Summarise trending video titles into one compact string. */
function summariseTrends(trendItems) {
  if (!trendItems?.length) return 'No trend data available.';
  return trendItems
    .slice(0, 5)
    .map((t) => `• "${t.title}" — ${t.channel ?? 'unknown'} (${t.views != null ? t.views.toLocaleString() + ' views' : 'top result'})`)
    .join('\n');
}

/** Summarise web search results into one compact string. */
function summariseSearch(results) {
  if (!results?.length) return 'No search data available.';
  return results
    .slice(0, 4)
    .map((r) => `• ${r.title}: ${r.description}`)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Mock object — fully populated, genuinely useful for demo mode
// ---------------------------------------------------------------------------

function buildMock(topic, durationSeconds) {
  return {
    hooks: [
      { style: 'controversy', text: `Most founders are automating the WRONG things — and it's killing their momentum.` },
      { style: 'number hook', text: `3 AI automation moves that saved my agency 14 hours a week (starting week one).` },
      { style: 'story open', text: `Six months ago I was manually writing every proposal. Then I built one system — and everything changed.` },
    ],
    recommendedHookIndex: 1,
    script: [
      `Here are the three AI automations that literally saved my agency 14 hours a week — starting in the first week.`,
      `Number one: automated client intake. Instead of back-and-forth emails, I built a Typeform connected to a Claude workflow that generates a full project brief, a scoped proposal, and a Notion page — all before I even open my laptop.`,
      `Number two: content repurposing. Every long-form piece I create gets fed into a pipeline that spits out six platform-ready captions, three hook variations, and a short-form script. One piece of content, six channels, zero extra effort.`,
      `Number three: follow-up sequences. My CRM now watches for deals that go quiet and auto-drafts a personalised check-in email, flags it for my review, and sends it with one click. My close rate went up 23 percent.`,
      `These aren't hacks — they're systems. And if you want the full blueprint, the link is in the bio. Let's get you stackd.`,
    ].join(' '),
    shotList: [
      {
        index: 0,
        start: 0,
        end: 4,
        visual: 'Founder at desk, looking directly into camera — confident, direct.',
        brollQuery: 'founder entrepreneur desk focused',
        animationBullets: ['14 hrs/week saved', 'Starting week 1'],
      },
      {
        index: 1,
        start: 4,
        end: 14,
        visual: 'Screen recording of Typeform → Claude → Notion workflow in action.',
        brollQuery: 'ai workflow automation screen recording',
        animationBullets: ['Auto client intake', 'Brief + proposal in minutes', 'Zero manual emails'],
      },
      {
        index: 2,
        start: 14,
        end: 26,
        visual: 'Dashboard showing one blog post fanning out into 6 platform posts.',
        brollQuery: 'content repurposing social media dashboard',
        animationBullets: ['1 piece of content', '6 platforms', 'Captions + scripts auto-generated'],
      },
      {
        index: 3,
        start: 26,
        end: 38,
        visual: 'CRM animation — deal going quiet, auto-draft appearing, one-click send.',
        brollQuery: 'crm sales pipeline automation email',
        animationBullets: ['+23% close rate', 'Auto follow-up drafts', 'One-click send'],
      },
      {
        index: 4,
        start: 38,
        end: durationSeconds,
        visual: 'Founder smiling, gestures to CTA — link in bio overlay.',
        brollQuery: 'founder cta call to action confident',
        animationBullets: ['Get the full blueprint', 'Link in bio ↓'],
      },
    ],
    captions: {
      youtube: `I saved 14 hours a week using just 3 AI automation systems in my agency — and you can steal them right now.\n\nIn this video I break down:\n✅ Automated client intake (proposal + brief in minutes)\n✅ Content repurposing pipeline (1 piece → 6 platforms)\n✅ Smart follow-up sequences (+23% close rate)\n\nThese aren't hacks. They're repeatable systems. Get the full blueprint in the link below.\n\n#AIAutomation #AgencyLife #FounderTools`,
      tiktok: `POV: you stopped doing manual work and built systems instead 🤖\n\n3 AI automations that gave me 14 hrs/week back — swipe to steal them.\n\n#AIAutomation #FounderLife #BusinessTips #ProductivityHacks #AgencyOwner`,
      instagram: `14 hours back every week — starting week one. 🙌\n\nHere are the 3 AI automations running my agency on autopilot:\n\n1. Client intake → full brief + proposal, automatically\n2. Content repurposing → 1 post becomes 6\n3. Follow-up sequences → +23% close rate\n\nSave this for later. Full blueprint is linked in my bio.\n\n#AIAutomation #AgencyGrowth #FounderMindset #BusinessSystems #StackdStudios`,
      linkedin: `I reclaimed 14 hours a week in my agency — without hiring anyone.\n\nHere's the three-automation system I built:\n\n→ Automated intake: Typeform + Claude generates the full project brief and proposal before I open my laptop.\n→ Content pipeline: one long-form asset becomes six platform-ready posts automatically.\n→ Follow-up engine: the CRM watches quiet deals and drafts personalised check-ins for one-click send. Close rate up 23%.\n\nThe takeaway: most agency owners are busy being operators. Systems let you be an owner.\n\nWant the blueprint? Drop a comment or grab it via the link in the featured section.`,
      facebook: `🚨 3 AI automations that saved my agency 14 hours a week (real results, week one):\n\n1. Automated client intake — proposals and briefs generated before I sit down\n2. Content repurposing — one piece becomes six platform posts\n3. Smart follow-up sequences — CRM drafts emails when deals go quiet\n\nThese aren't fancy tools. They're simple systems wired together. I'll show you exactly how in the comments or via the link below. 👇`,
      twitter: `I saved 14 hrs/week in my agency with 3 AI automations:\n\n1. Auto intake → brief + proposal generated instantly\n2. 1 post → 6 platform versions, auto\n3. CRM follow-ups on autopilot (+23% close rate)\n\nFull blueprint 👇`,
    },
    hashtags: {
      youtube: ['AIAutomation', 'AgencyLife', 'FounderTools', 'BusinessSystems', 'AIProductivity'],
      tiktok: ['AIAutomation', 'FounderLife', 'BusinessTips', 'ProductivityHacks', 'AgencyOwner'],
      instagram: ['AIAutomation', 'AgencyGrowth', 'FounderMindset', 'BusinessSystems', 'StackdStudios'],
      linkedin: ['AIAutomation', 'AgencyGrowth', 'Entrepreneurship', 'BusinessSystems', 'FounderLife'],
      facebook: ['AIAutomation', 'AgencyLife', 'FounderTools', 'BusinessGrowth'],
      twitter: ['AIAutomation', 'AgencyLife', 'FounderTools'],
    },
    seo: {
      title: `3 AI Automations That Saved My Agency 14 Hours a Week (Step-by-Step)`,
      description: `Discover the exact three AI automation systems a founder used to reclaim 14 hours per week — automated client intake, content repurposing pipelines, and smart CRM follow-ups. Real results, zero fluff. Grab the full blueprint via the link below.`,
    },
    viralityScore: 8,
    viralityReasoning: `Number-anchored hook with a specific, credible claim (14 hrs) is high-performing in the agency/founder niche. The three-part list structure is highly shareable and matches dominant patterns in top-performing short-form content. Strong CTA closes the loop.`,
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generateScript({ topic, format = 'short', contentPillar }) {
  log.stage('generateScript', topic);

  // 1. Resolve duration + settings
  const durationConfig = FORMAT_DURATIONS[format] ?? FORMAT_DURATIONS.short;
  const durationSeconds = durationConfig.target;
  const targetWordCount = Math.round(durationSeconds * 2.5);

  const settings = getSettings();
  const hookStyles = settings.hookStyles?.length ? settings.hookStyles : HOOK_STYLES;
  const brandVoice = settings.brand?.voicePersona ?? 'Direct, confident, and empowering — a builder talking to builders. Cut the fluff; lead with systems and proof.';
  const brandCta = settings.brand?.cta ?? 'Grab the full blueprint — link in bio. Let\'s get you stackd.';
  const resolvedPillar = contentPillar ?? settings.contentPillars?.[0] ?? 'AI Automation';

  // 2. Gather grounding — best-effort, each isolated
  let trendSummary = 'No trend data available.';
  let searchSummary = 'No search data available.';

  try {
    const trends = await getTrending(topic);
    trendSummary = summariseTrends(trends);
  } catch (err) {
    log.warn(`getTrending failed: ${err.message}`);
  }

  try {
    const results = await webSearch(`${topic} trending now`);
    searchSummary = summariseSearch(results);
  } catch (err) {
    log.warn(`webSearch failed: ${err.message}`);
  }

  // 3. Build prompt + call Claude
  const system = `You are Stackd Studios' senior content strategist and scriptwriter.
Brand voice persona: ${brandVoice}
Always close the script with the brand CTA: "${brandCta}"
Content pillar for this piece: ${resolvedPillar}
You write for founders, agency owners, and ambitious builders who want systems, proof, and speed — not hype.
Respond with ONLY valid minified JSON matching the exact schema specified in the user message.`;

  const prompt = `Topic: "${topic}"
Format: ${format} (target duration: ${durationSeconds}s, target word count: ~${targetWordCount} words)
Content pillar: ${resolvedPillar}

TRENDING SIGNALS (YouTube top videos for this topic):
${trendSummary}

WEB CONTEXT (what's trending now):
${searchSummary}

Produce a JSON object with EXACTLY these fields (no extras, no missing):

{
  "hooks": [
    { "style": "<one of: ${hookStyles.slice(0, 6).join(', ')}>", "text": "<hook text>" },
    { "style": "<different style>", "text": "<hook text>" },
    { "style": "<different style>", "text": "<hook text>" }
  ],
  "recommendedHookIndex": <0|1|2 — index of the strongest hook>,
  "script": "<full voiceover script, ~${targetWordCount} words, ending with the brand CTA>",
  "shotList": [
    {
      "index": <number starting 0>,
      "start": <seconds>,
      "end": <seconds>,
      "visual": "<director note — what is shown on screen>",
      "brollQuery": "<2-5 keyword phrase for stock footage search>",
      "animationBullets": ["<short text overlay 1>", "<short text overlay 2>"]
    }
    ... (segments that together span 0 to ${durationSeconds}s)
  ],
  "captions": {
    "youtube": "<caption with line breaks and 3-5 hashtags inline>",
    "tiktok": "<punchy caption, 3-6 hashtags>",
    "instagram": "<engaging caption with line breaks, 5-8 hashtags>",
    "linkedin": "<professional long-form caption, minimal hashtags>",
    "facebook": "<conversational caption, 2-4 hashtags>",
    "twitter": "<under 280 chars, 2-3 hashtags>"
  },
  "hashtags": {
    "youtube": ["<tag>"],
    "tiktok": ["<tag>"],
    "instagram": ["<tag>"],
    "linkedin": ["<tag>"],
    "facebook": ["<tag>"],
    "twitter": ["<tag>"]
  },
  "seo": {
    "title": "<YouTube-optimised title, under 70 chars>",
    "description": "<YouTube description, 2-3 sentences with keyword density>"
  },
  "viralityScore": <integer 1-10>,
  "viralityReasoning": "<1-2 sentences explaining the score>"
}

Use each hook style only once across the three hooks. All three hooks must use DIFFERENT styles.
The script must feel like a real human speaking — rhythm, pauses implied, no bullet points.
shotList segments must be contiguous and together cover exactly 0 to ${durationSeconds} seconds.
animationBullets should be 2-4 short punchy phrases (max 5 words each) for text overlay animations.`;

  const mock = buildMock(topic, durationSeconds);

  let raw;
  try {
    raw = await generateJSON({ system, prompt, maxTokens: 4000, mock });
  } catch (err) {
    log.warn(`generateJSON threw unexpectedly: ${err.message} — using mock`);
    raw = mock;
  }

  // 4. Derive convenience fields
  const recommendedHookIndex = typeof raw.recommendedHookIndex === 'number'
    ? Math.max(0, Math.min(2, raw.recommendedHookIndex))
    : 0;
  const recommendedHook = raw.hooks?.[recommendedHookIndex]?.text ?? raw.hooks?.[0]?.text ?? '';
  const hookStyle = raw.hooks?.[recommendedHookIndex]?.style ?? raw.hooks?.[0]?.style ?? 'bold claim';
  const title = raw.seo?.title || `${topic} — ${format} form`;

  // 5. Persist videos row
  let videoId;
  try {
    const record = await dbInsert('videos', {
      title,
      topic,
      script: raw.script ?? '',
      status: 'producing',
      format,
      hook_style: hookStyle,
      content_pillar: resolvedPillar,
      virality_score: raw.viralityScore ?? null,
      duration_seconds: durationSeconds,
      run_log: [],
    });
    videoId = record?.id ?? cryptoId();
  } catch (err) {
    log.warn(`dbInsert videos failed: ${err.message}`);
    videoId = cryptoId();
  }

  // 6. Append stage log
  try {
    await appendVideoLog(videoId, 'script', 'done', 'Generated 3 hooks + script + shot list');
  } catch (err) {
    log.warn(`appendVideoLog failed: ${err.message}`);
  }

  log.ok(`generateScript done — videoId ${videoId}, virality ${raw.viralityScore ?? '?'}/10`);

  // 7. Return full strategy object
  return {
    videoId,
    title,
    topic,
    format,
    contentPillar: resolvedPillar,
    hooks: raw.hooks ?? mock.hooks,
    recommendedHookIndex,
    recommendedHook,
    hookStyle,
    script: raw.script ?? mock.script,
    shotList: raw.shotList ?? mock.shotList,
    captions: raw.captions ?? mock.captions,
    hashtags: raw.hashtags ?? mock.hashtags,
    seo: raw.seo ?? mock.seo,
    viralityScore: raw.viralityScore ?? mock.viralityScore,
    viralityReasoning: raw.viralityReasoning ?? mock.viralityReasoning,
    durationSeconds,
  };
}

export default generateScript;

// ---------------------------------------------------------------------------
// CLI entry point: node src/stages/generateScript.js "some topic"
// ---------------------------------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateScript({
    topic: process.argv[2] || 'AI automation for founders',
    format: process.argv[3] || 'short',
  }).then((s) => {
    console.log(JSON.stringify(s, null, 2));
    process.exit(0);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
