// Approval / alert notifications via Slack webhook or Resend email.
import { env, has, DASHBOARD_URL } from './env.js';
import { getSettings } from './settings.js';
import { sendEmail } from './resend.js';
import { fetchJSON } from './http.js';
import { log } from './logger.js';

/** Generic alert (used for pipeline failures). */
export async function notify(title, lines = []) {
  const text = `*${title}*\n${lines.join('\n')}`;
  const settings = getSettings();
  const slack = env.SLACK_WEBHOOK_URL || settings.notify.destination;

  if (settings.notify.channel === 'slack' && slack && /^https?:\/\//.test(slack)) {
    try { await fetchJSON(slack, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }); return; }
    catch (err) { log.warn(`Slack notify failed: ${err.message}`); }
  }
  if (settings.notify.channel === 'email' && settings.notify.destination) {
    await sendEmail({ to: settings.notify.destination, subject: title, html: `<pre>${lines.join('<br>')}</pre>` });
    return;
  }
  if (!has('SLACK_WEBHOOK_URL') && !settings.notify.destination) log.mock(`Notification: ${title}`);
  log.info(`[notify] ${title} — ${lines.join(' | ')}`);
}

/** Approval request when a video is flagged for review. */
export async function notifyApproval({ videoId, topic, score, reasoning }) {
  const link = `${DASHBOARD_URL}/videos`;
  await notify('🚩 Video flagged for review', [
    `Topic: ${topic}`,
    `Virality score: ${score}/10 (threshold not met or auto-post off)`,
    `Reasoning: ${reasoning}`,
    `Review & approve: ${link} (video ${videoId})`,
  ]);
}
