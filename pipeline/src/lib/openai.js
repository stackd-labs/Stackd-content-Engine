// OpenAI image generation (DALL·E 3) for thumbnails. Returns image
// URLs; the caller downloads them. Returns [] when no key so the
// thumbnail stage falls back to a Remotion-rendered branded frame.
import { env, has, DEMO } from './env.js';
import { fetchJSON } from './http.js';
import { log } from './logger.js';

export const isOpenAIConfigured = has('OPENAI_API_KEY') && !DEMO;

/**
 * Generate `n` thumbnail candidates. DALL·E 3 only renders one image
 * per request, so we issue n requests.
 * @returns {Promise<{url:string|null, prompt:string}[]>}
 */
export async function generateImages({ prompt, n = 3, size = '1792x1024' }) {
  if (!isOpenAIConfigured) { log.mock('DALL·E thumbnail'); return Array.from({ length: n }, () => ({ url: null, prompt })); }
  const out = [];
  for (let i = 0; i < n; i++) {
    try {
      const data = await fetchJSON('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size, quality: 'hd' }),
      });
      out.push({ url: data.data?.[0]?.url || null, prompt });
    } catch (err) {
      log.warn(`DALL·E generation ${i + 1} failed: ${err.message}`);
      out.push({ url: null, prompt });
    }
  }
  return out;
}
