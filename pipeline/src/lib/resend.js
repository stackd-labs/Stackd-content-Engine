// Resend email delivery. Logs and returns a mock id when no key.
import { env, has, DEMO } from './env.js';
import { fetchJSON } from './http.js';
import { log } from './logger.js';

export const isResendConfigured = has('RESEND_API_KEY') && !DEMO;

const FROM = env.RESEND_FROM || 'Stackd Studios <hello@stackdstudiosai.com>';

export async function sendEmail({ to, subject, html, text, from = FROM }) {
  if (!isResendConfigured) {
    log.mock(`Resend email -> ${to} ("${subject}")`);
    return { id: 'mock-email-' + Date.now(), mocked: true };
  }
  try {
    const data = await fetchJSON('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html, text }),
    });
    return { id: data.id, mocked: false };
  } catch (err) {
    log.error(`Resend send failed: ${err.message}`);
    return { id: null, error: err.message };
  }
}
