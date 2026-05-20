// ============================================================
// Stage 5 — generateThumbnail
// Generates 3 DALL·E thumbnail candidates + a Remotion branded-
// frame spec, then uses Claude to pick the highest-CTR option.
// Returns { selected, options, reasoning }.
// ============================================================
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateImages } from '../lib/openai.js';
import { generateJSON } from '../lib/ai.js';
import { download } from '../lib/http.js';
import { thumbnailDir, rel } from '../lib/paths.js';
import { getSettings } from '../lib/settings.js';
import { updateVideo, appendVideoLog } from '../lib/runState.js';
import { log } from '../lib/logger.js';

/**
 * Build a high-CTR DALL·E prompt for a YouTube thumbnail.
 * @param {string} topic
 * @param {string} hookText
 * @param {object} brand  - { gold, navy, voicePersona }
 * @returns {string}
 */
function buildDallePrompt(topic, hookText, brand) {
  const gold = brand?.gold || '#D4A017';
  const navy = brand?.navy || '#0A1628';
  return (
    `YouTube thumbnail, ultra-high CTR design. ` +
    `Topic: "${topic}". Hook concept: "${hookText}". ` +
    `Visual style: bold, high-contrast, ${navy} navy background with ${gold} gold accents. ` +
    `Large expressive subject in foreground (person or icon) showing strong emotion or action. ` +
    `Dramatic lighting, sharp shadows, professional photography feel. ` +
    `Minimal text space reserved on one side. ` +
    `No watermarks, no borders. ` +
    `Photorealistic, 16:9 aspect ratio, vibrant and attention-grabbing.`
  );
}

export async function generateThumbnail({ videoId, title, topic, hookText }) {
  log.stage('generateThumbnail', videoId);

  const settings = getSettings();
  const brand = settings.brand || {};
  const dir = thumbnailDir(videoId);

  // ── 1. Build DALL·E prompt ───────────────────────────────────────────────
  const dallePrompt = buildDallePrompt(topic, hookText, brand);
  log.info(`generateThumbnail prompt: ${dallePrompt.slice(0, 100)}…`);

  // ── 2. Generate 3 candidates ─────────────────────────────────────────────
  const results = await generateImages({ prompt: dallePrompt, n: 3, size: '1792x1024' });

  const options = [];

  for (let i = 0; i < results.length; i++) {
    const { url } = results[i];
    if (url) {
      try {
        const destPath = join(dir, `option-${i}.png`);
        await download(url, destPath);
        const relPath = rel(destPath);
        options.push({ index: i, type: 'dalle', path: relPath });
        log.ok(`generateThumbnail downloaded option-${i}: ${relPath}`);
      } catch (err) {
        log.warn(`generateThumbnail option-${i} download failed — ${err.message}`);
        options.push({ index: i, type: 'dalle', path: null });
      }
    } else {
      // Demo / no-key: push null placeholder
      log.mock(`thumbnail option-${i}`);
      options.push({ index: i, type: 'dalle', path: null });
    }
  }

  // ── 3. Branded backup: Remotion spec JSON ────────────────────────────────
  const brandedSpecPath = join(dir, 'branded-frame.json');
  const brandedSpec = {
    type: 'remotion-branded-frame',
    title,
    hookText,
    brand: {
      gold: brand.gold || '#D4A017',
      navy: brand.navy || '#0A1628',
      voicePersona: brand.voicePersona || 'Stackd Studios',
    },
    layout: 'headline-left-subject-right',
    note: 'Remotion renders the actual PNG from this spec during the render stage.',
  };

  try {
    await writeFile(brandedSpecPath, JSON.stringify(brandedSpec, null, 2));
    log.ok(`generateThumbnail branded-frame spec written: ${rel(brandedSpecPath)}`);
  } catch (err) {
    log.warn(`generateThumbnail branded spec write failed — ${err.message}`);
  }

  const brandedEntry = { index: 'branded', type: 'branded-frame', path: rel(brandedSpecPath) };
  options.push(brandedEntry);

  // ── 4. Ask Claude which option has the highest CTR potential ─────────────
  const optionDescriptions = options
    .filter((o) => o.type === 'dalle')
    .map((o) =>
      `Option ${o.index}: ${o.path ? 'DALL·E render downloaded' : 'demo placeholder (no image key)'} — ` +
      `prompt concept: bold ${topic} visual with hook "${hookText}"`
    )
    .join('\n');

  const { bestIndex, reasoning } = await generateJSON({
    system:
      'You are an expert YouTube thumbnail strategist. Analyze the thumbnail options and pick the one most likely to earn the highest click-through rate (CTR). Consider face visibility, contrast, curiosity-gap framing, and emotional resonance.',
    prompt:
      `Video topic: "${topic}"\nHook text: "${hookText}"\n\nAvailable options:\n${optionDescriptions}\n\n` +
      `Return JSON: { "bestIndex": <number 0-2>, "reasoning": "<1-2 sentence rationale>" }`,
    maxTokens: 400,
    mock: {
      bestIndex: 0,
      reasoning:
        'High-contrast face with bold gold accent and curiosity-gap framing tends to win CTR.',
    },
  });

  // ── 5. Resolve selected ──────────────────────────────────────────────────
  const dalleOptions = options.filter((o) => o.type === 'dalle');
  const pickedDalle = dalleOptions.find((o) => o.index === bestIndex);
  const firstNonNull = options.find((o) => o.path !== null);
  const selected =
    (pickedDalle?.path ? pickedDalle.path : null) ||
    brandedEntry.path ||
    firstNonNull?.path ||
    null;

  // ── 6. Persist ──────────────────────────────────────────────────────────
  try {
    await updateVideo(videoId, { thumbnail_url: selected });
  } catch (err) {
    log.warn(`generateThumbnail updateVideo failed — ${err.message}`);
  }

  const reasoningSlice = (reasoning || '').toString().slice(0, 80);
  try {
    await appendVideoLog(videoId, 'thumbnail', 'done', reasoningSlice);
  } catch (err) {
    log.warn(`generateThumbnail appendVideoLog failed — ${err.message}`);
  }

  log.ok(`generateThumbnail done — selected: ${selected}`);
  return { selected, options, reasoning };
}

export default generateThumbnail;

// ---- main guard ----------------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sample = {
    videoId: 'demo-thumb-001',
    title: '5 AI Tools That Will 10x Your Business in 2025',
    topic: 'AI tools for small business',
    hookText: 'Stop wasting 10 hours a week — let AI do it',
  };

  log.info('Running generateThumbnail demo…');
  generateThumbnail(sample)
    .then(({ selected, options, reasoning }) => {
      log.ok(`Demo complete — selected: ${selected}`);
      log.info(`Options (${options.length}): ${options.map((o) => `${o.index}:${o.path ?? 'null'}`).join(', ')}`);
      log.info(`Claude reasoning: ${reasoning}`);
      process.exit(0);
    })
    .catch((err) => {
      log.error(err.message);
      process.exit(1);
    });
}
