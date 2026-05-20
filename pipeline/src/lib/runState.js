// ============================================================
// Pipeline run + video status bookkeeping. These are the writes
// that drive the dashboard's live progress (pipeline_runs row +
// videos.run_log + videos.status), so call them at every stage.
// ============================================================
import { supabase, dbInsert, dbUpdate, cryptoId } from './supabase.js';
import { PIPELINE_STAGES } from './constants.js';
import { log } from './logger.js';

/** Create a pipeline_runs row (status 'running'). Returns runId. */
export async function createRun(topic) {
  const row = await dbInsert('pipeline_runs', {
    topic, status: 'running', stages_completed: [], output_log: [], started_at: new Date().toISOString(),
  });
  const id = row?.id ?? cryptoId();
  log.info(`pipeline_run ${id} started`);
  return id;
}

/**
 * Record stage progress on the run. status: 'running' | 'done' | 'failed'.
 * Appends to output_log and (when done) to stages_completed.
 */
export async function updateRunStage(runId, stage, status, message = '') {
  log.stage(stage, status === 'done' ? '✓' : status);
  if (!supabase) return;
  const { data } = await supabase.from('pipeline_runs').select('output_log, stages_completed').eq('id', runId).single();
  const output_log = [...(data?.output_log || []), { stage, status, message, at: new Date().toISOString() }];
  const stages_completed = status === 'done'
    ? Array.from(new Set([...(data?.stages_completed || []), stage]))
    : data?.stages_completed || [];
  await dbUpdate('pipeline_runs', runId, { output_log, stages_completed });
}

export async function completeRun(runId, note = '') {
  await dbUpdate('pipeline_runs', runId, { status: 'completed', completed_at: new Date().toISOString() });
  log.ok(`pipeline_run ${runId} completed ${note}`);
}

export async function failRun(runId, errorMessage) {
  await dbUpdate('pipeline_runs', runId, {
    status: 'failed', completed_at: new Date().toISOString(), error_message: errorMessage,
  });
  log.error(`pipeline_run ${runId} failed: ${errorMessage}`);
}

// ---- video helpers ----
export async function setVideoStatus(videoId, status) {
  await dbUpdate('videos', videoId, { status });
}

export async function updateVideo(videoId, patch) {
  return dbUpdate('videos', videoId, patch);
}

/** Append a {stage,status,message,at} entry to videos.run_log. */
export async function appendVideoLog(videoId, stage, status, message = '') {
  if (!supabase) return;
  const { data } = await supabase.from('videos').select('run_log').eq('id', videoId).single();
  const run_log = [...(data?.run_log || []), { stage, status, message, at: new Date().toISOString() }];
  await dbUpdate('videos', videoId, { run_log });
}

export { PIPELINE_STAGES };
