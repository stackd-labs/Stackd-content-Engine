// ============================================================
// Pipeline Orchestrator — index.js
// Drives a topic through all 10 stages end-to-end, writing
// every result to Supabase and notifying on failure.
//
// Usage (CLI):
//   node src/index.js "Your topic" [--format short|medium|long] [--pillar "AI Automation"]
// ============================================================
import { pathToFileURL } from 'node:url';

import { createRun, updateRunStage, completeRun, failRun, setVideoStatus } from './lib/runState.js';
import { getSettings } from './lib/settings.js';
import { notify } from './lib/notify.js';
import { log } from './lib/logger.js';

import { generateScript } from './stages/generateScript.js';
import { generateVoice } from './stages/generateVoice.js';
import { gatherMedia } from './stages/gatherMedia.js';
import { generateThumbnail } from './stages/generateThumbnail.js';
import { renderVideo } from './stages/renderVideo.js';
import { viralityCheck } from './stages/viralityCheck.js';
import { postToPlatforms } from './platforms/index.js';
import { repurpose } from './stages/repurpose.js';
import { runCommentMonitor } from './engagement/commentMonitor.js';

// ──────────────────────────────────────────────────────────────
// Main orchestrator
// ──────────────────────────────────────────────────────────────
export async function runPipeline({ topic, format = 'short', contentPillar, platforms, autoPost }) {
  let runId;

  try {
    // ── 1. Create run record ──────────────────────────────────
    runId = await createRun(topic);

    // ── 2. Script ─────────────────────────────────────────────
    await updateRunStage(runId, 'script', 'running');
    const strategy = await generateScript({ topic, format, contentPillar });
    await updateRunStage(runId, 'script', 'done', strategy.title);
    const { videoId } = strategy;

    // ── 3. Voiceover ──────────────────────────────────────────
    await updateRunStage(runId, 'voiceover', 'running');
    const voice = await generateVoice({ videoId, script: strategy.script });
    await updateRunStage(runId, 'voiceover', 'done');

    // ── 4. Media ──────────────────────────────────────────────
    await updateRunStage(runId, 'media', 'running');
    const mediaRes = await gatherMedia({ videoId, shotList: strategy.shotList });
    await updateRunStage(runId, 'media', 'done');

    // ── 5. Thumbnail ──────────────────────────────────────────
    await updateRunStage(runId, 'thumbnail', 'running');
    const thumbs = await generateThumbnail({
      videoId,
      title: strategy.title,
      topic,
      hookText: strategy.recommendedHook,
    });
    await updateRunStage(runId, 'thumbnail', 'done');

    // ── 6. Render ─────────────────────────────────────────────
    await updateRunStage(runId, 'render', 'running');
    await setVideoStatus(videoId, 'rendering');
    const files = await renderVideo({
      videoId,
      strategy,
      audioFilePath: voice.audioFilePath,
      wordTimestamps: voice.wordTimestamps,
      media: mediaRes.media,
      musicTrack: mediaRes.musicTrack,
    });
    await updateRunStage(runId, 'render', 'done');

    // ── 7. Virality check ─────────────────────────────────────
    await updateRunStage(runId, 'virality_check', 'running');
    const vc = await viralityCheck({
      videoId,
      viralityScore: strategy.viralityScore,
      viralityReasoning: strategy.viralityReasoning,
      topic,
      autoPost,
    });
    await updateRunStage(runId, 'virality_check', 'done');

    // If not approved, pause here — dashboard approval resumes posting later.
    if (!vc.approved) {
      await updateRunStage(runId, 'post', 'done', 'paused for approval');
      await completeRun(runId, '(paused for approval)');
      return { runId, videoId, status: 'flagged', reason: vc.reason };
    }

    // ── 8. Post to platforms ──────────────────────────────────
    await updateRunStage(runId, 'post', 'running');
    await setVideoStatus(videoId, 'posting');
    const enabled = platforms || getSettings().enabledPlatforms;
    const results = await postToPlatforms({
      videoId,
      strategy,
      files,
      thumbnails: thumbs,
      platforms: enabled,
    });
    const okCount = results.filter((r) => r.ok).length;
    await updateRunStage(runId, 'post', 'done', `${okCount}/${results.length}`);

    // ── 9. Repurpose ──────────────────────────────────────────
    await updateRunStage(runId, 'repurpose', 'running');
    const repurposed = await repurpose({
      videoId,
      strategy,
      audioFilePath: voice.audioFilePath,
      files,
    });
    await updateRunStage(runId, 'repurpose', 'done');

    // ── 10. Engagement — initial comment monitoring ───────────
    await updateRunStage(runId, 'engagement', 'running');
    try {
      await runCommentMonitor();
    } catch (engErr) {
      log.warn(`Engagement monitor error (non-fatal): ${engErr.message}`);
    }
    await updateRunStage(runId, 'engagement', 'done');

    // ── 11. Complete ──────────────────────────────────────────
    await completeRun(runId);

    return { runId, videoId, status: 'completed', results, repurposed };
  } catch (err) {
    if (runId) {
      await failRun(runId, err.message).catch(() => {});
    }
    await notify('❌ Pipeline failed', [`Topic: ${topic}`, err.message]);
    return { status: 'failed', error: err.message };
  }
}

export default runPipeline;

// ──────────────────────────────────────────────────────────────
// CLI main guard
// node src/index.js "topic" [--format short|medium|long] [--pillar "X"]
// ──────────────────────────────────────────────────────────────
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0].startsWith('--')) {
    console.error('Usage: node src/index.js "topic" [--format short|medium|long] [--pillar "X"] [--platforms youtube,tiktok] [--autopost]');
    process.exit(1);
  }

  const topic = args[0];
  let format = 'short';
  let contentPillar;
  let platforms;
  let autoPost = false;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--format' && args[i + 1]) {
      format = args[++i];
    } else if ((args[i] === '--pillar' || args[i] === '--contentPillar') && args[i + 1]) {
      contentPillar = args[++i];
    } else if (args[i] === '--platforms' && args[i + 1]) {
      platforms = args[++i].split(',').map((p) => p.trim());
    } else if (args[i] === '--autopost' || args[i] === '--auto-post') {
      autoPost = true;
    }
  }

  log.info(`Starting pipeline: topic="${topic}" format=${format} pillar=${contentPillar ?? '(default)'}`);

  runPipeline({ topic, format, contentPillar, platforms, autoPost })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.status === 'failed' ? 1 : 0);
    })
    .catch((err) => {
      log.error('Unhandled error:', err.message);
      process.exit(1);
    });
}
