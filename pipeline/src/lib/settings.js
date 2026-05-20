// Loads pipeline/config/settings.json (merged over constant defaults).
// Env can override a couple of hot values (voice id, threshold).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { env } from './env.js';
import {
  CONTENT_PILLARS, HOOK_STYLES, TRIGGER_WORDS, PLATFORMS, DEFAULT_VIRALITY_THRESHOLD,
} from './constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = join(__dirname, '..', '..', 'config', 'settings.json');

let cached = null;

export function getSettings() {
  if (cached) return cached;

  let file = {};
  try { file = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8')); }
  catch { /* fall back to defaults */ }

  cached = {
    voiceId: env.ELEVENLABS_VOICE_ID || file.voiceId || '21m00Tcm4TlvDq8ikWAM',
    voiceSettings: file.voiceSettings || { stability: 0.45, similarityBoost: 0.75, style: 0.3 },
    viralityThreshold: Number(env.VIRALITY_THRESHOLD || file.viralityThreshold || DEFAULT_VIRALITY_THRESHOLD),
    enabledPlatforms: file.enabledPlatforms || PLATFORMS,
    autoPost: file.autoPost || Object.fromEntries(PLATFORMS.map((p) => [p, false])),
    autoRespond: file.autoRespond ?? true,
    contentPillars: file.contentPillars || CONTENT_PILLARS,
    hookStyles: file.hookStyles || HOOK_STYLES,
    triggerWords: file.triggerWords || TRIGGER_WORDS,
    musicTracks: file.musicTracks || [],
    brand: file.brand || {},
    leadMagnet: file.leadMagnet || {},
    notify: { channel: file.notify?.channel || 'slack', destination: file.notify?.destination || '' },
    calendarLink: file.calendarLink || 'https://cal.com/stackdstudios/intro',
  };
  return cached;
}
