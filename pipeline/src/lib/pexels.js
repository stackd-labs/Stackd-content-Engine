// Pexels stock photo/video search. Returns [] (no error) when no key.
import { env, has, DEMO } from './env.js';
import { fetchJSON } from './http.js';
import { log } from './logger.js';

export const isPexelsConfigured = has('PEXELS_API_KEY') && !DEMO;

export async function searchPhotos(query, perPage = 3) {
  if (!isPexelsConfigured) { log.mock(`Pexels photo "${query}"`); return mockPhotos(query, perPage); }
  try {
    const data = await fetchJSON(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape`,
      { headers: { Authorization: env.PEXELS_API_KEY } },
    );
    return (data.photos || []).map((p) => ({ type: 'photo', url: p.src?.large2x || p.src?.large, id: p.id, query }));
  } catch (err) { log.warn(`Pexels photo search failed: ${err.message}`); return mockPhotos(query, perPage); }
}

export async function searchVideos(query, perPage = 2) {
  if (!isPexelsConfigured) { log.mock(`Pexels video "${query}"`); return mockVideos(query, perPage); }
  try {
    const data = await fetchJSON(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}`,
      { headers: { Authorization: env.PEXELS_API_KEY } },
    );
    return (data.videos || []).map((v) => {
      const file = (v.video_files || []).sort((a, b) => (b.width || 0) - (a.width || 0))[0];
      return { type: 'video', url: file?.link, id: v.id, query };
    });
  } catch (err) { log.warn(`Pexels video search failed: ${err.message}`); return mockVideos(query, perPage); }
}

const mockPhotos = (query, n) =>
  Array.from({ length: n }, (_, i) => ({ type: 'photo', url: null, id: `mock-photo-${i}`, query }));
const mockVideos = (query, n) =>
  Array.from({ length: n }, (_, i) => ({ type: 'video', url: null, id: `mock-video-${i}`, query }));
