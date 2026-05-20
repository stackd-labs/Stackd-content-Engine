// Lightweight web "what's trending now" search. Uses Brave Search API
// if SEARCH_API_KEY is set, otherwise returns mock snippets. The result
// is fed into the script prompt as current-context grounding.
import { env, has, DEMO } from './env.js';
import { fetchJSON } from './http.js';
import { log } from './logger.js';

export const isSearchConfigured = has('SEARCH_API_KEY') && !DEMO;

/** @returns {Promise<{title:string, description:string, url:string}[]>} */
export async function webSearch(query, count = 5) {
  if (!isSearchConfigured) { log.mock(`Web search "${query}"`); return mockResults(query); }
  try {
    const data = await fetchJSON(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`,
      { headers: { 'X-Subscription-Token': env.SEARCH_API_KEY, Accept: 'application/json' } },
    );
    return (data.web?.results || []).map((r) => ({ title: r.title, description: r.description, url: r.url }));
  } catch (err) { log.warn(`Web search failed: ${err.message}`); return mockResults(query); }
}

const mockResults = (query) => [
  { title: `${query}: the trend everyone's talking about this week`, description: 'Creators are leaning into automation-first workflows and short-form proof-of-work content.', url: 'https://example.com/trend' },
  { title: `Why ${query} is dominating short-form right now`, description: 'Hooks that open with a bold claim or a number are outperforming on watch time.', url: 'https://example.com/short-form' },
  { title: `${query} — practical playbook`, description: 'Audiences want the system, not the hype. Step-by-step breakdowns convert best.', url: 'https://example.com/playbook' },
];
