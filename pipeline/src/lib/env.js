// Loads .env (from pipeline/.env) once and exposes helpers.
import 'dotenv/config';

export const env = process.env;

/** True if every named env var is present and non-empty. */
export function has(...keys) {
  return keys.every((k) => Boolean(process.env[k] && String(process.env[k]).trim()));
}

/** Global demo switch — also implied when a given integration's key is absent. */
export const DEMO = String(process.env.PIPELINE_DEMO || '').toLowerCase() === 'true';

export const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3030';
