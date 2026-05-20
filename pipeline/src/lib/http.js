// Small fetch helpers shared by every integration (Node 24 has global fetch).
import { createWriteStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${res.statusText} for ${url}: ${text.slice(0, 300)}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

/** Download a URL to disk (binary). Returns destPath. */
export async function download(url, destPath, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok || !res.body) throw new Error(`download failed ${res.status} for ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
  return destPath;
}

/** Save an in-memory buffer/string to disk. Returns destPath. */
export async function saveBuffer(destPath, data) {
  await writeFile(destPath, data);
  return destPath;
}
