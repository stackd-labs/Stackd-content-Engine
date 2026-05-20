// ============================================================
// Stage 7 — viralityCheck
// Evaluates whether a video's virality score clears the configured
// threshold. If yes (and auto-post is on), the pipeline continues
// to posting automatically. Otherwise the video is flagged for
// manual review and an approval notification is dispatched.
// ============================================================
import { pathToFileURL } from 'node:url';
import { getSettings } from '../lib/settings.js';
import { setVideoStatus, appendVideoLog } from '../lib/runState.js';
import { notifyApproval } from '../lib/notify.js';
import { log } from '../lib/logger.js';

/**
 * @param {{ videoId: string, viralityScore: number, viralityReasoning: string, topic: string, autoPost?: boolean }} opts
 * @returns {Promise<{ approved: boolean, autoPosted: boolean, reason: string }>}
 */
export async function viralityCheck({ videoId, viralityScore, viralityReasoning, topic, autoPost }) {
  log.stage('virality_check', videoId);

  const settings = getSettings();
  const threshold = settings.viralityThreshold;

  // Global auto-post gate: true if ANY platform has autoPost enabled in settings.
  const autoPostAny = Object.values(settings.autoPost || {}).some(Boolean);

  // Caller may pass an explicit override; fall back to settings-derived gate.
  const shouldAutoPost = autoPost ?? autoPostAny;

  if (viralityScore >= threshold && shouldAutoPost) {
    log.ok(`virality_check passed — score ${viralityScore} >= threshold ${threshold}, auto-post on`);
    return { approved: true, autoPosted: true, reason: 'Above threshold + auto-post on' };
  }

  // Flag and notify.
  try { await setVideoStatus(videoId, 'flagged'); }
  catch (err) { log.warn(`viralityCheck setVideoStatus failed — ${err.message}`); }

  try {
    await notifyApproval({ videoId, topic, score: viralityScore, reasoning: viralityReasoning });
  } catch (err) {
    log.warn(`viralityCheck notifyApproval failed — ${err.message}`);
  }

  const flagMsg = `flagged (score ${viralityScore} vs threshold ${threshold})`;
  try { await appendVideoLog(videoId, 'virality_check', 'done', flagMsg); }
  catch (err) { log.warn(`viralityCheck appendVideoLog failed — ${err.message}`); }

  const reason = viralityScore < threshold
    ? 'Below virality threshold'
    : 'Auto-post off — sent to approval queue';

  log.warn(`virality_check — ${reason} [${flagMsg}]`);
  return { approved: false, autoPosted: false, reason };
}

export default viralityCheck;

// ---- main guard -------------------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  log.info('Running viralityCheck demo…');
  Promise.all([
    viralityCheck({ videoId: 'demo-001', viralityScore: 8, viralityReasoning: 'Strong hook', topic: 'AI automation', autoPost: true }),
    viralityCheck({ videoId: 'demo-002', viralityScore: 4, viralityReasoning: 'Weak title', topic: 'AI tools', autoPost: false }),
  ]).then(([a, b]) => {
    log.info(`demo-001: ${JSON.stringify(a)}`);
    log.info(`demo-002: ${JSON.stringify(b)}`);
    process.exit(0);
  }).catch((err) => { log.error(err.message); process.exit(1); });
}
