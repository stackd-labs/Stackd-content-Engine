// ============================================================
// Stage 11 — Weekly Newsletter (Sunday cron)
// generateWeeklyNewsletter() -> drafts to output/logs/newsletter-YYYY-MM-DD.json
// sendNewsletter({ subject, html }) -> approved send path (dashboard button)
// ============================================================
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateText, generateJSON } from '../lib/ai.js';
import { sendEmail } from '../lib/resend.js';
import { dbSelect } from '../lib/supabase.js';
import { getSettings } from '../lib/settings.js';
import { logsDir, rel } from '../lib/paths.js';
import { log } from '../lib/logger.js';

// ── Mock newsletter (realistic fallback) ─────────────────────
const MOCK_NEWSLETTER = {
  subject: 'This week at Stackd: AI content wins + what\'s coming Sunday',
  html: `<h2>This Week at Stackd Studios</h2>

<h3>Top Video of the Week</h3>
<p>Our most-watched piece this week walked through the exact 5-step AI content system we use for every client. If you missed it, <a href="https://youtube.com/@stackdstudios">catch it here</a>.</p>

<h3>Key Insight</h3>
<p>The brands winning on short-form right now aren't posting more — they're posting smarter. One well-structured hook beats ten generic posts every time. We broke down 3 hooks that consistently hit 100k+ views in the comments of that video.</p>

<h3>What's Coming Next Week</h3>
<p>We're dropping a full tutorial on building a repurposing pipeline in under 2 hours. No code required. Subscribe so you don't miss it.</p>

<h3>Ready to Build Your System?</h3>
<p><a href="{{calendarLink}}">Book a free intro call →</a> — 20 minutes, no pitch, just strategy.</p>

<hr />
<p style="font-size:12px;color:#888;">You're receiving this because you subscribed to updates from Stackd Studios.
<a href="#">Unsubscribe</a></p>`,
};

// ── generateWeeklyNewsletter ─────────────────────────────────
export async function generateWeeklyNewsletter() {
  log.stage('weeklyNewsletter', 'generating draft');

  const settings = getSettings();
  const { brand = {}, calendarLink } = settings;
  const cal = calendarLink || 'https://cal.com/stackdstudios/intro';
  const persona = brand.voicePersona || 'friendly, expert, direct';

  // Pull recent videos
  let videos = [];
  try {
    videos = await dbSelect('videos', { order: 'created_at', ascending: false, limit: 20 });
  } catch (err) {
    log.warn(`weeklyNewsletter: could not fetch videos (${err.message})`);
  }

  // Best-effort: try to find top video from analytics or views
  let topVideo = null;
  if (videos.length > 0) {
    // Prefer highest views if field exists, otherwise most recent
    topVideo = videos.reduce((best, v) => {
      const bestViews = best.views ?? best.view_count ?? 0;
      const vViews = v.views ?? v.view_count ?? 0;
      return vViews > bestViews ? v : best;
    }, videos[0]);
  }

  const topVideoTitle = topVideo?.title || topVideo?.video_title || 'our latest video';
  const topVideoUrl =
    topVideo?.youtube_url ||
    topVideo?.url ||
    topVideo?.published_url ||
    'https://youtube.com/@stackdstudios';

  const recentTitles = videos
    .slice(0, 5)
    .map((v) => v.title || v.video_title || 'Untitled')
    .join(', ');

  const today = new Date().toISOString().slice(0, 10);

  // ── Generate newsletter via Claude ───────────────────────
  const systemPrompt = `You are writing a weekly email newsletter for Stackd Studios, an AI-powered build lab for founders. Voice: ${persona}. Structure: HTML with minimal inline styles. Sections: Top Video of the Week, Key Insight/Tip, What's Coming Next Week, one soft CTA. Keep it scannable and under 400 words. Use proper HTML — h2/h3 for sections, p tags, a tags for links. Return ONLY the HTML body (no <html>/<body> wrappers).`;

  const userPrompt = `Write this week's newsletter.
Top video: "${topVideoTitle}" — URL: ${topVideoUrl}
Other recent content titles: ${recentTitles || 'none yet'}
CTA link: ${cal}
Calendar link for booking: ${cal}
Today's date: ${today}
Make the insight feel genuinely useful, not generic.`;

  const mockHtml = MOCK_NEWSLETTER.html.replace(/\{\{calendarLink\}\}/g, cal);

  let html;
  let subject;
  try {
    subject = await generateText({
      system: `Write concise, compelling email subject lines (under 65 chars) for Stackd Studios weekly newsletter. Return ONLY the subject line text.`,
      prompt: `Write a subject line for this week's newsletter. Top video: "${topVideoTitle}". Date: ${today}.`,
      maxTokens: 100,
      mock: MOCK_NEWSLETTER.subject,
    });

    html = await generateText({
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens: 1200,
      mock: mockHtml,
    });
  } catch (err) {
    log.warn(`weeklyNewsletter: Claude failed (${err.message}) — using mock`);
    subject = MOCK_NEWSLETTER.subject;
    html = mockHtml;
  }

  subject = (subject || MOCK_NEWSLETTER.subject).trim();
  html = html || mockHtml;

  // ── Save draft ───────────────────────────────────────────
  const draftAbs = join(logsDir(), `newsletter-${today}.json`);
  const draft = {
    generatedAt: new Date().toISOString(),
    subject,
    html,
    topVideo: topVideo ? { title: topVideoTitle, url: topVideoUrl } : null,
  };

  try {
    await writeFile(draftAbs, JSON.stringify(draft, null, 2), 'utf8');
    const draftPath = rel(draftAbs);
    log.ok(`weeklyNewsletter: draft saved — approve & send from the dashboard → ${draftPath}`);
    return { subject, html, draftPath };
  } catch (err) {
    log.error(`weeklyNewsletter: could not save draft (${err.message})`);
    return { subject, html, draftPath: null };
  }
}

// ── sendNewsletter (approved-send path, called by dashboard) ─
export async function sendNewsletter({ subject, html }) {
  log.stage('weeklyNewsletter', 'sending approved newsletter');

  let subscribers;
  try {
    subscribers = await dbSelect('emails', { match: { status: 'active' } });
  } catch (err) {
    log.error(`weeklyNewsletter: could not fetch subscribers: ${err.message}`);
    return { sent: 0 };
  }

  if (!subscribers || subscribers.length === 0) {
    log.info('weeklyNewsletter: no active subscribers to send to');
    return { sent: 0 };
  }

  let sent = 0;
  for (const sub of subscribers) {
    try {
      const result = await sendEmail({
        to: sub.subscriber_email,
        subject,
        html,
      });
      if (result.id) {
        sent++;
        log.info(`weeklyNewsletter: sent to ${sub.subscriber_email} (id: ${result.id})`);
      } else {
        log.warn(`weeklyNewsletter: send may have failed for ${sub.subscriber_email}`);
      }
    } catch (err) {
      log.error(`weeklyNewsletter: error sending to ${sub.subscriber_email}: ${err.message}`);
    }
  }

  log.ok(`weeklyNewsletter: newsletter sent to ${sent} subscriber(s)`);
  return { sent };
}

export default generateWeeklyNewsletter;

// ── main guard ───────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('weeklyNewsletter.js')) {
  const result = await generateWeeklyNewsletter();
  console.log(`Draft saved: ${result.draftPath}`);
  console.log(`Subject: ${result.subject}`);
}
