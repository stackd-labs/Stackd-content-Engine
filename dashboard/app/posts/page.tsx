'use client';

import { useState, useMemo } from 'react';
import { Search, ExternalLink, Link as LinkIcon, ArrowUpDown, Heart, MessageCircle, Eye } from 'lucide-react';
import { useTable } from '@/lib/useTable';
import { PageHeader, EmptyState, DataTable, Th, Td } from '@/components/ui/primitives';
import { PostStatusBadge } from '@/components/ui/Badge';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { SlideOver } from '@/components/ui/SlideOver';
import { compact, num, dateShort, dateTime, timeAgo } from '@/lib/format';
import { NOW } from '@/lib/placeholder';
import { PLATFORMS, PLATFORM_LABELS } from '@shared/constants';
import type { Post, Video, Analytics } from '@shared/types';

type SortKey = 'views' | 'likes' | 'posted_at';
type SortDir = 'asc' | 'desc';
type DateRange = 'all' | '7d' | '30d';

function trunc(s: string | null | undefined, n: number): string {
  if (!s) return '—';
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export default function PostsPage() {
  const { rows: posts } = useTable<Post>('posts');
  const { rows: videos } = useTable<Video>('videos');
  const { rows: analytics } = useTable<Analytics>('analytics');

  const [platform, setPlatform] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('posted_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<Post | null>(null);

  const videoTitle = (id: string | null) =>
    videos.find((v) => v.id === id)?.title ?? 'Untitled';

  const analyticsFor = (postId: string) =>
    analytics.find((a) => a.post_id === postId) ?? null;

  const cutoff7 = new Date(NOW.getTime() - 7 * 86_400_000);
  const cutoff30 = new Date(NOW.getTime() - 30 * 86_400_000);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return posts.filter((p) => {
      if (platform !== 'all' && p.platform !== platform) return false;
      if (status !== 'all' && p.status !== status) return false;
      if (dateRange !== 'all' && p.posted_at) {
        const d = new Date(p.posted_at);
        if (dateRange === '7d' && d < cutoff7) return false;
        if (dateRange === '30d' && d < cutoff30) return false;
      }
      if (q) {
        const haystack = [p.caption, p.title].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, platform, status, dateRange, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av = 0;
      let bv = 0;
      if (sortKey === 'views') {
        av = analyticsFor(a.id)?.views ?? 0;
        bv = analyticsFor(b.id)?.views ?? 0;
      } else if (sortKey === 'likes') {
        av = analyticsFor(a.id)?.likes ?? 0;
        bv = analyticsFor(b.id)?.likes ?? 0;
      } else {
        av = a.posted_at ? new Date(a.posted_at).getTime() : 0;
        bv = b.posted_at ? new Date(b.posted_at).getTime() : 0;
      }
      return sortDir === 'desc' ? bv - av : av - bv;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortKey, sortDir, analytics]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const SortHeader = ({ label, colKey }: { label: string; colKey: SortKey }) => (
    <button
      onClick={() => toggleSort(colKey)}
      className="flex items-center gap-1 whitespace-nowrap hover:text-white transition-colors"
    >
      {label}
      <ArrowUpDown
        size={12}
        className={sortKey === colKey ? 'text-gold' : 'text-white/30'}
      />
    </button>
  );

  const slidePost = selected;
  const slideAnalytics = slidePost ? analyticsFor(slidePost.id) : null;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Posts"
        subtitle={`${filtered.length} of ${posts.length} post${posts.length !== 1 ? 's' : ''}`}
      />

      {/* Filter bar */}
      <div className="card mb-5">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative min-w-[180px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none" />
            <input
              className="input w-full pl-8"
              placeholder="Search caption or title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Platform filter */}
          <select
            className="input min-w-[130px]"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            <option value="all">All platforms</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>

          {/* Status filter */}
          <select
            className="input min-w-[120px]"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="posted">Posted</option>
            <option value="scheduled">Scheduled</option>
            <option value="failed">Failed</option>
          </select>

          {/* Date range */}
          <select
            className="input min-w-[130px]"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
          >
            <option value="all">All time</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <EmptyState message="No posts match your filters." />
      ) : (
        <DataTable
          head={
            <>
              <Th>Platform</Th>
              <Th>Video</Th>
              <Th>Caption</Th>
              <Th>Status</Th>
              <Th>
                <SortHeader label="Posted" colKey="posted_at" />
              </Th>
              <Th>
                <SortHeader label="Views" colKey="views" />
              </Th>
              <Th>
                <SortHeader label="Likes" colKey="likes" />
              </Th>
              <Th>Comments</Th>
              <Th>UTM</Th>
              <Th>URL</Th>
            </>
          }
        >
          {sorted.map((post) => {
            const an = analyticsFor(post.id);
            return (
              <tr
                key={post.id}
                className="row-hover cursor-pointer"
                onClick={() => setSelected(post)}
              >
                <Td>
                  <PlatformIcon platform={post.platform} size={16} />
                </Td>
                <Td className="max-w-[160px]">
                  <span className="block truncate text-sm text-white/80">
                    {trunc(videoTitle(post.video_id), 36)}
                  </span>
                </Td>
                <Td className="max-w-[200px]">
                  <span className="block truncate text-sm text-white/55">
                    {trunc(post.caption, 40)}
                  </span>
                </Td>
                <Td>
                  <PostStatusBadge status={post.status} />
                </Td>
                <Td>
                  <span className="text-sm text-white/65 whitespace-nowrap">
                    {post.status === 'scheduled'
                      ? dateShort(post.scheduled_for)
                      : dateShort(post.posted_at)}
                  </span>
                </Td>
                <Td>
                  <span className="flex items-center gap-1 text-sm text-white/75 whitespace-nowrap">
                    <Eye size={12} className="text-white/30 shrink-0" />
                    {an ? compact(an.views) : '—'}
                  </span>
                </Td>
                <Td>
                  <span className="flex items-center gap-1 text-sm text-white/75 whitespace-nowrap">
                    <Heart size={12} className="text-white/30 shrink-0" />
                    {an ? compact(an.likes) : '—'}
                  </span>
                </Td>
                <Td>
                  <span className="flex items-center gap-1 text-sm text-white/75 whitespace-nowrap">
                    <MessageCircle size={12} className="text-white/30 shrink-0" />
                    {an ? compact(an.comments) : '—'}
                  </span>
                </Td>
                <Td>
                  {post.utm_link ? (
                    <a
                      href={post.utm_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-gold/10 text-gold border border-gold/25 hover:bg-gold/20 transition-colors"
                    >
                      <LinkIcon size={10} />
                      UTM
                    </a>
                  ) : (
                    <span className="text-white/25 text-xs">—</span>
                  )}
                </Td>
                <Td>
                  {post.platform_url ? (
                    <a
                      href={post.platform_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-white/40 hover:text-white/80 transition-colors"
                      title="Open on platform"
                    >
                      <ExternalLink size={14} />
                    </a>
                  ) : (
                    <span className="text-white/25 text-xs">—</span>
                  )}
                </Td>
              </tr>
            );
          })}
        </DataTable>
      )}

      {/* SlideOver detail panel */}
      <SlideOver
        open={!!slidePost}
        onClose={() => setSelected(null)}
        title={slidePost ? trunc(videoTitle(slidePost.video_id), 60) : ''}
        subtitle={
          slidePost ? (
            <span className="flex items-center gap-2">
              <PlatformIcon platform={slidePost.platform} size={14} withLabel />
            </span>
          ) : undefined
        }
        width="max-w-2xl"
      >
        {slidePost && (
          <div className="space-y-6">
            {/* Meta row */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <div className="stat-label mb-1">Status</div>
                <PostStatusBadge status={slidePost.status} />
              </div>
              <div>
                <div className="stat-label mb-1">Format</div>
                <span className="text-sm text-white/80 capitalize">{slidePost.format}</span>
              </div>
              <div>
                <div className="stat-label mb-1">
                  {slidePost.status === 'scheduled' ? 'Scheduled for' : 'Posted at'}
                </div>
                <span className="text-sm text-white/80">
                  {slidePost.status === 'scheduled'
                    ? dateTime(slidePost.scheduled_for)
                    : dateTime(slidePost.posted_at)}
                </span>
              </div>
            </div>

            {/* Caption */}
            <div>
              <div className="stat-label mb-2">Caption</div>
              <p className="rounded-lg border border-border bg-bg p-3 text-sm leading-relaxed text-white/80">
                {slidePost.caption ?? '—'}
              </p>
            </div>

            {/* Hashtags */}
            {slidePost.hashtags && slidePost.hashtags.length > 0 && (
              <div>
                <div className="stat-label mb-2">Hashtags</div>
                <div className="flex flex-wrap gap-1.5">
                  {slidePost.hashtags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs text-white/65"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Links */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {slidePost.utm_link && (
                <div>
                  <div className="stat-label mb-1.5">UTM Link</div>
                  <a
                    href={slidePost.utm_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 truncate text-xs text-gold hover:underline"
                  >
                    <LinkIcon size={12} className="shrink-0" />
                    <span className="truncate">{slidePost.utm_link}</span>
                  </a>
                </div>
              )}
              {slidePost.platform_url && (
                <div>
                  <div className="stat-label mb-1.5">Platform URL</div>
                  <a
                    href={slidePost.platform_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 truncate text-xs text-sky-400 hover:underline"
                  >
                    <ExternalLink size={12} className="shrink-0" />
                    <span className="truncate">{slidePost.platform_url}</span>
                  </a>
                </div>
              )}
            </div>

            {/* Analytics block */}
            <div>
              <div className="stat-label mb-3">Platform Analytics</div>
              {slideAnalytics ? (
                <div className="rounded-xl border border-border bg-bg p-4">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                    <div>
                      <div className="mb-0.5 text-xs text-white/40">Views</div>
                      <div className="text-lg font-semibold text-white">
                        {num(slideAnalytics.views)}
                      </div>
                    </div>
                    <div>
                      <div className="mb-0.5 text-xs text-white/40">Likes</div>
                      <div className="text-lg font-semibold text-white">
                        {num(slideAnalytics.likes)}
                      </div>
                    </div>
                    <div>
                      <div className="mb-0.5 text-xs text-white/40">Comments</div>
                      <div className="text-lg font-semibold text-white">
                        {num(slideAnalytics.comments)}
                      </div>
                    </div>
                    <div>
                      <div className="mb-0.5 text-xs text-white/40">Shares</div>
                      <div className="text-lg font-semibold text-white">
                        {num(slideAnalytics.shares)}
                      </div>
                    </div>
                    <div>
                      <div className="mb-0.5 text-xs text-white/40">Click-throughs</div>
                      <div className="text-lg font-semibold text-white">
                        {num(slideAnalytics.click_throughs)}
                      </div>
                    </div>
                    <div>
                      <div className="mb-0.5 text-xs text-white/40">Followers Gained</div>
                      <div className="text-lg font-semibold text-gold">
                        +{num(slideAnalytics.followers_gained)}
                      </div>
                    </div>
                    <div className="col-span-2 sm:col-span-3">
                      <div className="mb-0.5 text-xs text-white/40">Watch Time</div>
                      <div className="text-lg font-semibold text-white">
                        {compact(slideAnalytics.watch_time_seconds)}
                        <span className="ml-1 text-xs font-normal text-white/40">sec</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 border-t border-border pt-3 text-xs text-white/30">
                    Pulled {timeAgo(slideAnalytics.pulled_at)}
                  </div>
                </div>
              ) : (
                <EmptyState message="No analytics pulled yet." />
              )}
            </div>
          </div>
        )}
      </SlideOver>
    </div>
  );
}
