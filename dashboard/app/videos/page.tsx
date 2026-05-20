'use client';

import { useState, useMemo } from 'react';
import {
  Search, Filter, Play, FileText, Activity,
  Check, X, Loader2, CircleDashed, ExternalLink,
} from 'lucide-react';
import { useTable } from '@/lib/useTable';
import {
  PageHeader, EmptyState, DataTable, Th, Td,
} from '@/components/ui/primitives';
import {
  VideoStatusBadge, ViralityScore, PostStatusBadge,
} from '@/components/ui/Badge';
import { PlatformIcon, PlatformIcons } from '@/components/ui/PlatformIcon';
import { SlideOver } from '@/components/ui/SlideOver';
import { dateShort, timeAgo, duration, compact, num } from '@/lib/format';
import { NOW } from '@/lib/placeholder';
import { DEFAULT_CONTENT_PILLARS, FORMATS } from '@shared/constants';
import type { Video, Post, Analytics, RunLogEntry } from '@shared/types';

// ── date-range helpers (computed once, derived from NOW) ──────────────────────
const SEVEN_DAYS_AGO = new Date(NOW.getTime() - 7 * 86_400_000).toISOString();
const THIRTY_DAYS_AGO = new Date(NOW.getTime() - 30 * 86_400_000).toISOString();

const VIDEO_STATUSES = [
  'drafting', 'producing', 'rendering', 'posting', 'live', 'failed', 'flagged',
] as const;

// ── Thumbnail placeholder block ───────────────────────────────────────────────
function ThumbnailPlaceholder({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const cls =
    size === 'sm'
      ? 'w-16 h-9 shrink-0'
      : 'w-full aspect-video';
  return (
    <div
      className={`${cls} rounded bg-gradient-to-br from-navy-light to-navy flex items-center justify-center`}
    >
      <Play size={size === 'sm' ? 12 : 28} className="text-gold/60" />
    </div>
  );
}

// ── Run-log stepper ───────────────────────────────────────────────────────────
function RunLogStepper({ log }: { log: RunLogEntry[] }) {
  return (
    <ol className="space-y-2">
      {log.map((entry, i) => {
        const isDone = entry.status === 'done';
        const isRunning = entry.status === 'running';
        const isFailed = entry.status === 'failed';
        const isPending = entry.status === 'pending';

        let iconEl: React.ReactNode;
        let iconColor: string;
        if (isDone) {
          iconEl = <Check size={13} />;
          iconColor = 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30';
        } else if (isRunning) {
          iconEl = <Loader2 size={13} className="animate-spin" />;
          iconColor = 'text-gold bg-gold/15 border-gold/30';
        } else if (isFailed) {
          iconEl = <X size={13} />;
          iconColor = 'text-rose-400 bg-rose-500/15 border-rose-500/30';
        } else {
          iconEl = <CircleDashed size={13} />;
          iconColor = 'text-white/30 bg-white/5 border-white/10';
        }

        return (
          <li key={i} className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${iconColor}`}
            >
              {iconEl}
            </span>
            <div className="min-w-0 flex-1">
              <div className={`text-sm ${isPending ? 'text-white/35' : 'text-white/80'}`}>
                {entry.stage.replace(/_/g, ' ')}
                {entry.message && entry.message !== 'ok' && (
                  <span className="ml-2 text-xs text-white/45">{entry.message}</span>
                )}
              </div>
              {entry.at && (
                <div className="mt-0.5 text-xs text-white/35">{timeAgo(entry.at)}</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ── Slide-over content ────────────────────────────────────────────────────────
function VideoDetailPanel({
  video,
  posts,
  analytics,
}: {
  video: Video;
  posts: Post[];
  analytics: Analytics[];
}) {
  const videoPosts = posts.filter((p) => p.video_id === video.id);

  return (
    <div className="space-y-6">
      {/* 1. Status row */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-bg p-4">
        <VideoStatusBadge status={video.status} />
        <ViralityScore score={video.virality_score} />
        {video.hook_style && (
          <span className="pill bg-navy-light/40 text-sky-200 border border-navy-glow/50">
            {video.hook_style}
          </span>
        )}
        {video.duration_seconds != null && (
          <span className="pill bg-white/8 text-white/55 border border-white/10">
            {duration(video.duration_seconds)}
          </span>
        )}
      </div>

      {/* 2. Video preview */}
      <div>
        <SectionLabel icon={<Play size={13} />} label="Video Preview" />
        <div className="mt-2 overflow-hidden rounded-xl border border-border">
          <div className="relative aspect-video w-full bg-gradient-to-br from-navy-light to-navy flex flex-col items-center justify-center gap-2">
            <Play size={36} className="text-gold/60" />
            <span className="text-xs text-white/35 px-4 text-center break-all">
              {video.video_file_path ?? 'Not rendered yet'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Audio */}
      <div>
        <SectionLabel icon={<Activity size={13} />} label="Audio" />
        <div className="mt-2 rounded-xl border border-border bg-bg p-4">
          {video.audio_file_path ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio controls src={video.audio_file_path} className="w-full h-9" />
              <p className="text-xs text-white/40 break-all">{video.audio_file_path}</p>
            </div>
          ) : (
            <p className="text-sm text-white/35">Voiceover not generated yet.</p>
          )}
        </div>
      </div>

      {/* 4. Script */}
      <div>
        <SectionLabel icon={<FileText size={13} />} label="Script" />
        <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-border bg-bg p-4">
          {video.script ? (
            <pre className="whitespace-pre-wrap font-mono text-xs text-white/70 leading-relaxed">
              {video.script}
            </pre>
          ) : (
            <p className="text-sm text-white/35">No script yet.</p>
          )}
        </div>
      </div>

      {/* 5. Posts */}
      {videoPosts.length > 0 && (
        <div>
          <SectionLabel icon={<ExternalLink size={13} />} label="Posts" />
          <div className="mt-2 divide-y divide-border/60 rounded-xl border border-border bg-bg">
            {videoPosts.map((post) => {
              const postAnalytics = analytics.find((a) => a.post_id === post.id);
              return (
                <div key={post.id} className="flex items-center gap-3 px-4 py-3">
                  <PlatformIcon platform={post.platform} size={16} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <PostStatusBadge status={post.status} />
                      {postAnalytics && (
                        <span className="text-xs text-white/45">
                          {compact(postAnalytics.views)} views
                        </span>
                      )}
                    </div>
                  </div>
                  {post.platform_url && (
                    <a
                      href={post.platform_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-white/40 hover:text-gold transition-colors"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. Analytics per platform */}
      {videoPosts.some((p) => analytics.find((a) => a.post_id === p.id)) && (
        <div>
          <SectionLabel icon={<Activity size={13} />} label="Analytics per Platform" />
          <div className="mt-2 overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-surface-2/50">
                <tr>
                  {['Platform', 'Views', 'Likes', 'Comments', 'Shares', 'Followers'].map((h) => (
                    <th key={h} className="th text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {videoPosts
                  .map((p) => ({ post: p, a: analytics.find((a) => a.post_id === p.id) }))
                  .filter((x): x is { post: Post; a: Analytics } => x.a != null)
                  .map(({ post, a }) => (
                    <tr key={post.id} className="row-hover">
                      <td className="td">
                        <PlatformIcon platform={post.platform} size={15} withLabel />
                      </td>
                      <td className="td text-white/70">{compact(a.views)}</td>
                      <td className="td text-white/70">{num(a.likes)}</td>
                      <td className="td text-white/70">{num(a.comments)}</td>
                      <td className="td text-white/70">{num(a.shares)}</td>
                      <td className="td text-white/70">+{num(a.followers_gained)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. Run log */}
      {video.run_log && video.run_log.length > 0 && (
        <div>
          <SectionLabel icon={<CircleDashed size={13} />} label="Run Log" />
          <div className="mt-3">
            <RunLogStepper log={video.run_log} />
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/40">
      {icon}
      {label}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function VideosPage() {
  const { rows: videos } = useTable<Video>('videos');
  const { rows: posts } = useTable<Post>('posts');
  const { rows: analytics } = useTable<Analytics>('analytics');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [formatFilter, setFormatFilter] = useState('');
  const [pillarFilter, setPillarFilter] = useState('');
  const [dateRange, setDateRange] = useState('all');

  // Selected video for SlideOver
  const [selected, setSelected] = useState<Video | null>(null);

  // Derived platform list per video
  const platformsByVideo = useMemo(() => {
    const map = new Map<string, string[]>();
    posts.forEach((p) => {
      if (!p.video_id) return;
      const existing = map.get(p.video_id) ?? [];
      if (!existing.includes(p.platform)) existing.push(p.platform);
      map.set(p.video_id, existing);
    });
    return map;
  }, [posts]);

  // Date-range cutoff (derived from NOW, never from Date.now())
  const dateCutoff = useMemo(() => {
    if (dateRange === '7d') return SEVEN_DAYS_AGO;
    if (dateRange === '30d') return THIRTY_DAYS_AGO;
    return null;
  }, [dateRange]);

  // Filtered video list
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return videos.filter((v) => {
      if (q && !v.title.toLowerCase().includes(q) && !(v.topic ?? '').toLowerCase().includes(q)) {
        return false;
      }
      if (statusFilter && v.status !== statusFilter) return false;
      if (formatFilter && v.format !== formatFilter) return false;
      if (pillarFilter && v.content_pillar !== pillarFilter) return false;
      if (dateCutoff && v.created_at < dateCutoff) return false;
      return true;
    });
  }, [videos, search, statusFilter, formatFilter, pillarFilter, dateCutoff]);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Videos" subtitle={`${videos.length} videos total`} />

      {/* Filter bar */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none" />
            <input
              type="text"
              className="input w-full pl-9 text-sm"
              placeholder="Search by title or topic…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Status */}
          <div className="relative">
            <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none" />
            <select
              className="input pl-8 pr-3 text-sm appearance-none cursor-pointer"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              {VIDEO_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Format */}
          <select
            className="input pr-3 text-sm appearance-none cursor-pointer"
            value={formatFilter}
            onChange={(e) => setFormatFilter(e.target.value)}
          >
            <option value="">All formats</option>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </option>
            ))}
          </select>

          {/* Content pillar */}
          <select
            className="input pr-3 text-sm appearance-none cursor-pointer"
            value={pillarFilter}
            onChange={(e) => setPillarFilter(e.target.value)}
          >
            <option value="">All pillars</option>
            {DEFAULT_CONTENT_PILLARS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          {/* Date range */}
          <select
            className="input pr-3 text-sm appearance-none cursor-pointer"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
          >
            <option value="all">All time</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </div>

        {/* Active filter summary */}
        {filtered.length !== videos.length && (
          <p className="mt-3 text-xs text-white/40">
            Showing <span className="text-white/70 font-medium">{filtered.length}</span> of{' '}
            {videos.length} videos
          </p>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState message="No videos match your filters." />
      ) : (
        <DataTable
          head={
            <>
              <Th className="w-20">Thumb</Th>
              <Th>Title</Th>
              <Th className="hidden lg:table-cell">Topic</Th>
              <Th className="hidden xl:table-cell">Pillar</Th>
              <Th className="hidden md:table-cell">Format</Th>
              <Th>Virality</Th>
              <Th>Status</Th>
              <Th className="hidden sm:table-cell">Created</Th>
              <Th>Platforms</Th>
            </>
          }
        >
          {filtered.map((v) => {
            const platforms = platformsByVideo.get(v.id) ?? [];
            return (
              <tr
                key={v.id}
                className="row-hover cursor-pointer"
                onClick={() => setSelected(v)}
              >
                <Td>
                  <ThumbnailPlaceholder size="sm" />
                </Td>
                <Td>
                  <div className="max-w-[220px] truncate font-medium text-white/90 text-sm">
                    {v.title}
                  </div>
                </Td>
                <Td className="hidden lg:table-cell">
                  <div className="max-w-[180px] truncate text-white/55 text-xs">
                    {v.topic ?? '—'}
                  </div>
                </Td>
                <Td className="hidden xl:table-cell">
                  <span className="text-xs text-white/55">{v.content_pillar ?? '—'}</span>
                </Td>
                <Td className="hidden md:table-cell">
                  <span className="text-xs capitalize text-white/55">{v.format}</span>
                </Td>
                <Td>
                  <ViralityScore score={v.virality_score} />
                </Td>
                <Td>
                  <VideoStatusBadge status={v.status} />
                </Td>
                <Td className="hidden sm:table-cell">
                  <span className="text-xs text-white/45">{dateShort(v.created_at)}</span>
                </Td>
                <Td>
                  <PlatformIcons platforms={platforms} />
                </Td>
              </tr>
            );
          })}
        </DataTable>
      )}

      {/* SlideOver */}
      <SlideOver
        open={selected != null}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ''}
        subtitle={
          selected
            ? `${selected.content_pillar ?? ''} · ${selected.format} · ${selected.status}`
            : undefined
        }
        width="max-w-3xl"
      >
        {selected && (
          <VideoDetailPanel
            video={selected}
            posts={posts}
            analytics={analytics}
          />
        )}
      </SlideOver>
    </div>
  );
}
