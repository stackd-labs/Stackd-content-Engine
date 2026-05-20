// ============================================================
// ElevenLabs text-to-speech. Returns the saved audio path plus
// duration and word-level timestamps (for caption syncing).
// Demo mode (no key): writes a tiny placeholder file and
// synthesizes evenly-spaced word timestamps from the text.
// ============================================================
import { writeFile } from 'node:fs/promises';
import { env, has, DEMO } from './env.js';
import { log } from './logger.js';

export const isElevenLabsConfigured = has('ELEVENLABS_API_KEY') && !DEMO;

const WPM = 155; // speaking rate used for duration estimates

/**
 * @returns {Promise<{audioFilePath:string, durationSeconds:number, wordTimestamps:{word:string,start:number,end:number}[]}>}
 */
export async function textToSpeech({ text, voiceId, destPath, voiceSettings = {} }) {
  const estDuration = estimateDuration(text);

  if (!isElevenLabsConfigured) {
    log.mock('ElevenLabs TTS');
    await writeFile(destPath, Buffer.from('')); // placeholder so a file exists at the path
    return { audioFilePath: destPath, durationSeconds: estDuration, wordTimestamps: estimateWordTimestamps(text, estDuration) };
  }

  // Real call: the with-timestamps endpoint returns base64 audio + char alignment.
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: {
        stability: voiceSettings.stability ?? 0.45,
        similarity_boost: voiceSettings.similarityBoost ?? 0.75,
        style: voiceSettings.style ?? 0.3,
      },
    }),
  });
  if (!res.ok) {
    log.warn(`ElevenLabs ${res.status} — falling back to placeholder audio.`);
    await writeFile(destPath, Buffer.from(''));
    return { audioFilePath: destPath, durationSeconds: estDuration, wordTimestamps: estimateWordTimestamps(text, estDuration) };
  }
  const data = await res.json();
  await writeFile(destPath, Buffer.from(data.audio_base64, 'base64'));
  const align = data.alignment || data.normalized_alignment;
  const wordTimestamps = align ? wordsFromCharAlignment(text, align) : estimateWordTimestamps(text, estDuration);
  const durationSeconds = wordTimestamps.length ? wordTimestamps.at(-1).end : estDuration;
  return { audioFilePath: destPath, durationSeconds, wordTimestamps };
}

export function estimateDuration(text) {
  const words = (text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.round((words / WPM) * 60));
}

/** Evenly distribute words across the duration (demo / fallback). */
export function estimateWordTimestamps(text, durationSeconds) {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const per = durationSeconds / words.length;
  return words.map((word, i) => ({
    word,
    start: +(i * per).toFixed(3),
    end: +((i + 1) * per).toFixed(3),
  }));
}

/** Convert ElevenLabs character alignment to word-level timestamps. */
function wordsFromCharAlignment(text, align) {
  const chars = align.characters || [];
  const starts = align.character_start_times_seconds || [];
  const ends = align.character_end_times_seconds || [];
  const words = [];
  let cur = '', wStart = null;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (/\s/.test(ch)) {
      if (cur) { words.push({ word: cur, start: wStart, end: ends[i - 1] ?? wStart }); cur = ''; wStart = null; }
    } else {
      if (wStart === null) wStart = starts[i] ?? 0;
      cur += ch;
    }
  }
  if (cur) words.push({ word: cur, start: wStart ?? 0, end: ends.at(-1) ?? 0 });
  return words;
}
