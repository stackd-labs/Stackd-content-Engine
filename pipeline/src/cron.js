// ============================================================
// Cron Scheduler — cron.js
// Keeps long-running tasks firing on schedule.
//
// Schedule:
//   Hourly        (0 * * * *)   — comment monitor
//   Daily 9 am    (0 9 * * *)   — email sequence drip + analytics pull
//   Sundays 8 am  (0 8 * * 0)   — weekly newsletter generation
//
// Start: node src/cron.js
// ============================================================
import cron from 'node-cron';

import { log } from './lib/logger.js';
import { runCommentMonitor } from './engagement/commentMonitor.js';
import { runAnalyticsPull } from './analytics/pullAnalytics.js';
import { runEmailSequence } from './email/emailSequence.js';
import { generateWeeklyNewsletter } from './email/weeklyNewsletter.js';

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

/**
 * Wrap a scheduled task so errors are logged but never crash the process.
 * @param {string} label  Human-readable task name for log output.
 * @param {() => Promise<*>} fn  Async function to execute.
 */
async function run(label, fn) {
  log.stage('cron', `running → ${label}`);
  try {
    const result = await fn();
    log.ok(`cron: ${label} completed`);
    return result;
  } catch (err) {
    log.error(`cron: ${label} failed — ${err.message}`);
  }
}

// ──────────────────────────────────────────────────────────────
// Schedules
// ──────────────────────────────────────────────────────────────

// Every hour — process new platform comments & draft replies.
cron.schedule('0 * * * *', () => {
  run('commentMonitor', () => runCommentMonitor());
}, { timezone: 'America/New_York' });

// Every day at 9 am — send drip emails to active subscribers AND pull analytics.
cron.schedule('0 9 * * *', () => {
  run('emailSequence', () => runEmailSequence());
  run('analyticsPull', () => runAnalyticsPull());
}, { timezone: 'America/New_York' });

// Every Sunday at 8 am — generate and send the weekly newsletter.
cron.schedule('0 8 * * 0', () => {
  run('weeklyNewsletter', () => generateWeeklyNewsletter());
}, { timezone: 'America/New_York' });

// ──────────────────────────────────────────────────────────────
// Startup log
// ──────────────────────────────────────────────────────────────
log.ok('Cron scheduler started (timezone: America/New_York)');
log.info('  0 * * * *  — commentMonitor (hourly)');
log.info('  0 9 * * *  — emailSequence + analyticsPull (daily 9 am)');
log.info('  0 8 * * 0  — weeklyNewsletter (Sundays 8 am)');
log.info('Process will stay alive. Ctrl+C to stop.');
