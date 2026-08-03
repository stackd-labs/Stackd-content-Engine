// ============================================================
// Derives the pipeline's base URL from PIPELINE_WEBHOOK_URL (which points
// at .../run — see /api/run-pipeline). Returns null when unset, same
// "demo mode, no runner configured" signal used elsewhere.
// ============================================================
export function getPipelineBaseUrl(): string | null {
  const runWebhook = process.env.PIPELINE_WEBHOOK_URL;
  if (!runWebhook) return null;
  return runWebhook.replace(/\/run\/?$/, '');
}
