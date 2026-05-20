// ============================================================
// Anthropic Claude client. Two entry points used everywhere:
//   generateText({ system, prompt, maxTokens, mock })  -> string
//   generateJSON({ system, prompt, maxTokens, mock })   -> parsed object
//
// When ANTHROPIC_API_KEY is absent (or a call fails to parse),
// the provided `mock` value is returned so the pipeline still
// produces well-formed data and writes to Supabase.
// ============================================================
import Anthropic from '@anthropic-ai/sdk';
import { env, has, DEMO } from './env.js';
import { log } from './logger.js';

export const isClaudeConfigured = has('ANTHROPIC_API_KEY') && !DEMO;

const client = isClaudeConfigured ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;

const MODEL = env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

export async function generateText({ system, prompt, maxTokens = 2000, mock = '' }) {
  if (!client) { log.mock('Claude (text)'); return mock; }
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    });
    return res.content?.[0]?.type === 'text' ? res.content[0].text : mock;
  } catch (err) {
    log.warn(`Claude text call failed (${err.message}) — using mock.`);
    return mock;
  }
}

export async function generateJSON({ system, prompt, maxTokens = 3000, mock = {} }) {
  if (!client) { log.mock('Claude (json)'); return mock; }
  const sys = `${system}\n\nRespond with ONLY valid minified JSON. No prose, no markdown fences.`;
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: sys,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content?.[0]?.type === 'text' ? res.content[0].text : '';
    return parseJSON(text, mock);
  } catch (err) {
    log.warn(`Claude json call failed (${err.message}) — using mock.`);
    return mock;
  }
}

/** Strip code fences / leading prose and parse; fall back to mock. */
export function parseJSON(text, mock = {}) {
  if (!text) return mock;
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const first = Math.min(...['{', '['].map((c) => (t.indexOf(c) === -1 ? Infinity : t.indexOf(c))));
  if (first !== Infinity) t = t.slice(first);
  try { return JSON.parse(t); } catch { log.warn('Could not parse Claude JSON — using mock.'); return mock; }
}
