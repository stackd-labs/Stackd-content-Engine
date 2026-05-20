'use client';

import { useState } from 'react';
import {
  Eye,
  Heart,
  MessageCircle,
  Share2,
  MousePointerClick,
  UserPlus,
  Sparkles,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useTable } from '@/lib/useTable';
import {
  PageHeader,
  StatCard,
  SectionCard,
  EmptyState,
  DataTable,
  Th,
  Td,
} from '@/components/ui/primitives';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { compact } from '@/lib/format';
import { NOW } from '@/lib/placeholder';
import { PLATFORMS, DEFAULT_CONTENT_PILLARS, DEFAULT_HOOK_STYLES } from '@shared/constants';
import type { Analytics, Post, Video } from '@shared/types';

// ── Chart palette ────────────────────────────────────────────────────────────
const PLATFORM_COLORS: Record<string, string> = {
  youtube: '#ff0033',
  tiktok: '#ffffff',
  instagram: '#e1306c',
  linkedin: '#0a66c2',
  facebook: '#1877f2',
  twitter: '#1d9bf0',
};
const GOLD = '#d4af37';
const CHART_GRID = '#262626';
const CHART_TICK = { fill: '#ffffff66', fontSize: 12 };
const CHART_AXIS = { stroke: '#262626' };
const CHART_TOOLTIP = {
  contentStyle: {
    background: '#161616',
    border: '1px solid #262626',
    borderRadius: 8,
    color: '#fff',
  },
};
const CHART_LEGEND = { wrapperStyle: { fontSize: 12 } };

// ── Range options ─────────────────────────────────────────────────────────────
type Range = '7' | '30' | '90';
const RANGE_LABELS: Record<Range, string> = {
  '7': 'Last 7 days',
  '30': 'Last 30 days',
  '90': 'Last 90 days',
};

// ── Deterministic daily wave ───────────────────────────────────────────────────
function waveFactor(i: number, platformIndex: number): number {
  return 0.6 + 0.8 * (((i * 7 + platformIndex) % 5) / 4);
}

// ── MMM d formatter ───────────────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatDay(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { rows: analyticsRows } = useTable<Analytics>('analytics');
  const { rows: posts } = useTable<Post>('posts');
  const { rows: videos } = useTable<Video>('videos');

  const [range, setRange] = useState<Range>('30');
  const [platformFilter, setPlatformFilter] = useState<string>('all');

  // AI insight state
  const [insightLoading, setInsightLoading] = useState(false);
  const [insight, setInsight] = useState<{ summary: string; recommendations: string[] } | null>(null);
  const [insightError, setInsightError] = useState<string | null>(null);

  // ── helpers ──────────────────────────────────────────────────────────────────
  const resolvePost = (postId: string | null) =>
    posts.find((p) => p.id === postId) ?? null;

  const resolveVideo = (videoId: string | null) =>
    videos.find((v) => v.id === videoId) ?? null;

  // Filtered analytics (platform)
  const filteredAnalytics = platformFilter === 'all'
    ? analyticsRows
    : analyticsRows.filter((a) => a.platform === platformFilter);

  // ── Summary totals ────────────────────────────────────────────────────────────
  const totalViews      = filteredAnalytics.reduce((s, a) => s + (a.views ?? 0), 0);
  const totalLikes      = filteredAnalytics.reduce((s, a) => s + (a.likes ?? 0), 0);
  const totalComments   = filteredAnalytics.reduce((s, a) => s + (a.comments ?? 0), 0);
  const totalShares     = filteredAnalytics.reduce((s, a) => s + (a.shares ?? 0), 0);
  const totalClicks     = filteredAnalytics.reduce((s, a) => s + (a.click_throughs ?? 0), 0);
  const totalFollowers  = filteredAnalytics.reduce((s, a) => s + (a.followers_gained ?? 0), 0);

  // ── Views-over-time line chart ─────────────────────────────────────────────
  const N = parseInt(range, 10);

  // Which platforms to chart
  const chartPlatforms = platformFilter === 'all'
    ? PLATFORMS.filter((p) => analyticsRows.some((a) => a.platform === p))
    : ([platformFilter] as typeof PLATFORMS);

  // Per-platform total views (from filteredAnalytics but segmented by platform)
  const platformTotals: Record<string, number> = {};
  for (const p of chartPlatforms) {
    platformTotals[p] = analyticsRows
      .filter((a) => a.platform === p)
      .reduce((s, a) => s + (a.views ?? 0), 0);
  }

  const timeSeriesData: Record<string, string | number>[] = Array.from({ length: N }, (_, i) => {
    const dayMs = NOW.getTime() - (N - 1 - i) * 86_400_000;
    const label = formatDay(new Date(dayMs));
    const point: Record<string, string | number> = { date: label };
    chartPlatforms.forEach((p, pi) => {
      const base = (platformTotals[p] ?? 0) / N;
      point[p] = Math.round(base * waveFactor(i, pi));
    });
    return point;
  });

  // ── Top 10 videos by views ────────────────────────────────────────────────
  const videoViewMap: Record<string, number> = {};
  for (const a of analyticsRows) {
    const post = resolvePost(a.post_id);
    if (!post?.video_id) continue;
    videoViewMap[post.video_id] = (videoViewMap[post.video_id] ?? 0) + (a.views ?? 0);
  }
  const top10Videos = Object.entries(videoViewMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([vid, views]) => {
      const video = resolveVideo(vid);
      return {
        name: (video?.title ?? 'Untitled').slice(0, 22),
        views,
      };
    });

  // ── By content pillar ─────────────────────────────────────────────────────
  const pillarViewMap: Record<string, number> = {};
  for (const pillar of DEFAULT_CONTENT_PILLARS) pillarViewMap[pillar] = 0;
  for (const a of filteredAnalytics) {
    const post = resolvePost(a.post_id);
    const video = resolveVideo(post?.video_id ?? null);
    const pillar = video?.content_pillar ?? null;
    if (pillar && pillar in pillarViewMap) {
      pillarViewMap[pillar] += a.views ?? 0;
    }
  }
  const pillarData = DEFAULT_CONTENT_PILLARS.map((p) => ({
    name: p,
    views: pillarViewMap[p] ?? 0,
  }));

  // ── By hook style ─────────────────────────────────────────────────────────
  const hookViewMap: Record<string, number> = {};
  for (const h of DEFAULT_HOOK_STYLES) hookViewMap[h] = 0;
  for (const a of filteredAnalytics) {
    const post = resolvePost(a.post_id);
    const video = resolveVideo(post?.video_id ?? null);
    const hook = video?.hook_style ?? null;
    if (hook && hook in hookViewMap) {
      hookViewMap[hook] += a.views ?? 0;
    }
  }
  const hookData = DEFAULT_HOOK_STYLES.map((h) => ({
    name: h,
    views: hookViewMap[h] ?? 0,
  }));

  // ── Best performing posts ─────────────────────────────────────────────────
  const bestPosts = [...filteredAnalytics]
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, 8)
    .map((a) => {
      const post = resolvePost(a.post_id);
      const video = resolveVideo(post?.video_id ?? null);
      return { a, post, video };
    });

  // ── AI Insight ────────────────────────────────────────────────────────────
  async function generateInsight() {
    setInsightLoading(true);
    setInsightError(null);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'weekly_insight', context: {} }),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const json = await res.json();
      setInsight(json.data as { summary: string; recommendations: string[] });
    } catch (err) {
      setInsightError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setInsightLoading(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="Analytics" subtitle="Performance across all platforms and content." />

      {/* Controls */}
      <div className="card mb-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="stat-label shrink-0">Date range</label>
          <select
            className="input"
            value={range}
            onChange={(e) => setRange(e.target.value as Range)}
          >
            {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
              <option key={r} value={r}>{RANGE_LABELS[r]}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="stat-label shrink-0">Platform</label>
          <select
            className="input"
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
          >
            <option value="all">All platforms</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6 mb-6">
        <StatCard label="Total Views"        value={compact(totalViews)}     icon={<Eye size={16} />} />
        <StatCard label="Total Likes"        value={compact(totalLikes)}     icon={<Heart size={16} />} />
        <StatCard label="Total Comments"     value={compact(totalComments)}  icon={<MessageCircle size={16} />} />
        <StatCard label="Total Shares"       value={compact(totalShares)}    icon={<Share2 size={16} />} />
        <StatCard label="Click-throughs"     value={compact(totalClicks)}    icon={<MousePointerClick size={16} />} />
        <StatCard label="New Followers"      value={compact(totalFollowers)} icon={<UserPlus size={16} />} accent />
      </div>

      {/* Views over time line chart */}
      <div className="mb-6">
        <SectionCard title={`Views over time per platform — ${RANGE_LABELS[range]}`}>
          {filteredAnalytics.length === 0 ? (
            <EmptyState message="No analytics data for the selected filters." />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeSeriesData}>
                  <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={CHART_TICK}
                    axisLine={CHART_AXIS}
                    tickLine={false}
                    interval={Math.floor(N / 7)}
                  />
                  <YAxis
                    tick={CHART_TICK}
                    axisLine={CHART_AXIS}
                    tickLine={false}
                    tickFormatter={(v: number) => compact(v)}
                  />
                  <Tooltip {...CHART_TOOLTIP} formatter={(v: number) => compact(v)} />
                  <Legend {...CHART_LEGEND} />
                  {chartPlatforms.map((p) => (
                    <Line
                      key={p}
                      type="monotone"
                      dataKey={p}
                      stroke={PLATFORM_COLORS[p] ?? GOLD}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Top 10 videos */}
      <div className="mb-6">
        <SectionCard title="Top 10 videos by views">
          {top10Videos.length === 0 ? (
            <EmptyState message="No video view data available." />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top10Videos} layout="vertical" margin={{ left: 0, right: 24 }}>
                  <CartesianGrid stroke={CHART_GRID} horizontal={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={150}
                    tick={{ ...CHART_TICK, fontSize: 11 }}
                    axisLine={CHART_AXIS}
                    tickLine={false}
                  />
                  <XAxis
                    type="number"
                    tick={CHART_TICK}
                    axisLine={CHART_AXIS}
                    tickLine={false}
                    tickFormatter={(v: number) => compact(v)}
                  />
                  <Tooltip {...CHART_TOOLTIP} formatter={(v: number) => compact(v)} />
                  <Bar dataKey="views" fill={GOLD} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Pillar & Hook side-by-side */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Performance by content pillar">
          {pillarData.every((d) => d.views === 0) ? (
            <EmptyState message="No pillar data available." />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pillarData} margin={{ left: 0, right: 16 }}>
                  <CartesianGrid stroke={CHART_GRID} vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ ...CHART_TICK, fontSize: 10 }}
                    axisLine={CHART_AXIS}
                    tickLine={false}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={48}
                  />
                  <YAxis
                    tick={CHART_TICK}
                    axisLine={CHART_AXIS}
                    tickLine={false}
                    tickFormatter={(v: number) => compact(v)}
                  />
                  <Tooltip {...CHART_TOOLTIP} formatter={(v: number) => compact(v)} />
                  <Bar dataKey="views" fill="#4a7fc0" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Performance by hook style">
          {hookData.every((d) => d.views === 0) ? (
            <EmptyState message="No hook style data available." />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hookData} margin={{ left: 0, right: 16 }}>
                  <CartesianGrid stroke={CHART_GRID} vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ ...CHART_TICK, fontSize: 10 }}
                    axisLine={CHART_AXIS}
                    tickLine={false}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={48}
                  />
                  <YAxis
                    tick={CHART_TICK}
                    axisLine={CHART_AXIS}
                    tickLine={false}
                    tickFormatter={(v: number) => compact(v)}
                  />
                  <Tooltip {...CHART_TOOLTIP} formatter={(v: number) => compact(v)} />
                  <Bar dataKey="views" fill="#e8c766" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Best performing posts table */}
      <div className="mb-6">
        <SectionCard title="Best performing posts this period">
          {bestPosts.length === 0 ? (
            <EmptyState message="No post data for the selected filters." />
          ) : (
            <DataTable
              head={
                <>
                  <Th>Platform</Th>
                  <Th>Video</Th>
                  <Th className="text-right">Views</Th>
                  <Th className="text-right">Likes</Th>
                  <Th className="text-right">Comments</Th>
                  <Th className="text-right">Shares</Th>
                </>
              }
            >
              {bestPosts.map(({ a, post, video }) => (
                <tr key={a.id}>
                  <Td>
                    <PlatformIcon platform={a.platform} size={15} withLabel />
                  </Td>
                  <Td>
                    <span className="text-white/80">
                      {(video?.title ?? post?.title ?? 'Untitled').slice(0, 36)}
                      {(video?.title ?? post?.title ?? '').length > 36 ? '…' : ''}
                    </span>
                  </Td>
                  <Td className="text-right tabular-nums text-white/70">{compact(a.views)}</Td>
                  <Td className="text-right tabular-nums text-white/70">{compact(a.likes)}</Td>
                  <Td className="text-right tabular-nums text-white/70">{compact(a.comments)}</Td>
                  <Td className="text-right tabular-nums text-white/70">{compact(a.shares)}</Td>
                </tr>
              ))}
            </DataTable>
          )}
        </SectionCard>
      </div>

      {/* Weekly AI Insight */}
      <SectionCard title="Weekly AI Insight">
        <div className="rounded-lg border border-gold/20 bg-gold/5 p-5">
          {!insight && !insightLoading && (
            <div className="flex flex-col items-start gap-4">
              <p className="text-sm text-white/50">
                Click the button below to generate an AI-powered insight based on your current analytics.
              </p>
              <button className="btn btn-gold flex items-center gap-2" onClick={generateInsight}>
                <Sparkles size={15} />
                Generate insight
              </button>
              {insightError && (
                <p className="text-xs text-rose-400">{insightError}</p>
              )}
            </div>
          )}

          {insightLoading && (
            <div className="flex items-center gap-3 py-6 text-sm text-white/50">
              <Loader2 size={16} className="animate-spin text-gold" />
              Analysing your data…
            </div>
          )}

          {insight && !insightLoading && (
            <div>
              <p className="mb-4 text-sm leading-relaxed text-white/85">{insight.summary}</p>
              {insight.recommendations.length > 0 && (
                <ul className="space-y-2">
                  {insight.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-white/75">
                      <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-gold" />
                      {rec}
                    </li>
                  ))}
                </ul>
              )}
              <button
                className="btn btn-ghost mt-4 flex items-center gap-1.5 text-xs"
                onClick={() => { setInsight(null); setInsightError(null); }}
              >
                <Sparkles size={12} />
                Regenerate
              </button>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
