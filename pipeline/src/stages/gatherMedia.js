// ============================================================
// Stage 4 — gatherMedia
// Resolves a B-roll asset for every shot in the shot list:
//   1. Check local media library first (zero API cost).
//   2. Prefer Pexels video; fall back to Pexels photo.
//   3. Download real assets; record path:null for demo/no-key entries
//      so the render stage can use a colored placeholder.
// Returns { media: MediaEntry[], musicTrack }.
// ============================================================
import { pathToFileURL } from 'node:url';
import { extname } from 'node:path';
import { join } from 'node:path';
import { findInLibrary, pickMusic } from '../lib/mediaLibrary.js';
import { searchVideos, searchPhotos } from '../lib/pexels.js';
import { download } from '../lib/http.js';
import { mediaDir, rel } from '../lib/paths.js';
import { getSettings } from '../lib/settings.js';
import { appendVideoLog } from '../lib/runState.js';
import { log } from '../lib/logger.js';

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm']);

/** Infer media type from file extension. */
function typeFromExt(filePath) {
  return VIDEO_EXTS.has(extname(filePath).toLowerCase()) ? 'video' : 'photo';
}

/** Best-effort extension from a URL string (defaults to supplied fallback). */
function extFromUrl(url, fallback) {
  try {
    const pathname = new URL(url).pathname;
    const e = extname(pathname).toLowerCase().replace(/[?#].*$/, '');
    return e || fallback;
  } catch {
    return fallback;
  }
}

export async function gatherMedia({ videoId, shotList }) {
  log.stage('gatherMedia', videoId);

  const settings = getSettings();
  const dir = mediaDir(videoId);
  const media = [];

  // Process shots sequentially to stay within Pexels rate limits.
  for (const shot of shotList) {
    const index = shot.index ?? media.length;
    const query = shot.brollQuery || shot.visual || `shot ${index}`;

    try {
      // 1. Local library lookup.
      const libPath = findInLibrary(query);
      if (libPath) {
        log.info(`gatherMedia [${index}] library hit: ${libPath}`);
        media.push({
          shotIndex: index,
          start: shot.start,
          end: shot.end,
          type: typeFromExt(libPath),
          path: rel(libPath),
          query,
        });
        continue;
      }

      // 2. Try Pexels video first.
      let chosen = null;
      let chosenType = 'video';

      const videos = await searchVideos(query, 1);
      const firstVideo = videos.find((v) => v.url != null);
      if (firstVideo) {
        chosen = firstVideo;
        chosenType = 'video';
      } else {
        // Fall back to Pexels photo.
        const photos = await searchPhotos(query, 2);
        const firstPhoto = photos.find((p) => p.url != null);
        if (firstPhoto) {
          chosen = firstPhoto;
          chosenType = 'photo';
        }
      }

      if (!chosen || chosen.url == null) {
        // Demo / no-key mode — record placeholder so render stage knows about the shot.
        log.mock(`gatherMedia [${index}] no asset url (demo) — placeholder recorded`);
        media.push({
          shotIndex: index,
          start: shot.start,
          end: shot.end,
          type: chosenType || 'video',
          path: null,
          query,
        });
        continue;
      }

      // 3. Download the real asset.
      const defaultExt = chosenType === 'video' ? '.mp4' : '.jpg';
      const ext = extFromUrl(chosen.url, defaultExt);
      const destPath = join(dir, `shot-${index}${ext}`);

      const downloaded = await download(chosen.url, destPath);
      log.ok(`gatherMedia [${index}] downloaded ${chosenType}: ${rel(downloaded)}`);

      media.push({
        shotIndex: index,
        start: shot.start,
        end: shot.end,
        type: chosenType,
        path: rel(downloaded),
        query,
      });
    } catch (err) {
      log.warn(`gatherMedia [${index}] failed for "${query}" — ${err.message}`);
      media.push({
        shotIndex: index,
        start: shot.start,
        end: shot.end,
        type: 'video',
        path: null,
        query,
      });
    }
  }

  // Music: pick by mood or first track; pass through as-is (curated reference path).
  const tracks = settings.musicTracks;
  const musicTrack = pickMusic(tracks, 'upbeat') || null;
  if (musicTrack) {
    log.info(`gatherMedia music: ${musicTrack.name} (${musicTrack.mood})`);
  }

  const resolved = media.filter((m) => m.path).length;
  await appendVideoLog(videoId, 'media', 'done', `${resolved}/${media.length} assets`);
  log.ok(`gatherMedia done — ${resolved}/${media.length} assets resolved`);

  return { media, musicTrack };
}

export default gatherMedia;

// ---- main guard -------------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const videoId = 'demo-media-001';
  const shotList = [
    { index: 0, start: 0, end: 4, visual: 'entrepreneur working on laptop', brollQuery: 'entrepreneur laptop' },
    { index: 1, start: 4, end: 8, visual: 'AI dashboard analytics', brollQuery: 'AI analytics dashboard' },
    { index: 2, start: 8, end: 12, visual: 'small business owner smiling', brollQuery: 'small business success' },
  ];

  log.info('Running gatherMedia demo…');
  gatherMedia({ videoId, shotList })
    .then(({ media, musicTrack }) => {
      log.ok(`Demo complete — ${media.length} shots, music: ${musicTrack?.name ?? 'none'}`);
      media.forEach((m) => log.info(`  shot ${m.shotIndex} [${m.type}] path=${m.path ?? '(placeholder)'} query="${m.query}"`));
      process.exit(0);
    })
    .catch((err) => {
      log.error(err.message);
      process.exit(1);
    });
}
