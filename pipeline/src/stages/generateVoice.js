// ============================================================
// Stage 3 — generateVoice
// Converts the script to audio via ElevenLabs (or demo fallback).
// Returns { audioFilePath, durationSeconds, wordTimestamps }.
// ============================================================
import { pathToFileURL } from 'node:url';
import { textToSpeech } from '../lib/elevenlabs.js';
import { audioPath, rel } from '../lib/paths.js';
import { getSettings } from '../lib/settings.js';
import { updateVideo, appendVideoLog } from '../lib/runState.js';
import { log } from '../lib/logger.js';

export async function generateVoice({ videoId, script, voiceId }) {
  log.stage('generateVoice', videoId);

  const settings = getSettings();
  const resolvedVoiceId = voiceId || settings.voiceId;
  const voiceSettings = settings.voiceSettings;

  const dest = audioPath(videoId);

  let audioFilePath, durationSeconds, wordTimestamps;
  try {
    ({ audioFilePath, durationSeconds, wordTimestamps } = await textToSpeech({
      text: script,
      voiceId: resolvedVoiceId,
      destPath: dest,
      voiceSettings,
    }));
  } catch (err) {
    log.warn(`generateVoice: textToSpeech threw — ${err.message}`);
    throw err;
  }

  await updateVideo(videoId, {
    audio_file_path: rel(audioFilePath),
    duration_seconds: Math.round(durationSeconds),
  });

  await appendVideoLog(
    videoId,
    'voiceover',
    'done',
    `${wordTimestamps.length} words, ${Math.round(durationSeconds)}s`,
  );

  log.ok(`generateVoice done — ${wordTimestamps.length} words, ${Math.round(durationSeconds)}s`);
  return { audioFilePath, durationSeconds, wordTimestamps };
}

export default generateVoice;

// ---- main guard -------------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sample = {
    videoId: 'demo-voice-001',
    script: 'AI is changing the game for small business owners. Here is how you can use it today to save ten hours a week.',
    voiceId: null, // use settings default
  };
  log.info('Running generateVoice demo…');
  generateVoice(sample)
    .then(({ durationSeconds, wordTimestamps }) => {
      log.ok(`Demo complete — ${Math.round(durationSeconds)}s, ${wordTimestamps.length} word timestamps`);
      process.exit(0);
    })
    .catch((err) => {
      log.error(err.message);
      process.exit(1);
    });
}
