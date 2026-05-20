// ============================================================
// Stage 6 — renderVideo
// Renders 3 orientation-specific MP4s via Remotion (landscape,
// vertical, square).  Falls back gracefully to empty placeholder
// files when Remotion is not installed so the pipeline never
// crashes.
// ============================================================
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { videoDir, rel, ROOT, REMOTION_DIR } from '../lib/paths.js';
import { FPS } from '../lib/constants.js';
import { getSettings } from '../lib/settings.js';
import { updateVideo, appendVideoLog } from '../lib/runState.js';
import { log } from '../lib/logger.js';

// ---- helpers -------------------------------------------------------

/** Ensure every media item carries an absolute path resolved from ROOT. */
function resolveMedia(media) {
  if (!Array.isArray(media)) return [];
  return media.map((item) => {
    if (!item) return item;
    const p = item.path || item.filePath || item.localPath || '';
    if (p && !p.startsWith('/') && !p.match(/^[A-Za-z]:\\/)) {
      return { ...item, path: join(ROOT, p) };
    }
    return item;
  });
}

/** Resolve a single path that may be repo-relative. */
function resolvePath(p) {
  if (!p) return null;
  if (p.startsWith('/') || p.match(/^[A-Za-z]:\\/)) return p;
  return join(ROOT, p);
}

// ---- main export ---------------------------------------------------

export async function renderVideo({
  videoId,
  strategy,
  audioFilePath,
  wordTimestamps,
  media,
  musicTrack,
}) {
  log.stage('renderVideo', videoId);

  // --- output paths ---
  const outDir = videoDir(videoId);
  mkdirSync(outDir, { recursive: true });

  const targets = [
    { key: 'landscape', id: 'landscape' },
    { key: 'vertical',  id: 'vertical'  },
    { key: 'square',    id: 'square'    },
  ];

  const outputPaths = {};
  for (const { key } of targets) {
    outputPaths[key] = join(outDir, `final-${key}.mp4`);
  }

  // --- frame count ---
  const durationInFrames = Math.round(
    ((strategy.durationSeconds || 45) + 5) * FPS,
  );

  // --- shared inputProps ---
  const settings  = getSettings();
  const resolvedMedia = resolveMedia(media);
  const resolvedAudio = resolvePath(audioFilePath) || '';
  const resolvedMusic = musicTrack?.path ? resolvePath(musicTrack.path) : null;

  const baseProps = {
    strategy,
    audioSrc:       resolvedAudio,
    wordTimestamps: wordTimestamps || [],
    media:          resolvedMedia,
    musicSrc:       resolvedMusic,
    brand:          settings.brand || {},
  };

  // --- mark rendering ---
  await updateVideo(videoId, { status: 'rendering' });

  // --- attempt real Remotion render (dynamic import) ---
  let bundled = null;
  let remotionOk = false;
  const entryPoint = join(REMOTION_DIR, 'src', 'index.ts');

  try {
    const { bundle }                       = await import('@remotion/bundler');
    const { renderMedia, selectComposition } = await import('@remotion/renderer');

    log.info('renderVideo: bundling Remotion entry…');
    bundled = await bundle({ entryPoint, onProgress: () => {} });
    log.ok('renderVideo: bundle done');

    for (const { key, id } of targets) {
      const inputProps = { ...baseProps, orientation: key };
      const outPath    = outputPaths[key];

      log.info(`renderVideo: rendering ${key}…`);
      const comp = await selectComposition({
        serveUrl: bundled,
        id,
        inputProps,
      });

      await renderMedia({
        composition: { ...comp, durationInFrames },
        serveUrl:    bundled,
        codec:       'h264',
        outputLocation: outPath,
        inputProps,
        onProgress: ({ progress }) => {
          if (Math.round(progress * 100) % 25 === 0) {
            log.info(`  ${key}: ${Math.round(progress * 100)}%`);
          }
        },
      });

      log.ok(`renderVideo: ${key} done → ${rel(outPath)}`);
    }

    remotionOk = true;
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.message?.includes('Cannot find')) {
      log.mock('Remotion render');
      log.warn('renderVideo: @remotion packages not installed — writing placeholder files');
    } else {
      log.warn(`renderVideo: Remotion render failed (${err.message}) — writing placeholders`);
    }

    // write empty placeholder files so downstream stages have a path
    for (const { key } of targets) {
      try {
        writeFileSync(outputPaths[key], '');
        log.info(`renderVideo: placeholder written → ${rel(outputPaths[key])}`);
      } catch (writeErr) {
        log.error(`renderVideo: could not write placeholder for ${key}: ${writeErr.message}`);
      }
    }
  }

  // --- update DB ---
  const landscapePath = outputPaths['landscape'];
  await updateVideo(videoId, {
    video_file_path: rel(landscapePath),
    status:          'producing',
  });

  const note = remotionOk
    ? '3 versions rendered'
    : '3 placeholder files (Remotion not installed)';

  await appendVideoLog(videoId, 'render', 'done', note);
  log.ok(`renderVideo done — ${note}`);

  return {
    landscape: rel(outputPaths['landscape']),
    vertical:  rel(outputPaths['vertical']),
    square:    rel(outputPaths['square']),
  };
}

export default renderVideo;

// ---- main guard ---------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sample = {
    videoId:   'demo-render-001',
    strategy: {
      videoId:         'demo-render-001',
      title:           'AI Tools for Small Business',
      recommendedHook: 'What if your business ran itself?',
      script:          'AI is changing everything. Here is how.',
      shotList:        [],
      durationSeconds: 30,
      captions:        [],
    },
    audioFilePath:  null,
    wordTimestamps: [],
    media:          [],
    musicTrack:     null,
  };

  log.info('Running renderVideo demo…');
  renderVideo(sample)
    .then((paths) => {
      log.ok('Demo complete');
      console.log(paths);
      process.exit(0);
    })
    .catch((err) => {
      log.error(err.message);
      process.exit(1);
    });
}
