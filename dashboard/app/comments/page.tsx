'use client';

import { useState, useEffect, useCallback } from 'react';
import { Check, X, Pencil, Search, MessageSquare, Send } from 'lucide-react';
import { useTable } from '@/lib/useTable';
import { NOW } from '@/lib/placeholder';
import { timeAgo } from '@/lib/format';
import {
  PageHeader,
  EmptyState,
  DataTable,
  Th,
  Td,
} from '@/components/ui/primitives';
import { SentimentBadge, ResponseStatusBadge } from '@/components/ui/Badge';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { SlideOver } from '@/components/ui/SlideOver';
import type { Comment, Post, Video } from '@shared/types';

// ── Local comment state shape ───────────────────────────────────────────────
interface LocalComment extends Comment {
  _responseText: string;
}

type Tab = 'all' | 'queue';
type Sentiment = 'all' | 'positive' | 'question' | 'negative' | 'spam' | 'trigger';

// ── Helpers ──────────────────────────────────────────────────────────────────
// NOW is used to suppress any accidental use of live Date.now()
void NOW;

function truncate(text: string | null, max = 50): string {
  if (!text) return '—';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function CommentsPage() {
  const { rows: rawComments, loading } = useTable<Comment>('comments');
  const { rows: posts } = useTable<Post>('posts');
  const { rows: videos } = useTable<Video>('videos');

  // ── Local mutable comment state ──────────────────────────────────────────
  const [comments, setComments] = useState<LocalComment[]>([]);

  useEffect(() => {
    setComments(
      rawComments.map((c) => ({
        ...c,
        _responseText: c.response_text ?? '',
      })),
    );
  }, [rawComments]);

  // ── Tab + filter state ────────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>('all');
  const [sentimentFilter, setSentimentFilter] = useState<Sentiment>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  // ── SlideOver state ───────────────────────────────────────────────────────
  const [selected, setSelected] = useState<LocalComment | null>(null);

  // ── Derived data ───────────────────────────────────────────────────────────
  const videoTitle = useCallback(
    (postId: string | null): string => {
      if (!postId) return 'Untitled';
      const post = posts.find((p) => p.id === postId);
      if (!post) return 'Untitled';
      const video = videos.find((v) => v.id === post.video_id);
      return video?.title ?? 'Untitled';
    },
    [posts, videos],
  );

  const platforms = Array.from(
    new Set(comments.map((c) => c.platform).filter((p): p is string => !!p)),
  ).sort();

  const pendingQueue = comments.filter((c) => c.response_status === 'pending');

  // ── Filtered rows (All tab) ────────────────────────────────────────────────
  const filteredComments = comments.filter((c) => {
    if (sentimentFilter !== 'all' && c.sentiment !== sentimentFilter) return false;
    if (platformFilter !== 'all' && c.platform !== platformFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(c.comment_text ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // ── Mutation helpers ──────────────────────────────────────────────────────
  function updateComment(id: string, patch: Partial<LocalComment>) {
    setComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
    if (selected?.id === id) {
      setSelected((prev) => (prev ? { ...prev, ...patch } : prev));
    }
  }

  function handleApprove(c: LocalComment) {
    updateComment(c.id, {
      response_status: 'posted',
      response_text: c._responseText,
    });
  }

  function handleSkip(c: LocalComment) {
    updateComment(c.id, { response_status: 'skipped' });
  }

  function handleResponseTextChange(id: string, text: string) {
    updateComment(id, { _responseText: text });
  }

  // Keep selected in sync after mutations
  const selectedSync = selected
    ? (comments.find((c) => c.id === selected.id) ?? selected)
    : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Comments"
        subtitle="Approved responses are automatically posted to the platform via the API."
      />

      {/* ── Tabs ── */}
      <div className="mb-5 flex items-center gap-1 rounded-xl border border-border bg-surface-2 p-1 w-fit">
        <button
          onClick={() => setTab('all')}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === 'all'
              ? 'bg-surface text-white shadow'
              : 'text-white/50 hover:text-white/80'
          }`}
        >
          All Comments
        </button>
        <button
          onClick={() => setTab('queue')}
          className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === 'queue'
              ? 'bg-surface text-white shadow'
              : 'text-white/50 hover:text-white/80'
          }`}
        >
          Response Queue
          {pendingQueue.length > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold/20 px-1.5 text-xs font-semibold text-gold">
              {pendingQueue.length}
            </span>
          )}
        </button>
      </div>

      {/* ── All Comments Tab ── */}
      {tab === 'all' && (
        <>
          {/* Filters */}
          <div className="card mb-5">
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 min-w-48">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35"
                />
                <input
                  type="text"
                  placeholder="Search comments…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input w-full pl-8"
                />
              </div>

              {/* Sentiment filter */}
              <select
                value={sentimentFilter}
                onChange={(e) => setSentimentFilter(e.target.value as Sentiment)}
                className="input min-w-36"
              >
                <option value="all">All Sentiments</option>
                <option value="positive">Positive</option>
                <option value="question">Question</option>
                <option value="negative">Negative</option>
                <option value="spam">Spam</option>
                <option value="trigger">Trigger</option>
              </select>

              {/* Platform filter */}
              <select
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value)}
                className="input min-w-36"
              >
                <option value="all">All Platforms</option>
                {platforms.map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-16 text-white/40 text-sm">
              Loading…
            </div>
          ) : filteredComments.length === 0 ? (
            <EmptyState
              message="No comments match your filters."
              icon={<MessageSquare size={28} className="text-white/20" />}
            />
          ) : (
            <DataTable
              head={
                <>
                  <Th>Platform</Th>
                  <Th>Video</Th>
                  <Th>Commenter</Th>
                  <Th>Comment</Th>
                  <Th>Sentiment</Th>
                  <Th>Response</Th>
                  <Th>Date</Th>
                </>
              }
            >
              {filteredComments.map((c) => (
                <tr
                  key={c.id}
                  className="row-hover cursor-pointer"
                  onClick={() => setSelected(c)}
                >
                  <Td>
                    <PlatformIcon platform={c.platform} />
                  </Td>
                  <Td className="max-w-40">
                    <span className="block truncate text-white/75 text-sm">
                      {truncate(videoTitle(c.post_id), 40)}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-sm text-white/80">{c.commenter_handle ?? '—'}</span>
                  </Td>
                  <Td className="max-w-64">
                    <span className="block truncate text-sm text-white/65">
                      {truncate(c.comment_text, 55)}
                    </span>
                  </Td>
                  <Td>
                    <SentimentBadge sentiment={c.sentiment} />
                  </Td>
                  <Td>
                    <ResponseStatusBadge status={c.response_status} />
                  </Td>
                  <Td>
                    <span className="text-xs text-white/45">{timeAgo(c.created_at)}</span>
                  </Td>
                </tr>
              ))}
            </DataTable>
          )}
        </>
      )}

      {/* ── Response Queue Tab ── */}
      {tab === 'queue' && (
        <QueueTab
          queue={pendingQueue}
          videoTitle={videoTitle}
          onApprove={handleApprove}
          onSkip={handleSkip}
          onResponseTextChange={handleResponseTextChange}
        />
      )}

      {/* ── SlideOver: comment detail ── */}
      <SlideOver
        open={!!selectedSync}
        onClose={() => setSelected(null)}
        title={selectedSync?.commenter_handle ?? 'Comment'}
        subtitle={
          selectedSync ? (
            <span className="flex items-center gap-2">
              <PlatformIcon platform={selectedSync.platform} size={13} />
              <span>{timeAgo(selectedSync.created_at)}</span>
            </span>
          ) : undefined
        }
      >
        {selectedSync && (
          <SlideOverContent
            comment={selectedSync}
            videoTitle={videoTitle(selectedSync.post_id)}
            onApprove={handleApprove}
            onSkip={handleSkip}
            onResponseTextChange={handleResponseTextChange}
            onClose={() => setSelected(null)}
          />
        )}
      </SlideOver>
    </div>
  );
}

// ── Queue Tab ─────────────────────────────────────────────────────────────────
function QueueTab({
  queue,
  videoTitle,
  onApprove,
  onSkip,
  onResponseTextChange,
}: {
  queue: LocalComment[];
  videoTitle: (postId: string | null) => string;
  onApprove: (c: LocalComment) => void;
  onSkip: (c: LocalComment) => void;
  onResponseTextChange: (id: string, text: string) => void;
}) {
  if (queue.length === 0) {
    return (
      <EmptyState
        message="No responses awaiting approval — you're all caught up."
        icon={<Send size={28} className="text-white/20" />}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {queue.map((c) => (
        <QueueCard
          key={c.id}
          comment={c}
          videoTitle={videoTitle(c.post_id)}
          onApprove={onApprove}
          onSkip={onSkip}
          onResponseTextChange={onResponseTextChange}
        />
      ))}
    </div>
  );
}

// ── Queue Card ────────────────────────────────────────────────────────────────
function QueueCard({
  comment,
  videoTitle,
  onApprove,
  onSkip,
  onResponseTextChange,
}: {
  comment: LocalComment;
  videoTitle: string;
  onApprove: (c: LocalComment) => void;
  onSkip: (c: LocalComment) => void;
  onResponseTextChange: (id: string, text: string) => void;
}) {
  const [posted, setPosted] = useState(false);

  function handleApprove() {
    setPosted(true);
    onApprove(comment);
  }

  return (
    <div className="card flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <PlatformIcon platform={comment.platform} size={15} />
          <span className="font-medium text-white text-sm">
            {comment.commenter_handle ?? '—'}
          </span>
          <SentimentBadge sentiment={comment.sentiment} />
        </div>
        <div className="flex items-center gap-2">
          {videoTitle && (
            <span className="hidden md:block text-xs text-white/40 truncate max-w-52">
              {videoTitle}
            </span>
          )}
          <span className="text-xs text-white/35">{timeAgo(comment.created_at)}</span>
        </div>
      </div>

      {/* Original comment */}
      <blockquote className="rounded-lg border-l-2 border-border bg-surface-2 px-4 py-3 text-sm text-white/70 italic">
        {comment.comment_text ?? '—'}
      </blockquote>

      {/* Drafted response */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-white/40">
          Claude&apos;s drafted response
        </label>
        <textarea
          className="input min-h-24 resize-y text-sm leading-relaxed"
          value={comment._responseText}
          onChange={(e) => onResponseTextChange(comment.id, e.target.value)}
          placeholder="No response drafted yet…"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {posted ? (
          <span className="flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-300 border border-emerald-500/25">
            <Check size={13} />
            posted
          </span>
        ) : (
          <>
            <button
              onClick={handleApprove}
              className="btn btn-gold flex items-center gap-1.5 text-sm"
            >
              <Check size={14} />
              Approve &amp; Post
            </button>
            <button
              onClick={() => onSkip(comment)}
              className="btn btn-ghost flex items-center gap-1.5 text-sm"
            >
              <X size={14} />
              Skip
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── SlideOver Content ─────────────────────────────────────────────────────────
function SlideOverContent({
  comment,
  videoTitle,
  onApprove,
  onSkip,
  onResponseTextChange,
  onClose,
}: {
  comment: LocalComment;
  videoTitle: string;
  onApprove: (c: LocalComment) => void;
  onSkip: (c: LocalComment) => void;
  onResponseTextChange: (id: string, text: string) => void;
  onClose: () => void;
}) {
  const isActioned =
    comment.response_status === 'posted' || comment.response_status === 'skipped';

  function handleApprove() {
    onApprove(comment);
    onClose();
  }

  function handleSkip() {
    onSkip(comment);
    onClose();
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-3">
        <PlatformIcon platform={comment.platform} withLabel size={15} />
        <SentimentBadge sentiment={comment.sentiment} />
        <ResponseStatusBadge status={comment.response_status} />
      </div>

      {/* Video */}
      {videoTitle && (
        <div>
          <div className="stat-label mb-1">Video</div>
          <div className="text-sm text-white/75">{videoTitle}</div>
        </div>
      )}

      {/* Comment text */}
      <div>
        <div className="stat-label mb-2">Comment</div>
        <blockquote className="rounded-lg border-l-2 border-border bg-surface-2 px-4 py-3 text-sm text-white/80 leading-relaxed italic">
          {comment.comment_text ?? '—'}
        </blockquote>
      </div>

      {/* Response */}
      <div>
        <label className="stat-label mb-2 block">
          {isActioned ? 'Response' : "Claude's drafted response"}
        </label>
        <textarea
          className="input w-full min-h-28 resize-y text-sm leading-relaxed"
          value={comment._responseText}
          onChange={(e) => onResponseTextChange(comment.id, e.target.value)}
          readOnly={isActioned}
          placeholder="No response drafted yet…"
        />
      </div>

      {/* Actions */}
      {!isActioned && (
        <div className="flex items-center gap-2 flex-wrap border-t border-border pt-4">
          <button
            onClick={handleApprove}
            className="btn btn-gold flex items-center gap-1.5 text-sm"
          >
            <Check size={14} />
            Approve &amp; Post
          </button>
          <button
            onClick={handleSkip}
            className="btn btn-ghost flex items-center gap-1.5 text-sm"
          >
            <X size={14} />
            Skip
          </button>
        </div>
      )}

      {isActioned && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-white/45">
          <Pencil size={13} />
          This response has already been {comment.response_status}.
        </div>
      )}
    </div>
  );
}
