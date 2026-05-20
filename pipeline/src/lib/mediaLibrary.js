// Local media library lookup. The gather stage checks here before
// hitting Pexels, so you can drop your own assets in
// /output/media-library and they take priority.
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { mediaLibraryDir } from './paths.js';

/**
 * Find a local asset whose filename loosely matches the query keywords.
 * @returns {string|null} absolute path or null
 */
export function findInLibrary(query) {
  const dir = mediaLibraryDir();
  if (!existsSync(dir)) return null;
  const keywords = String(query || '').toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  let files = [];
  try { files = readdirSync(dir).filter((f) => /\.(mp4|mov|webm|jpg|jpeg|png|webp)$/i.test(f)); }
  catch { return null; }
  const hit = files.find((f) => {
    const name = f.toLowerCase();
    return keywords.some((k) => name.includes(k));
  });
  return hit ? join(dir, hit) : null;
}

/** Pick a music track from settings by mood (or the first available). */
export function pickMusic(tracks, mood) {
  if (!tracks?.length) return null;
  return tracks.find((t) => t.mood === mood) || tracks[0];
}
