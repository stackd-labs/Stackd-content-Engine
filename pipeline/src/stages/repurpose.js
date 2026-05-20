// ============================================================
// Stage 9 — repurpose
// Turns the finished video + script into every derivative asset:
//   blog post (MDX), X/Twitter thread, LinkedIn article,
//   newsletter block, 3 × 60s highlight clips, 3 quote-card specs.
// Each asset is best-effort — failures are logged, not thrown.
// Returns { blogPath, thread, linkedinArticle, newsletterBlock,
//           clips, quoteCards }.
// ============================================================
import { pathToFileURL } from 'node:url';
import { writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { generateText, generateJSON } from '../lib/ai.js';
import { saveBuffer } from '../lib/http.js';
import { repurposeDir, clipsDir, rel, ROOT } from '../lib/paths.js';
import { getSettings } from '../lib/settings.js';
import { updateVideo, appendVideoLog } from '../lib/runState.js';
import { log } from '../lib/logger.js';

// ── helpers ───────────────────────────────────────────────────────────────

/** Spawn a command and return { code, stdout, stderr }. Rejects on error event. */
function spawnAsync(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

/** Returns true when ffmpeg is on PATH. */
async function ffmpegAvailable() {
  try {
    const { code } = await spawnAsync('ffmpeg', ['-version']);
    return code === 0;
  } catch {
    return false;
  }
}

/** Returns true when an absolute path exists on disk. */
async function fileExists(absPath) {
  try { await access(absPath); return true; }
  catch { return false; }
}

// ── main export ──────────────────────────────────────────────────────────

export async function repurpose({ videoId, strategy, audioFilePath, files }) {
  log.stage('repurpose', videoId);

  const settings = getSettings();
  const brand   = settings.brand  || {};
  const leadMag = settings.leadMagnet || {};
  const calLink = settings.calendarLink || 'https://cal.com/stackdstudios/intro';

  const {
    title  = 'Untitled',
    topic  = '',
    script = '',
    seo    = {},
    durationSeconds = 600,
  } = strategy || {};

  const rDir  = repurposeDir(videoId);
  const today = new Date().toISOString().slice(0, 10);

  const result = {
    blogPath:         null,
    thread:           null,
    linkedinArticle:  null,
    newsletterBlock:  null,
    clips:            [],
    quoteCards:       [],
  };

  // ── 1. Blog post (MDX) ─────────────────────────────────────────────────
  try {
    const blogMdx = await generateText({
      system:
        'You are an expert content writer. Transform a video script into a polished SEO blog post in MDX format. ' +
        'Start with YAML frontmatter (title, description, date, tags), then write a complete, engaging article. ' +
        'Use ## headers, bullet lists, and a clear CTA at the end. Do not include code fences around the MDX.',
      prompt:
        `Title: "${title}"\n` +
        `Topic: "${topic}"\n` +
        `SEO description: "${seo?.description || ''}"\n` +
        `SEO tags: ${JSON.stringify(seo?.tags || [])}\n\n` +
        `Script to transform:\n${script}\n\n` +
        `Brand CTA: Visit ${leadMag.url || calLink} to learn more.`,
      maxTokens: 3000,
      mock: `---\ntitle: "${title}"\ndescription: "Discover how ${topic} can transform your business."\ndate: "${today}"\ntags: ["ai", "business", "productivity"]\n---\n\n## Introduction\n\nIf you've been wondering how to leverage ${topic}, this guide is for you.\n\n## Key Takeaways\n\n- AI saves hours of manual work every week.\n- Small steps compound into massive results.\n- The tools you need already exist — you just need a system.\n\n## Getting Started\n\nStart with one workflow. Automate it. Then move to the next.\n\n## Conclusion\n\nReady to go deeper? Visit [Stackd Studios](${calLink}) and let's build together.\n`,
    });

    const blogAbsPath = join(rDir, 'blog.mdx');
    await saveBuffer(blogAbsPath, blogMdx);
    result.blogPath = rel(blogAbsPath);
    log.ok(`repurpose blog saved: ${result.blogPath}`);
  } catch (err) {
    log.warn(`repurpose blog failed — ${err.message}`);
  }

  // ── 2. X / Twitter thread ─────────────────────────────────────────────
  try {
    const threadData = await generateJSON({
      system:
        'You are a viral social media strategist. Create an engaging X (Twitter) thread from key points of a video script. ' +
        'Each tweet must be under 280 chars. First tweet is the hook. Last tweet is a CTA.',
      prompt:
        `Video title: "${title}"\nTopic: "${topic}"\nScript:\n${script.slice(0, 2000)}\n\n` +
        `CTA link: ${leadMag.url || calLink}\n\n` +
        `Return JSON: { "tweets": ["tweet1", "tweet2", ... (5-7 total)] }`,
      maxTokens: 800,
      mock: {
        tweets: [
          `🧵 ${title} — a thread on ${topic}:`,
          `1/ Most people don't realize how much time ${topic} can save. Here's the breakdown:`,
          `2/ The biggest mistake: trying to do everything manually when AI can handle 80% of it.`,
          `3/ Start with your most repetitive task. Automate it first. That's where the ROI lives.`,
          `4/ The compound effect: one automation leads to another, and suddenly your whole workflow is hands-free.`,
          `5/ This isn't theory — it's what we build at Stackd Studios every day.`,
          `6/ Want the full system? Watch the video + grab our free toolkit 👇\n${leadMag.url || calLink}`,
        ],
      },
    });

    result.thread = threadData;
    log.ok(`repurpose thread: ${threadData?.tweets?.length ?? 0} tweets`);
  } catch (err) {
    log.warn(`repurpose thread failed — ${err.message}`);
  }

  // ── 3. LinkedIn article ───────────────────────────────────────────────
  try {
    const liArticle = await generateText({
      system:
        'You are a LinkedIn content expert. Write a long-form LinkedIn article (600-900 words) that expands on a video script. ' +
        'Use a strong opening hook, personal/professional tone, subheadings, and a clear call-to-action. Plain markdown.',
      prompt:
        `Title: "${title}"\nTopic: "${topic}"\n\nScript:\n${script.slice(0, 2500)}\n\n` +
        `End with a CTA to: ${calLink}`,
      maxTokens: 2000,
      mock:
        `# ${title}\n\n` +
        `Let me be direct: most businesses are leaving massive efficiency gains on the table when it comes to ${topic}.\n\n` +
        `I've spent the last year helping founders and operators implement AI-powered systems that run on autopilot. Here's what I've learned.\n\n` +
        `## The Problem\n\nWe're all busy. But busy isn't the same as productive. When you're manually doing tasks that a well-configured AI system could handle, you're not scaling — you're surviving.\n\n` +
        `## The Shift\n\nThe operators winning right now have made one key mental shift: they stopped thinking of AI as a tool and started treating it as a team member.\n\n` +
        `## What This Looks Like in Practice\n\n- Automated content pipelines that produce a week of content in under an hour.\n- Lead follow-up sequences that respond in real time, 24/7.\n- Data summaries delivered to your inbox every morning.\n\n` +
        `## The Result\n\n20+ hours back per week. Consistent output. A business that works even when you don't.\n\n` +
        `If you want to see how this works for your specific business, let's talk: ${calLink}\n`,
    });

    const liPath = join(rDir, 'linkedin.md');
    await saveBuffer(liPath, liArticle);
    result.linkedinArticle = liArticle;
    log.ok(`repurpose linkedin saved: ${rel(liPath)}`);
  } catch (err) {
    log.warn(`repurpose linkedin failed — ${err.message}`);
  }

  // ── 4. Newsletter block ───────────────────────────────────────────────
  try {
    const nlBlock = await generateText({
      system:
        'You are an email newsletter writer. Write a single punchy newsletter section (150-250 words) that highlights the key insight from a video. ' +
        'Conversational tone, one key takeaway, ends with a link to the full video or resource.',
      prompt:
        `Video: "${title}"\nTopic: "${topic}"\nKey points from script:\n${script.slice(0, 1500)}\n\n` +
        `CTA link: ${leadMag.url || calLink}`,
      maxTokens: 600,
      mock:
        `**This week's insight: ${topic}**\n\n` +
        `If there's one thing I want you to take away this week, it's this: the gap between where you are and where you want to be is mostly a systems problem, not a skills problem.\n\n` +
        `In this week's video, I break down exactly how to close that gap using ${topic}. No fluff — just the frameworks we use with real clients.\n\n` +
        `The one thing to try this week: identify your most repetitive task. Write it down. That's your first automation target.\n\n` +
        `👉 [Watch the full breakdown here](${leadMag.url || calLink})\n`,
    });

    result.newsletterBlock = nlBlock;
    log.ok('repurpose newsletter block generated');
  } catch (err) {
    log.warn(`repurpose newsletter failed — ${err.message}`);
  }

  // ── 5. FFmpeg highlight clips ─────────────────────────────────────────
  const clipsOutDir = clipsDir(videoId);
  const intendedClips = [1, 2, 3].map((n) => rel(join(clipsOutDir, `clip-${n}.mp4`)));

  try {
    // Resolve absolute source path only when files.landscape is provided
    let srcAbs = null;
    if (files?.landscape) {
      const candidate = join(ROOT, files.landscape);
      if (await fileExists(candidate)) {
        srcAbs = candidate;
      }
    }

    const hasFfmpeg = await ffmpegAvailable();

    if (!hasFfmpeg || !srcAbs) {
      const reason = !hasFfmpeg ? 'ffmpeg not found' : 'source file not on disk';
      log.mock(`ffmpeg clips (${reason}) — recording intended paths only`);
      result.clips = intendedClips;
    } else {
      // Evenly spaced start points across the video duration
      const total = durationSeconds || 600;
      const starts = [
        Math.floor(total * 0.15),
        Math.floor(total * 0.45),
        Math.floor(total * 0.70),
      ];

      const clipPaths = [];
      for (let n = 0; n < 3; n++) {
        const outPath = join(clipsOutDir, `clip-${n + 1}.mp4`);
        try {
          const { code, stderr } = await spawnAsync('ffmpeg', [
            '-y',
            '-ss', String(starts[n]),
            '-i', srcAbs,
            '-t', '60',
            '-c', 'copy',
            outPath,
          ]);
          if (code === 0) {
            clipPaths.push(rel(outPath));
            log.ok(`repurpose clip-${n + 1} cut at ${starts[n]}s`);
          } else {
            log.warn(`repurpose clip-${n + 1} ffmpeg exit ${code}: ${stderr.slice(0, 120)}`);
            clipPaths.push(rel(outPath)); // record path even if cut failed
          }
        } catch (err) {
          log.warn(`repurpose clip-${n + 1} spawn error — ${err.message}`);
          clipPaths.push(rel(outPath));
        }
      }
      result.clips = clipPaths;
    }
  } catch (err) {
    log.warn(`repurpose clips block failed — ${err.message}`);
    result.clips = intendedClips;
  }

  // ── 6. Quote cards (Remotion spec JSONs) ─────────────────────────────
  try {
    const quoteData = await generateJSON({
      system:
        'You are a social media designer. Extract 3 powerful, standalone quote-worthy sentences from a video script. ' +
        'Each quote should stand alone, spark curiosity or inspiration, and be under 120 characters.',
      prompt:
        `Video title: "${title}"\nScript:\n${script.slice(0, 2000)}\n\n` +
        `Return JSON: { "quotes": ["quote1", "quote2", "quote3"] }`,
      maxTokens: 400,
      mock: {
        quotes: [
          `The gap between where you are and where you want to be is mostly a systems problem.`,
          `Busy isn't the same as productive — and AI is how you bridge that gap.`,
          `One automation leads to another. Suddenly your whole business runs on autopilot.`,
        ],
      },
    });

    const quotes = quoteData?.quotes || [];
    const cardPaths = [];

    for (let n = 0; n < Math.min(quotes.length, 3); n++) {
      try {
        const specPath = join(rDir, `quote-${n + 1}.json`);
        const spec = {
          type: 'remotion-quote-card',
          quote: quotes[n],
          videoId,
          title,
          brand: {
            gold:  brand.gold  || '#D4A017',
            navy:  brand.navy  || '#0A1628',
            voicePersona: brand.voicePersona || 'Stackd Studios',
          },
          note: 'Remotion renders the actual image card from this spec during the render stage.',
        };
        await writeFile(specPath, JSON.stringify(spec, null, 2));
        cardPaths.push(rel(specPath));
        log.ok(`repurpose quote-${n + 1} spec saved`);
      } catch (err) {
        log.warn(`repurpose quote-${n + 1} spec write failed — ${err.message}`);
      }
    }

    result.quoteCards = cardPaths;
  } catch (err) {
    log.warn(`repurpose quoteCards failed — ${err.message}`);
  }

  // ── 7. Persist to Supabase ────────────────────────────────────────────
  try {
    await updateVideo(videoId, { repurposed: result });
  } catch (err) {
    log.warn(`repurpose updateVideo failed — ${err.message}`);
  }

  try {
    await appendVideoLog(
      videoId,
      'repurpose',
      'done',
      'blog+thread+linkedin+newsletter+clips+quotes',
    );
  } catch (err) {
    log.warn(`repurpose appendVideoLog failed — ${err.message}`);
  }

  log.ok(
    `repurpose done — blog:${result.blogPath ? '✓' : '✗'} ` +
    `thread:${result.thread ? '✓' : '✗'} ` +
    `linkedin:${result.linkedinArticle ? '✓' : '✗'} ` +
    `newsletter:${result.newsletterBlock ? '✓' : '✗'} ` +
    `clips:${result.clips.length} ` +
    `quotes:${result.quoteCards.length}`,
  );

  return result;
}

export default repurpose;

// ---- main guard ----------------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sampleStrategy = {
    videoId: 'demo-repurpose-001',
    title: '5 AI Tools That Will 10x Your Business in 2025',
    topic: 'AI tools for small business',
    recommendedHook: 'Stop wasting 10 hours a week',
    script:
      'AI is transforming the way small businesses operate. In this video, I am going to walk you through five tools that I use every single day. ' +
      'Tool one is automated content generation. Tool two is AI-driven lead follow-up. ' +
      'Tool three is smart scheduling. Tool four is analytics summarization. ' +
      'Tool five is workflow automation. Each of these saves me between two and four hours per week. ' +
      'Combined, that is over ten hours back in your calendar every single week. ' +
      'The best part — most of these have free tiers. You can start today.',
    shotList: [],
    seo: {
      description: 'Discover 5 AI tools that save small business owners 10+ hours a week.',
      tags: ['ai', 'small business', 'productivity', 'automation'],
    },
    captions: [],
    durationSeconds: 300,
  };

  const sampleFiles = { landscape: null, vertical: null, square: null };

  log.info('Running repurpose demo…');
  repurpose({
    videoId: sampleStrategy.videoId,
    strategy: sampleStrategy,
    audioFilePath: null,
    files: sampleFiles,
  })
    .then((result) => {
      log.ok('Demo complete');
      log.info(`  blog:       ${result.blogPath ?? '(none)'}`);
      log.info(`  thread:     ${result.thread?.tweets?.length ?? 0} tweets`);
      log.info(`  linkedin:   ${result.linkedinArticle ? result.linkedinArticle.slice(0, 60) + '…' : '(none)'}`);
      log.info(`  newsletter: ${result.newsletterBlock ? result.newsletterBlock.slice(0, 60) + '…' : '(none)'}`);
      log.info(`  clips:      ${result.clips.join(', ') || '(none)'}`);
      log.info(`  quoteCards: ${result.quoteCards.join(', ') || '(none)'}`);
      process.exit(0);
    })
    .catch((err) => {
      log.error(err.message);
      process.exit(1);
    });
}
