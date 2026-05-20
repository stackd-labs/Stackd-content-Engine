// ============================================================
// Stage 11 — Lead Capture
// Validates an email, upserts a subscriber record, and fires
// the welcome / lead-magnet email (sequence step 0) immediately.
// ============================================================
import { dbInsert, dbSelect, dbUpdate, cryptoId } from '../lib/supabase.js';
import { log } from '../lib/logger.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function captureLead({ email, firstName, sourceVideoId, sourcePlatform }) {
  log.stage('leadCapture', email);

  // --- Validate ---
  if (!email || !EMAIL_RE.test(email)) {
    log.warn(`leadCapture: invalid email "${email}"`);
    return { ok: false, error: 'invalid email' };
  }

  // --- Idempotent upsert ---
  let subscriber;
  try {
    const existing = await dbSelect('emails', { match: { subscriber_email: email } });
    if (existing && existing.length > 0) {
      log.info(`leadCapture: already subscribed — ${email}`);
      return { ok: true, subscriber: existing[0] };
    }

    subscriber = await dbInsert('emails', {
      id: cryptoId(),
      subscriber_email: email,
      first_name: firstName || null,
      source_video_id: sourceVideoId || null,
      source_platform: sourcePlatform || null,
      sequence_step: 0,
      status: 'active',
      subscribed_at: new Date().toISOString(),
    });

    if (!subscriber) {
      log.error(`leadCapture: dbInsert returned null for ${email}`);
      return { ok: false, error: 'db insert failed' };
    }
  } catch (err) {
    log.error(`leadCapture db error: ${err.message}`);
    return { ok: false, error: err.message };
  }

  // --- Fire welcome email (step 0) ---
  // Lazy import avoids any potential circular-reference issues at module load time.
  try {
    const { sendSequenceStep } = await import('./emailSequence.js');
    await sendSequenceStep({ subscriber, step: 0 });
    await dbUpdate('emails', subscriber.id, {
      last_email_sent: new Date().toISOString(),
      sequence_step: 1,
    });
    log.ok(`leadCapture: welcome email sent to ${email}`);
  } catch (err) {
    log.warn(`leadCapture: welcome email failed (${err.message}) — subscriber saved anyway`);
  }

  return { ok: true, subscriber };
}

export default captureLead;

// ── main guard ──────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('leadCapture.js')) {
  const result = await captureLead({
    email: 'demo@example.com',
    firstName: 'Demo',
    sourceVideoId: 'demo-video-001',
    sourcePlatform: 'youtube',
  });
  console.log(result);
}
