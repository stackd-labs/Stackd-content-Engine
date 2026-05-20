// YouTube "trends" signal for the script stage. There is no official
// trends API, so we use the YouTube Data API: search top-viewed videos
// for the topic. Returns titles/stats Claude can learn from. Mocks
// gracefully without a key.
import { env, has, DEMO } from './env.js';
import { fetchJSON } from './http.js';
import { log } from './logger.js';

export const isYouTubeDataConfigured = has('YOUTUBE_API_KEY') && !DEMO;

/** @returns {Promise<{title:string, channel:string, views:number|null}[]>} */
export async function getTrending(topic, max = 8) {
  if (!isYouTubeDataConfigured) { log.mock(`YouTube trends "${topic}"`); return mockTrends(topic); }
  try {
    const search = await fetchJSON(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=viewCount&maxResults=${max}` +
      `&q=${encodeURIComponent(topic)}&key=${env.YOUTUBE_API_KEY}`,
    );
    return (search.items || []).map((it) => ({
      title: it.snippet?.title, channel: it.snippet?.channelTitle, views: null,
    }));
  } catch (err) { log.warn(`YouTube trends failed: ${err.message}`); return mockTrends(topic); }
}

const mockTrends = (topic) => [
  { title: `How I used ${topic} to 10x my output`, channel: 'AI Founders', views: 412000 },
  { title: `The truth about ${topic} nobody tells you`, channel: 'BuildLab', views: 288000 },
  { title: `${topic} in 60 seconds`, channel: 'Stackd Clips', views: 1900000 },
  { title: `I tried ${topic} for 30 days — here's what happened`, channel: 'Solo Ops', views: 533000 },
];
