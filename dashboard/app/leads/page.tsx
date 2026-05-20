'use client';

import { useState, useEffect, useCallback } from 'react';
import { Download, Search, LayoutGrid, Table as TableIcon } from 'lucide-react';
import { useTable } from '@/lib/useTable';
import { PageHeader, EmptyState, DataTable, Th, Td } from '@/components/ui/primitives';
import { LeadStatusBadge } from '@/components/ui/Badge';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { SlideOver } from '@/components/ui/SlideOver';
import { dateShort, timeAgo, downloadCsv } from '@/lib/format';
import { NOW } from '@/lib/placeholder';
import type { Lead, Video, ConversationTurn } from '@shared/types';
import { PLATFORMS } from '@shared/constants';

type LeadStatus = Lead['status'];

const PIPELINE_ORDER: LeadStatus[] = [
  'new',
  'contacted',
  'qualified',
  'booked',
  'converted',
  'dead',
];

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  booked: 'Booked',
  converted: 'Converted',
  dead: 'Dead',
};

type DateRange = 'all' | 'last7' | 'last30';

export default function LeadsPage() {
  const { rows: rawLeads } = useTable<Lead>('leads');
  const { rows: videos } = useTable<Video>('videos');

  const [leads, setLeads] = useState<Lead[]>([]);
  const [view, setView] = useState<'board' | 'table'>('board');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [search, setSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<LeadStatus | null>(null);

  // Sync once (and on rawLeads changes) into local state so we can mutate
  useEffect(() => {
    setLeads(rawLeads);
  }, [rawLeads]);

  const videoTitle = useCallback(
    (id: string | null) => videos.find((v) => v.id === id)?.title ?? 'Untitled',
    [videos],
  );

  // --- Filtering ---
  const filteredLeads = leads.filter((l) => {
    if (platformFilter !== 'all' && l.source_platform !== platformFilter) return false;
    if (statusFilter !== 'all' && l.status !== statusFilter) return false;
    if (dateRange !== 'all') {
      const created = new Date(l.created_at).getTime();
      const msAgo = dateRange === 'last7' ? 7 * 86_400_000 : 30 * 86_400_000;
      if (created < NOW.getTime() - msAgo) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      const name = (l.name ?? '').toLowerCase();
      const handle = (l.handle ?? '').toLowerCase();
      const trigger = (l.trigger_word ?? '').toLowerCase();
      if (!name.includes(q) && !handle.includes(q) && !trigger.includes(q)) return false;
    }
    return true;
  });

  // --- Status update ---
  const updateStatus = (id: string, status: LeadStatus) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    if (selectedLead?.id === id) {
      setSelectedLead((prev) => (prev ? { ...prev, status } : prev));
    }
  };

  // --- CSV export ---
  const handleExport = () => {
    downloadCsv(
      'leads.csv',
      leads.map((l) => ({
        name: l.name,
        handle: l.handle,
        platform: l.source_platform,
        status: l.status,
        trigger: l.trigger_word,
        email: l.email,
        created: l.created_at,
        notes: l.notes,
      })),
    );
  };

  // --- Drag and drop handlers ---
  const handleDragStart = (id: string) => setDraggedId(id);
  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverStatus(null);
  };
  const handleDragOver = (e: React.DragEvent, status: LeadStatus) => {
    e.preventDefault();
    setDragOverStatus(status);
  };
  const handleDrop = (e: React.DragEvent, status: LeadStatus) => {
    e.preventDefault();
    if (draggedId) updateStatus(draggedId, status);
    setDraggedId(null);
    setDragOverStatus(null);
  };

  const leadsForStatus = (status: LeadStatus) =>
    filteredLeads.filter((l) => l.status === status);

  const totalFiltered = filteredLeads.length;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Leads & CRM"
        subtitle="Manage and track every lead captured from your content."
        actions={
          <button className="btn btn-ghost flex items-center gap-1.5" onClick={handleExport}>
            <Download size={14} />
            Export CSV
          </button>
        }
      />

      {/* Filters */}
      <div className="card mb-5">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative min-w-[200px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
            <input
              className="input w-full pl-8"
              placeholder="Search name, handle, trigger…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Platform filter */}
          <select
            className="input"
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
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
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            {PIPELINE_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>

          {/* Date range */}
          <select
            className="input"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
          >
            <option value="all">All Time</option>
            <option value="last7">Last 7 Days</option>
            <option value="last30">Last 30 Days</option>
          </select>

          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-border bg-surface-2 p-1">
            <button
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                view === 'board'
                  ? 'bg-gold/15 text-gold'
                  : 'text-white/45 hover:text-white/70'
              }`}
              onClick={() => setView('board')}
            >
              <LayoutGrid size={13} />
              Board
            </button>
            <button
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                view === 'table'
                  ? 'bg-gold/15 text-gold'
                  : 'text-white/45 hover:text-white/70'
              }`}
              onClick={() => setView('table')}
            >
              <TableIcon size={13} />
              Table
            </button>
          </div>
        </div>
      </div>

      {/* Board View */}
      {view === 'board' && (
        <>
          {totalFiltered === 0 ? (
            <EmptyState message="No leads match your filters." />
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {PIPELINE_ORDER.map((status) => {
                const col = leadsForStatus(status);
                const isDead = status === 'dead';
                const isOver = dragOverStatus === status;
                return (
                  <div
                    key={status}
                    className={`flex min-h-[300px] w-64 shrink-0 flex-col rounded-xl border transition-colors ${
                      isOver
                        ? 'border-gold/40 bg-gold/5'
                        : isDead
                          ? 'border-border/50 bg-surface/50'
                          : 'border-border bg-surface'
                    }`}
                    onDragOver={(e) => handleDragOver(e, status)}
                    onDragLeave={() => setDragOverStatus(null)}
                    onDrop={(e) => handleDrop(e, status)}
                  >
                    {/* Column header */}
                    <div
                      className={`flex items-center justify-between border-b px-3 py-2.5 ${
                        isDead ? 'border-border/40' : 'border-border'
                      }`}
                    >
                      <span
                        className={`text-xs font-semibold uppercase tracking-wider ${
                          isDead ? 'text-white/25' : 'text-white/60'
                        }`}
                      >
                        {STATUS_LABELS[status]}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          isDead
                            ? 'bg-white/5 text-white/25'
                            : 'bg-gold/15 text-gold'
                        }`}
                      >
                        {col.length}
                      </span>
                    </div>

                    {/* Cards */}
                    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
                      {col.map((lead) => (
                        <div
                          key={lead.id}
                          draggable
                          onDragStart={() => handleDragStart(lead.id)}
                          onDragEnd={handleDragEnd}
                          onClick={() => setSelectedLead(lead)}
                          className={`cursor-pointer rounded-lg border p-3 transition-all hover:border-gold/30 hover:bg-surface-2 ${
                            draggedId === lead.id
                              ? 'opacity-40 scale-95'
                              : isDead
                                ? 'border-border/40 bg-surface/60'
                                : 'border-border bg-surface-2/60'
                          }`}
                        >
                          {/* Name + platform */}
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span
                              className={`truncate text-sm font-medium ${
                                isDead ? 'text-white/40' : 'text-white/90'
                              }`}
                            >
                              {lead.name ?? lead.handle ?? 'Unknown'}
                            </span>
                            <PlatformIcon platform={lead.source_platform} size={14} />
                          </div>

                          {/* Trigger word */}
                          {lead.trigger_word && (
                            <span className="pill mb-2 bg-gold/15 text-gold border border-gold/30 text-[10px]">
                              {lead.trigger_word}
                            </span>
                          )}

                          {/* Source video */}
                          <div
                            className={`mt-1 truncate text-xs ${
                              isDead ? 'text-white/25' : 'text-white/40'
                            }`}
                          >
                            {videoTitle(lead.source_video_id)}
                          </div>
                        </div>
                      ))}

                      {col.length === 0 && (
                        <div className="flex flex-1 items-center justify-center py-8 text-xs text-white/20">
                          Drop leads here
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Table View */}
      {view === 'table' && (
        <>
          {totalFiltered === 0 ? (
            <EmptyState message="No leads match your filters." />
          ) : (
            <DataTable
              head={
                <>
                  <Th>Name / Handle</Th>
                  <Th>Platform</Th>
                  <Th>Source Video</Th>
                  <Th>Trigger</Th>
                  <Th>Status</Th>
                  <Th>Captured</Th>
                  <Th>Email</Th>
                  <Th>Notes</Th>
                </>
              }
            >
              {filteredLeads.map((lead) => (
                <tr
                  key={lead.id}
                  className="row-hover cursor-pointer"
                  onClick={() => setSelectedLead(lead)}
                >
                  <Td>
                    <div className="font-medium text-white/90">
                      {lead.name ?? lead.handle ?? '—'}
                    </div>
                    {lead.name && lead.handle && (
                      <div className="text-xs text-white/40">{lead.handle}</div>
                    )}
                  </Td>
                  <Td>
                    <PlatformIcon platform={lead.source_platform} size={15} withLabel />
                  </Td>
                  <Td>
                    <span className="max-w-[180px] truncate block text-white/70 text-sm">
                      {videoTitle(lead.source_video_id)}
                    </span>
                  </Td>
                  <Td>
                    {lead.trigger_word ? (
                      <span className="pill bg-gold/15 text-gold border border-gold/30">
                        {lead.trigger_word}
                      </span>
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                  </Td>
                  <Td>
                    <LeadStatusBadge status={lead.status} />
                  </Td>
                  <Td className="text-white/55 text-sm">{dateShort(lead.created_at)}</Td>
                  <Td className="text-white/55 text-sm">{lead.email ?? '—'}</Td>
                  <Td>
                    <span className="max-w-[160px] truncate block text-white/45 text-xs">
                      {lead.notes || '—'}
                    </span>
                  </Td>
                </tr>
              ))}
            </DataTable>
          )}
        </>
      )}

      {/* SlideOver Detail */}
      <SlideOver
        open={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        title={selectedLead?.name ?? selectedLead?.handle ?? 'Lead'}
        subtitle={
          selectedLead
            ? `${selectedLead.source_platform ?? 'Unknown'} · captured ${timeAgo(selectedLead.created_at)}`
            : undefined
        }
        width="max-w-2xl"
      >
        {selectedLead && (
          <LeadDetail
            lead={selectedLead}
            videoTitle={videoTitle}
            onStatusChange={(s) => updateStatus(selectedLead.id, s)}
          />
        )}
      </SlideOver>
    </div>
  );
}

// ---- Lead Detail (inside SlideOver) ----

function LeadDetail({
  lead,
  videoTitle,
  onStatusChange,
}: {
  lead: Lead;
  videoTitle: (id: string | null) => string;
  onStatusChange: (s: LeadStatus) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* Meta fields */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Status">
          <div className="flex items-center gap-2">
            <LeadStatusBadge status={lead.status} />
            <select
              className="input text-xs py-0.5 px-2"
              value={lead.status}
              onChange={(e) => onStatusChange(e.target.value as LeadStatus)}
            >
              {PIPELINE_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </Field>

        <Field label="Platform">
          <PlatformIcon platform={lead.source_platform} size={15} withLabel />
        </Field>

        <Field label="Email">
          <span className="text-sm text-white/75">{lead.email ?? '—'}</span>
        </Field>

        <Field label="Trigger Word">
          {lead.trigger_word ? (
            <span className="pill bg-gold/15 text-gold border border-gold/30">
              {lead.trigger_word}
            </span>
          ) : (
            <span className="text-white/30">—</span>
          )}
        </Field>

        <Field label="Source Video" className="col-span-2">
          <span className="text-sm text-white/75">{videoTitle(lead.source_video_id)}</span>
        </Field>

        {lead.notes && (
          <Field label="Notes" className="col-span-2">
            <span className="text-sm text-white/75">{lead.notes}</span>
          </Field>
        )}
      </div>

      {/* Conversation log */}
      <div>
        <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
          Conversation Log
        </div>

        {lead.conversation_log.length === 0 ? (
          <EmptyState message="No conversation yet." />
        ) : (
          <div className="flex flex-col gap-3">
            {lead.conversation_log.map((turn, i) => (
              <ChatBubble key={i} turn={turn} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="stat-label mb-1">{label}</div>
      {children}
    </div>
  );
}

function ChatBubble({ turn }: { turn: ConversationTurn }) {
  const isAgent = turn.role === 'agent';
  return (
    <div className={`flex flex-col gap-1 ${isAgent ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isAgent
            ? 'bg-navy-light/40 text-sky-100 rounded-tr-sm'
            : 'bg-surface-2 text-white/85 rounded-tl-sm'
        }`}
      >
        {turn.text}
      </div>
      {turn.at && (
        <span className="px-1 text-[10px] text-white/30">{timeAgo(turn.at)}</span>
      )}
    </div>
  );
}
