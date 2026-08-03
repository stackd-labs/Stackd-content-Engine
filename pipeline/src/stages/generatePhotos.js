// ============================================================
// Stage — generatePhotos (photo-mode equivalent of renderVideo)
// Renders 3 orientation-specific images via DALL·E 3 from
// strategy.imagePrompt — landscape/vertical/square — so every
// downstream stage (viralityCheck, postToPlatforms) can keep
// reading files.landscape/vertical/square exactly like the video
// path does. No Remotion, no voiceover, no b-roll.
// ============================================================
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

import { generateImages } from '../lib/openai.js';
import { download } from '../lib/http.js';
import { photoDir, rel } from '../lib/paths.js';
import { DALLE_SIZE_BY_ORIENTATION } from '../lib/constants.js';
import { updateVideo, appendVideoLog } from '../lib/runState.js';
import { log } from '../lib/logger.js';

const ORIENTATIONS = ['landscape', 'vertical', 'square'];

export async function generatePhotos({ videoId, strategy }) {
  log.stage('generatePhotos', videoId);

  const dir = photoDir(videoId);
  const prompt = strategy?.imagePrompt || `Bold visual for "${strategy?.topic || strategy?.title || 'Stackd Studios'}"`;

  const outputPaths = {};

  for (const orientation of ORIENTATIONS) {
    const size = DALLE_SIZE_BY_ORIENTATION[orientation];
    try {
      const [result] = await generateImages({ prompt, n: 1, size });
      if (result?.url) {
        const destPath = join(dir, `${orientation}.png`);
        const downloaded = await download(result.url, destPath);
        outputPaths[orientation] = rel(downloaded);
        log.ok(`generatePhotos: ${orientation} done → ${outputPaths[orientation]}`);
      } else {
        outputPaths[orientation] = null;
        log.mock(`generatePhotos ${orientation}`);
      }
    } catch (err) {
      log.warn(`generatePhotos ${orientation} failed — ${err.message}`);
      outputPaths[orientation] = null;
    }
  }

  const resolvedCount = Object.values(outputPaths).filter(Boolean).length;

  try {
    await updateVideo(videoId, {
      video_file_path: outputPaths.landscape ?? outputPaths.square ?? outputPaths.vertical ?? null,
      thumbnail_url: outputPaths.square ?? outputPaths.landscape ?? null,
      status: 'producing',
    });
  } catch (err) {
    log.warn(`generatePhotos updateVideo failed — ${err.message}`);
  }

  const note = `${resolvedCount}/${ORIENTATIONS.length} images rendered`;
  try { await appendVideoLog(videoId, 'photos', 'done', note); }
  catch (err) { log.warn(`generatePhotos appendVideoLog failed — ${err.message}`); }

  log.ok(`generatePhotos done — ${note}`);

  return {
    landscape: outputPaths.landscape,
    vertical: outputPaths.vertical,
    square: outputPaths.square,
  };
}

export default generatePhotos;

// ---- main guard -------------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const strategy = {
    topic: 'AI tools for small business',
    imagePrompt: 'Bold, high-contrast graphic: confident founder at a desk, navy and gold accents, minimal text space, photorealistic.',
  };

  log.info('Running generatePhotos demo…');
  generatePhotos({ videoId: 'demo-photos-001', strategy })
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
