// ============================================================
// Stage 11 — Email Sequence (drip campaign)
// 4-step sequence:  0 Welcome (immediate, delivers lead magnet)
//                   1 Value email  (day 2)
//                   2 Case study   (day 4)
//                   3 Soft pitch   (day 7)
// ============================================================
import { generateText } from '../lib/ai.js';
import { sendEmail } from '../lib/resend.js';
import { dbSelect, dbUpdate } from '../lib/supabase.js';
import { getSettings } from '../lib/settings.js';
import { log } from '../lib/logger.js';

// ── Sequence definition ──────────────────────────────────────
const SEQUENCE = [
  {
    step: 0,
    dayOffset: 0,
    kind: 'welcome',
    label: 'Welcome + Lead Magnet',
  },
  {
    step: 1,
    dayOffset: 2,
    kind: 'value',
    label: 'Value Email',
  },
  {
    step: 2,
    dayOffset: 4,
    kind: 'case_study',
    label: 'Case Study',
  },
  {
    step: 3,
    dayOffset: 7,
    kind: 'soft_pitch',
    label: 'Soft Pitch',
  },
];

// ── Mock bodies (realistic fallbacks) ───────────────────────
const MOCK_BODIES = {
  welcome: {
    subject: 'Your free resource is here + a quick welcome from Stackd',
    html: `<p>Hey there! Welcome to Stackd Studios.</p>
<p>Your free resource is ready — grab it below and start building smarter today.</p>
<p><a href="{{leadMagnetUrl}}">Download your free resource →</a></p>
<p>Over the next week we'll share a few short emails packed with tips to help you grow faster with AI. Reply any time — we read every message.</p>
<p>— Chanel & the Stackd team</p>`,
  },
  value: {
    subject: '3 things most founders miss when starting with AI',
    html: `<p>Hey {{firstName}},</p>
<p>We've worked with dozens of founders on their AI stack, and the same three mistakes keep coming up...</p>
<p>[1] Starting with tools instead of strategy. [2] Skipping the system and jumping straight to content. [3] Treating AI as a cost center instead of a growth engine.</p>
<p>Tomorrow we'll share a real example of what fixing all three looks like in practice.</p>
<p>— Stackd Studios</p>`,
  },
  case_study: {
    subject: 'How one founder went from 0 → 50 k views in 30 days (breakdown inside)',
    html: `<p>Hey {{firstName}},</p>
<p>This is a quick breakdown of how we helped a client go from posting manually once a week to running a fully automated content engine that generated 50 k+ views in the first month.</p>
<p>The short version: we identified their top-performing hook patterns, batched content production with AI, and scheduled 30 days of posts in one afternoon.</p>
<p>Want the full playbook? Hit reply and we'll send it over.</p>
<p>— Stackd Studios</p>`,
  },
  soft_pitch: {
    subject: 'Ready to build your content engine? (no pressure)',
    html: `<p>Hey {{firstName}},</p>
<p>You've been on our list for a week now — we hope the emails have been useful.</p>
<p>If you're ready to stop posting manually and start running a real AI-powered content system, we'd love to chat.</p>
<p><a href="{{calendarLink}}">Book a free 20-minute intro call →</a></p>
<p>No pitch, no pressure — just a conversation about where you're at and where you want to go.</p>
<p>— Chanel, Stackd Studios</p>`,
  },
};

// ── Helpers ──────────────────────────────────────────────────

function daysSince(isoString) {
  const ms = Date.now() - new Date(isoString).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function interpolate(html, vars) {
  return html
    .replace(/\{\{firstName\}\}/g, vars.firstName || 'there')
    .replace(/\{\{leadMagnetUrl\}\}/g, vars.leadMagnetUrl || '#')
    .replace(/\{\{calendarLink\}\}/g, vars.calendarLink || '#');
}

// ── sendSequenceStep ─────────────────────────────────────────
export async function sendSequenceStep({ subscriber, step }) {
  if (subscriber.status !== 'active') {
    log.info(`emailSequence: skipping step ${step} for unsubscribed ${subscriber.subscriber_email}`);
    return { skipped: true };
  }

  const settings = getSettings();
  const { brand = {}, leadMagnet = {}, calendarLink } = settings;

  const seqItem = SEQUENCE.find((s) => s.step === step);
  if (!seqItem) {
    log.warn(`emailSequence: unknown step ${step}`);
    return { skipped: true };
  }

  const firstName = subscriber.first_name || 'there';
  const videoRef = subscriber.source_video_id
    ? ` (inspired by the content that brought you here)`
    : '';
  const persona = brand.voicePersona || 'friendly, direct, expert';
  const brandCta = brand.cta || 'Book a free intro call';

  // ── Build prompt per step ──
  let systemPrompt = `You are writing marketing emails for Stackd Studios, an AI-powered build lab. Voice: ${persona}. Write HTML email bodies — short paragraphs, no headers, genuine tone. Return ONLY the HTML.`;

  let userPrompt = '';
  const mockData = MOCK_BODIES[seqItem.kind] || MOCK_BODIES.value;

  if (step === 0) {
    const lmName = leadMagnet.name || 'Free AI Toolkit';
    const lmUrl = leadMagnet.url || 'https://stackdstudiosai.com/free/toolkit';
    userPrompt = `Write a welcome email for a new subscriber named "${firstName}"${videoRef}.
Lead magnet: "${lmName}" — URL: ${lmUrl}
Include a clear download CTA linking to that URL. End warmly. 3–4 short paragraphs.`;
  } else if (step === 1) {
    userPrompt = `Write a value-packed email for "${firstName}" who subscribed 2 days ago${videoRef}.
Share 3 practical AI content tips for founders. No sales, pure value. 3–4 short paragraphs.`;
  } else if (step === 2) {
    userPrompt = `Write a case-study email for "${firstName}" who subscribed 4 days ago${videoRef}.
Tell a brief story about a founder who used Stackd's content engine to grow from 0 to notable results in 30 days. Be specific but keep it under 200 words. End with a soft invitation to reply.`;
  } else if (step === 3) {
    const cal = calendarLink || 'https://cal.com/stackdstudios/intro';
    userPrompt = `Write a soft-pitch email for "${firstName}" who has been subscribed 7 days${videoRef}.
CTA: "${brandCta}" — link: ${cal}. Acknowledge they've received a few emails, keep it low pressure, one clear CTA button/link. Under 150 words.`;
  }

  let html;
  let subject;
  try {
    subject = await generateText({
      system: `You write concise, compelling email subject lines (under 60 chars) for Stackd Studios. Return ONLY the subject line text.`,
      prompt: `Write a subject line for a "${seqItem.label}" email to ${firstName}. Step context: ${seqItem.kind}.`,
      maxTokens: 100,
      mock: mockData.subject,
    });

    html = await generateText({
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens: 600,
      mock: interpolate(mockData.html, {
        firstName,
        leadMagnetUrl: leadMagnet.url || '#',
        calendarLink: calendarLink || '#',
      }),
    });
  } catch (err) {
    log.warn(`emailSequence: Claude failed for step ${step} (${err.message}) — using mock`);
    subject = mockData.subject;
    html = interpolate(mockData.html, {
      firstName,
      leadMagnetUrl: leadMagnet.url || '#',
      calendarLink: calendarLink || '#',
    });
  }

  // Interpolate any remaining template vars in AI-generated output
  html = interpolate(html, {
    firstName,
    leadMagnetUrl: leadMagnet.url || '#',
    calendarLink: calendarLink || '#',
  });

  let emailResult;
  try {
    emailResult = await sendEmail({
      to: subscriber.subscriber_email,
      subject: subject.trim(),
      html,
    });
    log.ok(`emailSequence: step ${step} sent to ${subscriber.subscriber_email} (id: ${emailResult.id})`);
  } catch (err) {
    log.error(`emailSequence: sendEmail failed for ${subscriber.subscriber_email}: ${err.message}`);
    return { ok: false, error: err.message };
  }

  // Update DB
  try {
    await dbUpdate('emails', subscriber.id, {
      last_email_sent: new Date().toISOString(),
      sequence_step: step + 1,
    });
  } catch (err) {
    log.warn(`emailSequence: dbUpdate failed for ${subscriber.subscriber_email}: ${err.message}`);
  }

  return { ok: true, emailId: emailResult.id, step, email: subscriber.subscriber_email };
}

// ── runEmailSequence (cron-able daily) ───────────────────────
export async function runEmailSequence() {
  log.stage('emailSequence', 'daily run');

  let subscribers;
  try {
    subscribers = await dbSelect('emails', { match: { status: 'active' } });
  } catch (err) {
    log.error(`emailSequence: could not fetch subscribers: ${err.message}`);
    return { sent: 0 };
  }

  if (!subscribers || subscribers.length === 0) {
    log.info('emailSequence: no active subscribers');
    return { sent: 0 };
  }

  let sent = 0;

  for (const sub of subscribers) {
    try {
      const currentStep = sub.sequence_step ?? 0;
      if (currentStep > 3) continue; // sequence complete

      const seqItem = SEQUENCE.find((s) => s.step === currentStep);
      if (!seqItem) continue;

      const days = daysSince(sub.subscribed_at);
      if (days < seqItem.dayOffset) continue; // not time yet

      await sendSequenceStep({ subscriber: sub, step: currentStep });
      sent++;
    } catch (err) {
      log.error(`emailSequence: error processing ${sub.subscriber_email}: ${err.message}`);
    }
  }

  log.ok(`emailSequence: daily run complete — ${sent} email(s) sent`);
  return { sent };
}

export default runEmailSequence;

// ── main guard ───────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('emailSequence.js')) {
  const result = await runEmailSequence();
  console.log(result);
}
