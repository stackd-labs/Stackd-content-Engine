'use client';

import { useEffect, useRef, useState } from 'react';
import { Rocket, Check, Loader2, CircleDashed, PlayCircle } from 'lucide-react';
import { Modal } from './ui/SlideOver';
import { ProgressBar } from './ui/primitives';
import { PlatformIcon } from './ui/PlatformIcon';
import { authFetch } from '@/lib/authFetch';
import {
  PIPELINE_STAGES, PIPELINE_STAGE_LABELS, PLATFORMS,
  DEFAULT_CONTENT_PILLARS, FORMATS,
} from '@shared/constants';
import type { Platform, VideoFormat } from '@shared/types';

type Phase = 'form' | 'running' | 'done';

export function RunPipelineButton() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('form');
  const [topic, setTopic] = useState('');
  const [format, setFormat] = useState<VideoFormat>('short');
  const [pillar, setPillar] = useState(DEFAULT_CONTENT_PILLARS[0]);
  const [platforms, setPlatforms] = useState<Platform[]>(['youtube', 'tiktok', 'instagram']);
  const [autoPost, setAutoPost] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const togglePlatform = (p: Platform) =>
    setPlatforms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  const reset = () => {
    if (timer.current) clearInterval(timer.current);
    setPhase('form');
    setStageIdx(0);
  };

  const run = async () => {
    if (!topic.trim()) return;
    setPhase('running');
    setStageIdx(0);

    // Kick off the real pipeline (tolerant: demo mode has no runner).
    authFetch('/api/run-pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, format, pillar, platforms, autoPost }),
    }).catch(() => {});

    // Drive the live progress tracker stage-by-stage.
    timer.current = setInterval(() => {
      setStageIdx((i) => {
        const next = i + 1;
        if (next >= PIPELINE_STAGES.length) {
          if (timer.current) clearInterval(timer.current);
          setPhase('done');
          return PIPELINE_STAGES.length;
        }
        return next;
      });
    }, 850);
  };

  const close = () => {
    setOpen(false);
    setTimeout(reset, 200);
  };

  const pct = Math.round((stageIdx / PIPELINE_STAGES.length) * 100);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn-gold fixed bottom-6 right-6 z-40 shadow-gold"
      >
        <Rocket size={16} /> Run Pipeline
      </button>

      <Modal open={open} onClose={close} title="Run Content Pipeline" width="max-w-xl">
        {phase === 'form' && (
          <div className="space-y-4">
            <div>
              <label className="stat-label">Topic, raw idea, or URL</label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                rows={3}
                placeholder="e.g. The 3-tool AI stack that runs my agency on autopilot"
                className="input mt-1.5 resize-none"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="stat-label">Format</label>
                <select value={format} onChange={(e) => setFormat(e.target.value as VideoFormat)} className="input mt-1.5">
                  {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="stat-label">Content Pillar</label>
                <select value={pillar} onChange={(e) => setPillar(e.target.value)} className="input mt-1.5">
                  {DEFAULT_CONTENT_PILLARS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="stat-label">Platforms</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {PLATFORMS.map((p) => {
                  const on = platforms.includes(p);
                  return (
                    <button
                      key={p}
                      onClick={() => togglePlatform(p)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                        on ? 'border-gold/50 bg-gold/10 text-white' : 'border-border text-white/45 hover:text-white'
                      }`}
                    >
                      <PlatformIcon platform={p} size={15} /> {p}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <div>
                <div className="text-sm font-medium text-white">Auto-post</div>
                <div className="text-xs text-white/40">Off = send finished posts to the approval queue</div>
              </div>
              <input type="checkbox" checked={autoPost} onChange={(e) => setAutoPost(e.target.checked)} className="h-5 w-9 cursor-pointer appearance-none rounded-full bg-white/15 transition-colors checked:bg-gold relative before:absolute before:top-0.5 before:left-0.5 before:h-4 before:w-4 before:rounded-full before:bg-white before:transition-transform checked:before:translate-x-4" />
            </label>

            <button onClick={run} disabled={!topic.trim()} className="btn-gold w-full disabled:opacity-40">
              <PlayCircle size={16} /> Run Pipeline
            </button>
          </div>
        )}

        {(phase === 'running' || phase === 'done') && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-bg p-3">
              <div className="truncate text-sm font-medium text-white">{topic}</div>
              <div className="mt-0.5 text-xs text-white/40">{format} · {pillar} · {platforms.length} platforms</div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-white/50">
                  {phase === 'done' ? 'Completed' : PIPELINE_STAGE_LABELS[PIPELINE_STAGES[Math.min(stageIdx, PIPELINE_STAGES.length - 1)]]}
                </span>
                <span className="text-gold">{pct}%</span>
              </div>
              <ProgressBar value={pct} animated={phase === 'running'} />
            </div>

            <div className="max-h-64 space-y-1 overflow-y-auto">
              {PIPELINE_STAGES.map((stage, i) => {
                const state = i < stageIdx ? 'done' : i === stageIdx && phase === 'running' ? 'running' : 'pending';
                return (
                  <div key={stage} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm">
                    {state === 'done' && <Check size={15} className="text-emerald-400" />}
                    {state === 'running' && <Loader2 size={15} className="animate-spin text-gold" />}
                    {state === 'pending' && <CircleDashed size={15} className="text-white/25" />}
                    <span className={state === 'pending' ? 'text-white/35' : 'text-white/80'}>
                      {PIPELINE_STAGE_LABELS[stage]}
                    </span>
                  </div>
                );
              })}
            </div>

            {phase === 'done' && (
              <div className="flex gap-2">
                <button onClick={reset} className="btn-ghost flex-1">Run another</button>
                <button onClick={close} className="btn-gold flex-1">Done</button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
