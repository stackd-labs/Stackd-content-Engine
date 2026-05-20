'use client';

import Link from 'next/link';
import {
  Clapperboard, Send, Users, Mail, Eye, Activity, ArrowRight, Loader2,
} from 'lucide-react';
import { useTable } from '@/lib/useTable';
import { PageHeader, StatCard, SectionCard, ProgressBar, EmptyState } from '@/components/ui/primitives';
import { PostStatusBadge, PipelineStatusBadge, CalendarStatusBadge } from '@/components/ui/Badge';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { compact, timeAgo, dateShort } from '@/lib/format';
import { PIPELINE_STAGES, PIPELINE_STAGE_LABELS } from '@shared/constants';
import { NOW } from '@/lib/placeholder';
import type { Analytics, CalendarEntry, EmailSubscriber, Lead, PipelineRun, Post, Video } from '@shared/types';

export default function OverviewPage() {
  const { rows: videos } = useTable<Video>('videos');
  const { rows: posts } = useTable<Post>('posts');
  const { rows: analytics } = useTable<Analytics>('analytics');
  const { rows: leads } = useTable<Lead>('leads');
  const { rows: emails } = useTable<EmailSubscriber>('emails');
  const { rows: runs } = useTable<PipelineRun>('pipeline_runs');
  const { rows: calendar } = useTable<CalendarEntry>('content_calendar');

  const livePosts = posts.filter((p) => p.status === 'posted');
  const weekViews = analytics.reduce((s, a) => s + (a.views ?? 0), 0);
  const activeSubs = emails.filter((e) => e.status === 'active');
  const weekAgo = new Date(NOW.getTime() - 7 * 86_400_000);
  const runsThisWeek = runs.filter((r) => new Date(r.started_at) >= weekAgo);
  const activeRun = runs.find((r) => r.status === 'running');

  const recentPosts = [...livePosts]
    .sort((a, b) => +new Date(b.posted_at ?? 0) - +new Date(a.posted_at ?? 0))
    .slice(0, 10);
  const videoTitle = (id: string | null) => videos.find((v) => v.id === id)?.title ?? 'Untitled';
  const viewsForPost = (id: string) => analytics.find((a) => a.post_id === id)?.views ?? 0;

  const upcoming = [...calendar]
    .filter((c) => {
      const d = new Date(c.scheduled_date);
      return d >= new Date(NOW.toDateString()) && d <= new Date(NOW.getTime() + 7 * 86_400_000);
    })
    .sort((a, b) => +new Date(a.scheduled_date) - +new Date(b.scheduled_date))
    .slice(0, 8);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Overview" subtitle="Your content engine at a glance." />

      {/* Stat row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Videos Produced" value={videos.length} icon={<Clapperboard size={16} />} />
        <StatCard label="Posts Live" value={livePosts.length} icon={<Send size={16} />} />
        <StatCard label="Leads Captured" value={leads.length} accent icon={<Users size={16} />} />
        <StatCard label="Email Subscribers" value={activeSubs.length} icon={<Mail size={16} />} />
        <StatCard label="Views This Week" value={compact(weekViews)} icon={<Eye size={16} />} />
        <StatCard label="Runs This Week" value={runsThisWeek.length} icon={<Activity size={16} />} />
      </div>

      {/* What's happening now */}
      <div className="mt-6">
        <SectionCard title="What's Happening Now">
          {activeRun ? (
            <div className="mb-5 rounded-lg border border-gold/30 bg-gold/5 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <Loader2 size={15} className="animate-spin text-gold" />
                  Pipeline running
                </div>
                <span className="text-xs text-white/45">{timeAgo(activeRun.started_at)}</span>
              </div>
              <div className="mt-1 truncate text-sm text-white/60">{activeRun.topic}</div>
              <div className="mt-3">
                {(() => {
                  const done = activeRun.stages_completed.length;
                  const pct = Math.round((done / PIPELINE_STAGES.length) * 100);
                  const current = PIPELINE_STAGES[Math.min(done, PIPELINE_STAGES.length - 1)];
                  return (
                    <>
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="text-white/55">{PIPELINE_STAGE_LABELS[current]}</span>
                        <span className="text-gold">{pct}%</span>
                      </div>
                      <ProgressBar value={pct} animated />
                    </>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="mb-5 rounded-lg border border-border bg-bg p-4 text-sm text-white/45">
              No pipeline running right now. Hit{' '}
              <span className="font-medium text-gold">Run Pipeline</span> to start one.
            </div>
          )}

          <div className="text-xs font-semibold uppercase tracking-wider text-white/40">Last 5 runs</div>
          <div className="mt-2 divide-y divide-border/60">
            {runs.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm text-white/85">{r.topic}</div>
                  <div className="text-xs text-white/40">{timeAgo(r.started_at)}</div>
                </div>
                <PipelineStatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Bottom two columns */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          title="Recently Posted"
          action={<Link href="/posts" className="flex items-center gap-1 text-xs text-gold hover:underline">All posts <ArrowRight size={12} /></Link>}
        >
          {recentPosts.length === 0 ? (
            <EmptyState message="No posts yet." />
          ) : (
            <div className="divide-y divide-border/60">
              {recentPosts.map((p) => (
                <div key={p.id} className="flex items-center gap-3 py-2.5">
                  <PlatformIcon platform={p.platform} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-white/85">{videoTitle(p.video_id)}</div>
                    <div className="text-xs text-white/40">{timeAgo(p.posted_at)}</div>
                  </div>
                  <div className="text-xs text-white/55">{compact(viewsForPost(p.id))} views</div>
                  <PostStatusBadge status={p.status} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Upcoming Calendar"
          action={<Link href="/calendar" className="flex items-center gap-1 text-xs text-gold hover:underline">Calendar <ArrowRight size={12} /></Link>}
        >
          {upcoming.length === 0 ? (
            <EmptyState message="Nothing planned for the next 7 days." />
          ) : (
            <div className="divide-y divide-border/60">
              {upcoming.map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-2.5">
                  <div className="w-14 shrink-0 text-xs font-medium text-white/55">{dateShort(c.scheduled_date).replace(', 2026', '')}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-white/85">{c.topic}</div>
                    <div className="text-xs text-white/40">{c.content_pillar} · {c.format}</div>
                  </div>
                  <CalendarStatusBadge status={c.status} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
