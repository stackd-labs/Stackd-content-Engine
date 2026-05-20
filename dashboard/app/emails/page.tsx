'use client';

import { useState, useMemo } from 'react';
import { Mail, Search, Sparkles, Send, Loader2, Check } from 'lucide-react';
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
import { Badge } from '@/components/ui/Badge';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { Modal } from '@/components/ui/SlideOver';
import { dateShort } from '@/lib/format';
import { NOW } from '@/lib/placeholder';
import { PLATFORMS } from '@shared/constants';
import type { EmailSubscriber, Video } from '@shared/types';

// ---- hardcoded "last 5 sent" base list -------------------------
const BASE_NEWSLETTERS: { id: string; subject: string; sentAt: string; recipients: number }[] = [
  {
    id: 'nl-005',
    subject: 'The Claude prompt that writes a week of content in 4 minutes',
    sentAt: new Date(NOW.getTime() - 7 * 86_400_000).toISOString(),
    recipients: 312,
  },
  {
    id: 'nl-004',
    subject: 'How we render 30 videos a day with zero editors',
    sentAt: new Date(NOW.getTime() - 14 * 86_400_000).toISOString(),
    recipients: 298,
  },
  {
    id: 'nl-003',
    subject: 'Build a lead magnet that prints clients while you sleep',
    sentAt: new Date(NOW.getTime() - 21 * 86_400_000).toISOString(),
    recipients: 281,
  },
  {
    id: 'nl-002',
    subject: 'Why most founders fail at delegation (and the fix)',
    sentAt: new Date(NOW.getTime() - 28 * 86_400_000).toISOString(),
    recipients: 255,
  },
  {
    id: 'nl-001',
    subject: 'The 3-tool AI stack that runs my agency on autopilot',
    sentAt: new Date(NOW.getTime() - 35 * 86_400_000).toISOString(),
    recipients: 230,
  },
];

type ModalStep = 'preview' | 'confirm' | 'success';

export default function EmailListPage() {
  const { rows } = useTable<EmailSubscriber>('emails');
  const { rows: videos } = useTable<Video>('videos');

  // ---- filter state -------------------------------------------
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');

  // ---- newsletter state ---------------------------------------
  const [newsletters, setNewsletters] = useState(BASE_NEWSLETTERS);
  const [generating, setGenerating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>('preview');
  const [generated, setGenerated] = useState<{ subject: string; body: string } | null>(null);

  // ---- derived stats ------------------------------------------
  const weekAgo = new Date(NOW.getTime() - 7 * 86_400_000);
  const total = rows.length;
  const active = rows.filter((r) => r.status === 'active').length;
  const unsubscribed = rows.filter((r) => r.status === 'unsubscribed').length;
  const newThisWeek = rows.filter((r) => new Date(r.subscribed_at) >= weekAgo).length;

  // ---- video lookup -------------------------------------------
  const videoTitle = (id: string | null): string =>
    id ? (videos.find((v) => v.id === id)?.title ?? 'Untitled') : '—';

  // ---- filtered rows ------------------------------------------
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (platformFilter !== 'all' && r.source_platform !== platformFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (dateFilter === '7' && new Date(r.subscribed_at) < weekAgo) return false;
      if (dateFilter === '30') {
        const thirtyAgo = new Date(NOW.getTime() - 30 * 86_400_000);
        if (new Date(r.subscribed_at) < thirtyAgo) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.subscriber_email.toLowerCase().includes(q) &&
          !(r.first_name ?? '').toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [rows, platformFilter, statusFilter, dateFilter, search, weekAgo]);

  // ---- newsletter actions -------------------------------------
  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'newsletter' }),
      });
      const json = await res.json();
      const { subject, body } = (json.data ?? json) as { subject: string; body: string };
      setGenerated({ subject, body });
      setModalStep('preview');
      setModalOpen(true);
    } catch {
      // silently ignore — no toast system available
    } finally {
      setGenerating(false);
    }
  }

  function handleConfirmSend() {
    setModalStep('confirm');
  }

  function handleFinalConfirm() {
    if (!generated) return;
    const newEntry = {
      id: `nl-${Date.now()}`,
      subject: generated.subject,
      sentAt: NOW.toISOString(),
      recipients: active,
    };
    setNewsletters((prev) => [newEntry, ...prev].slice(0, 5));
    setModalStep('success');
  }

  function handleCloseModal() {
    setModalOpen(false);
    setGenerated(null);
    setModalStep('preview');
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Email List"
        subtitle="Manage subscribers and send newsletters."
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Subscribers" value={total} icon={<Mail size={16} />} />
        <StatCard label="Active" value={active} icon={<Check size={16} />} />
        <StatCard label="Unsubscribed" value={unsubscribed} icon={<Send size={16} />} />
        <StatCard label="New This Week" value={newThisWeek} accent icon={<Sparkles size={16} />} />
      </div>

      {/* Newsletter section */}
      <div className="mt-6">
        <SectionCard title="Newsletter">
          <div className="mb-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">
              Last 5 newsletters sent
            </div>
            <div className="divide-y divide-border/60">
              {newsletters.map((nl) => (
                <div
                  key={nl.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-white/85">{nl.subject}</div>
                    <div className="text-xs text-white/40">{dateShort(nl.sentAt)}</div>
                  </div>
                  <div className="shrink-0 text-xs text-white/50">
                    {nl.recipients.toLocaleString()} recipients
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="btn btn-gold flex items-center gap-2"
          >
            {generating ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Sparkles size={15} />
            )}
            {generating ? 'Generating…' : "Generate this week's newsletter"}
          </button>
        </SectionCard>
      </div>

      {/* Subscribers section */}
      <div className="mt-6">
        <SectionCard title="Subscribers">
          {/* Filter bar */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px]">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none"
              />
              <input
                className="input w-full pl-8"
                placeholder="Search email or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Platform filter */}
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="input min-w-[130px]"
            >
              <option value="all">All Platforms</option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input min-w-[130px]"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="unsubscribed">Unsubscribed</option>
            </select>

            {/* Date range */}
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="input min-w-[120px]"
            >
              <option value="all">All Time</option>
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
            </select>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <EmptyState message="No subscribers match the current filters." />
          ) : (
            <DataTable
              head={
                <>
                  <Th>Email</Th>
                  <Th>First Name</Th>
                  <Th>Platform</Th>
                  <Th>Source Video</Th>
                  <Th>Subscribed</Th>
                  <Th>Sequence</Th>
                  <Th>Status</Th>
                </>
              }
            >
              {filtered.map((sub) => (
                <tr key={sub.id} className="row-hover">
                  <Td>
                    <span className="text-sm text-white/85">{sub.subscriber_email}</span>
                  </Td>
                  <Td>
                    <span className="text-sm text-white/70">{sub.first_name ?? '—'}</span>
                  </Td>
                  <Td>
                    <PlatformIcon platform={sub.source_platform} withLabel />
                  </Td>
                  <Td>
                    <span
                      className="max-w-[180px] truncate block text-sm text-white/60"
                      title={videoTitle(sub.source_video_id)}
                    >
                      {videoTitle(sub.source_video_id)}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-sm text-white/55">{dateShort(sub.subscribed_at)}</span>
                  </Td>
                  <Td>
                    <span className="pill bg-navy-light/40 text-sky-200 border border-navy-glow/50 text-xs">
                      Step {sub.sequence_step}
                    </span>
                  </Td>
                  <Td>
                    <Badge tone={sub.status === 'active' ? 'green' : 'grey'}>
                      {sub.status}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </DataTable>
          )}
        </SectionCard>
      </div>

      {/* Newsletter preview / confirm / success modal */}
      <Modal
        open={modalOpen}
        onClose={handleCloseModal}
        title={
          modalStep === 'success'
            ? 'Newsletter Queued'
            : modalStep === 'confirm'
            ? 'Confirm Send'
            : 'Newsletter Preview'
        }
        width="max-w-2xl"
      >
        {modalStep === 'preview' && generated && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">{generated.subject}</h2>
            <div className="rounded-xl border border-border bg-bg p-4 text-sm text-white/80 whitespace-pre-wrap max-h-[55vh] overflow-y-auto leading-relaxed">
              {generated.body}
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={handleCloseModal} className="btn btn-ghost">
                Discard
              </button>
              <button onClick={handleConfirmSend} className="btn btn-gold flex items-center gap-2">
                <Send size={14} />
                Send to {active} subscribers
              </button>
            </div>
          </div>
        )}

        {modalStep === 'confirm' && (
          <div>
            <p className="text-sm text-white/70 mb-6">
              This will send via Resend to{' '}
              <span className="font-semibold text-white">{active} active subscribers</span>.
              Are you sure you want to proceed?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setModalStep('preview')}
                className="btn btn-ghost"
              >
                Cancel
              </button>
              <button onClick={handleFinalConfirm} className="btn btn-gold flex items-center gap-2">
                <Check size={14} />
                Confirm
              </button>
            </div>
          </div>
        )}

        {modalStep === 'success' && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/30">
              <Check size={24} className="text-emerald-300" />
            </div>
            <div>
              <p className="text-base font-semibold text-white">Newsletter queued ✓</p>
              <p className="mt-1 text-sm text-white/50">
                It has been added to the sent list above.
              </p>
            </div>
            <button onClick={handleCloseModal} className="btn btn-ghost mt-2">
              Close
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
