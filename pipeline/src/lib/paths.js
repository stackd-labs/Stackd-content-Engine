// Resolves and guarantees the /output/* directory layout.
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
// pipeline/src/lib -> repo root
export const ROOT = resolve(__dirname, '..', '..', '..');
export const OUTPUT_DIR = join(ROOT, 'output');
export const REMOTION_DIR = join(ROOT, 'remotion');

const ensure = (p) => {
  mkdirSync(p, { recursive: true });
  return p;
};

export const audioDir = () => ensure(join(OUTPUT_DIR, 'audio'));
export const logsDir = () => ensure(join(OUTPUT_DIR, 'logs'));
export const mediaLibraryDir = () => ensure(join(OUTPUT_DIR, 'media-library'));

export const audioPath = (videoId) => join(audioDir(), `${videoId}.mp3`);
export const videoDir = (videoId) => ensure(join(OUTPUT_DIR, 'videos', videoId));
export const mediaDir = (videoId) => ensure(join(OUTPUT_DIR, 'media', videoId));
export const thumbnailDir = (videoId) => ensure(join(OUTPUT_DIR, 'thumbnails', videoId));
export const repurposeDir = (videoId) => ensure(join(OUTPUT_DIR, 'repurpose', videoId));
export const clipsDir = (videoId) => ensure(join(videoDir(videoId), 'clips'));

/** Path relative to repo root, with forward slashes — what we store in Supabase. */
export const rel = (absPath) => '/' + absPath.replace(ROOT, '').replace(/\\/g, '/').replace(/^\/+/, '');
