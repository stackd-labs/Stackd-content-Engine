// ============================================================
// Stage 13 — generateCalendar.js
// Asks Claude to plan `days` (default 30) content calendar entries,
// then inserts each into the `content_calendar` Supabase table.
// Usage: node src/calendar/generateCalendar.js [days]
// ============================================================
import { generateJSON } from '../lib/ai.js';
import { dbInsert } from '../lib/supabase.js';
import { getSettings } from '../lib/settings.js';
import { log } from '../lib/logger.js';
import { FORMATS, CONTENT_PILLARS } from '../lib/constants.js';

// ---------------------------------------------------------------------------
// Compute a YYYY-MM-DD date string for today + dayOffset.
// ---------------------------------------------------------------------------
function scheduledDate(dayOffset) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Generate a programmatic mock that yields exactly `days` entries.
// Used when ANTHROPIC_API_KEY is absent — makes demo mode fully functional.
// ---------------------------------------------------------------------------
function buildMockPlan(days, pillars) {
  const topicsByPillar = {
    'AI Automation': [
      'How to Automate Your Client Intake With Claude',
      'Build a Lead-Qualifying Bot in 30 Minutes',
      'Automate Follow-Ups With Zero Code',
      'AI Workflows That Save 10 Hours a Week',
      'Connect Zapier + Claude for a Full Sales System',
    ],
    'Build in Public': [
      'Week 1: We Started Building a SaaS Live',
      'What Broke This Week (and How We Fixed It)',
      'Behind the Numbers: Our First 30 Days',
      'Shipping in Public — Mistakes Included',
      'Live Build Update: Feature Drop + User Feedback',
    ],
    'Client Wins': [
      'How a Plumber Got 40 Leads in 7 Days',
      'From $0 to $8k MRR: A Client Story',
      'This One System Doubled a Consultant\'s Revenue',
      'How We Cut a Client\'s Admin Time by 80 %',
      'Real Results: Before & After Our Automation Audit',
    ],
    'Founder Mindset': [
      'Why I Stopped Hiring and Started Automating',
      'The Only KPIs That Matter for Solo Founders',
      'Saying No Is a Business Strategy',
      'What I Wish I Knew Before Year 1',
      'Burn Less, Build More: The Async Founder',
    ],
    'Tools & Tutorials': [
      'Top 5 AI Tools We Use Every Single Day',
      'How to Use Notion + AI as a Second Brain',
      'Make vs Zapier: Which One for Your Stack?',
      'Tutorial: Build a Chatbot in Under an Hour',
      'The $0 Tech Stack for a 6-Figure Agency',
    ],
    'Behind the Build': [
      'How We Design Our SaaS UX in a Weekend',
      'Inside Our Dev Environment: Tools + Setup',
      'Database Design for Non-Technical Founders',
      'From Figma to Deployed in 72 Hours',
      'How We QA Without a QA Team',
    ],
  };

  const formatCycle = ['short', 'short', 'medium', 'long', 'short', 'medium', 'short'];
  const seriesGroups = ['AI Foundations Series', null, 'Client Stories', null, 'Build Log', null, 'Tool Deep-Dives'];

  const plan = [];
  for (let i = 0; i < days; i++) {
    const pillar = pillars[i % pillars.length];
    const pillarTopics = topicsByPillar[pillar] || topicsByPillar['AI Automation'];
    const topic = pillarTopics[Math.floor(i / pillars.length) % pillarTopics.length];
    const format = formatCycle[i % formatCycle.length];
    const seriesGroup = seriesGroups[i % seriesGroups.length];

    let notes = null;
    if (format === 'long') {
      notes = 'Depth piece — tease this topic in the preceding short(s) and link in description.';
    } else if (seriesGroup) {
      notes = `Part of "${seriesGroup}" playlist — reference other videos in the series.`;
    }

    plan.push({
      dayOffset: i,
      topic,
      content_pillar: pillar,
      format,
      seriesGroup: seriesGroup ?? undefined,
      notes: notes ?? undefined,
    });
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export async function generateCalendar({ days = 30, contentPillars } = {}) {
  log.stage('calendar', `Stage 13 — generating ${days}-day content calendar`);

  const settings = getSettings();
  const pillars = contentPillars || settings.contentPillars || CONTENT_PILLARS;
  const hookStyles = settings.hookStyles || [];

  const mock = buildMockPlan(days, pillars);

  // Ask Claude to generate a full content plan.
  const plan = await generateJSON({
    system:
      'You are the content strategist for STACKD STUDIOS, an AI-powered content-engine brand ' +
      'targeting founders, agency owners, and builders. ' +
      'Return a JSON array of exactly ' + days + ' objects. ' +
      'Each object must have these keys: ' +
      'dayOffset (integer 0–' + (days - 1) + '), ' +
      'topic (string — specific, clickable title), ' +
      'content_pillar (one of the provided pillars), ' +
      'format ("short"|"medium"|"long"), ' +
      'seriesGroup (optional string — playlist or series name if applicable), ' +
      'notes (optional string — how this ladders to other videos, hooks to pay off, or series context). ' +
      'Rules: balance pillars evenly; mix formats (roughly 50 % short, 30 % medium, 20 % long); ' +
      'ladder topics so earlier shorts tease later long-form deep-dives; ' +
      'group related videos into series/playlists via seriesGroup; ' +
      'keep topics specific and actionable, not generic.',
    prompt:
      `Content pillars (balance across all): ${pillars.join(', ')}.\n` +
      `Hook styles for reference: ${hookStyles.join(', ')}.\n` +
      `Days to plan: ${days}.\n\n` +
      'Generate a complete ' + days + '-day content calendar that builds narrative momentum, ' +
      'mixes formats strategically, and groups related content into series for maximum playlist depth.',
    maxTokens: 4000,
    mock,
  });

  // Validate: Claude should return an array.
  const planArray = Array.isArray(plan) ? plan : mock;
  if (!Array.isArray(plan)) {
    log.warn('Claude returned non-array for calendar plan — falling back to mock.');
  }

  log.info(`Inserting ${planArray.length} calendar entries into content_calendar…`);

  const entries = [];
  for (const item of planArray) {
    try {
      const date = scheduledDate(Number(item.dayOffset) || 0);
      const record = await dbInsert('content_calendar', {
        scheduled_date: date,
        topic: item.topic,
        content_pillar: item.content_pillar,
        format: FORMATS.includes(item.format) ? item.format : 'short',
        status: 'planned',
        video_id: null,
        notes: item.notes ?? item.seriesGroup
          ? [item.notes, item.seriesGroup ? `Series: ${item.seriesGroup}` : null]
              .filter(Boolean)
              .join(' | ') || null
          : null,
      });
      if (record) entries.push(record);
    } catch (err) {
      log.error(`Failed to insert calendar entry (dayOffset ${item.dayOffset}): ${err.message}`);
    }
  }

  log.ok(`Calendar generated — ${entries.length} entries inserted.`);
  return entries;
}

export default generateCalendar;

// ---------------------------------------------------------------------------
// Main guard — node src/calendar/generateCalendar.js [days]
// ---------------------------------------------------------------------------
if (process.argv[1] && process.argv[1].endsWith('generateCalendar.js')) {
  const days = parseInt(process.argv[2], 10) || 30;
  generateCalendar({ days })
    .then((entries) => {
      log.ok(`Done. ${entries.length} calendar entries created.`);
      const preview = entries.slice(0, 5);
      console.log('\nFirst entries:');
      for (const e of preview) {
        console.log(`  ${e.scheduled_date}  [${e.format}]  ${e.content_pillar}  —  ${e.topic}`);
      }
    })
    .catch((err) => {
      log.error(`generateCalendar failed: ${err.message}`);
      process.exit(1);
    });
}
