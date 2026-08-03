'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  List,
  LayoutGrid,
  Plus,
  Loader2,
} from 'lucide-react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  parseISO,
} from 'date-fns';
import { useTable } from '@/lib/useTable';
import { authFetch } from '@/lib/authFetch';
import { PageHeader, SectionCard, EmptyState, DataTable, Th, Td } from '@/components/ui/primitives';
import { CalendarStatusBadge } from '@/components/ui/Badge';
import { SlideOver } from '@/components/ui/SlideOver';
import { dateShort } from '@/lib/format';
import { NOW } from '@/lib/placeholder';
import type { CalendarEntry } from '@shared/types';
import { DEFAULT_CONTENT_PILLARS, FORMATS } from '@shared/constants';

// ── Status dot colors for tiny chips ─────────────────────────────────────────
const STATUS_DOT: Record<string, string> = {
  planned: 'bg-white/30',
  in_production: 'bg-sky-400',
  ready: 'bg-gold',
  posted: 'bg-emerald-400',
  skipped: 'bg-rose-400',
};

const STATUS_CHIP: Record<string, string> = {
  planned: 'bg-white/8 text-white/60',
  in_production: 'bg-sky-500/15 text-sky-300',
  ready: 'bg-gold/15 text-gold',
  posted: 'bg-emerald-500/15 text-emerald-300',
  skipped: 'bg-rose-500/15 text-rose-300',
};

// ── Week day headers ──────────────────────────────────────────────────────────
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Sort keys ────────────────────────────────────────────────────────────────
type SortKey = 'scheduled_date' | 'topic';
type SortDir = 'asc' | 'desc';

// ── AI generate response shape ────────────────────────────────────────────────
interface AIPlanItem {
  scheduled_date_offset: number;
  topic: string;
  content_pillar: string;
  format: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function entryId() {
  return `cal-gen-${Math.random().toString(36).slice(2, 9)}`;
}

function offsetToDate(offset: number): string {
  const ms = NOW.getTime() + offset * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export default function CalendarPage() {
  // ── Data ──────────────────────────────────────────────────────────────────
  const { rows } = useTable<CalendarEntry>('content_calendar');
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  useEffect(() => {
    if (rows.length > 0 && entries.length === 0) setEntries(rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // ── View toggle ───────────────────────────────────────────────────────────
  const [view, setView] = useState<'month' | 'list'>('month');

  // ── Month navigation ──────────────────────────────────────────────────────
  const [monthOffset, setMonthOffset] = useState(0);
  const currentMonth = addMonths(NOW, monthOffset);
  const monthLabel = format(currentMonth, 'MMMM yyyy');

  // Calendar grid days
  const gridDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth)),
    end: endOfWeek(endOfMonth(currentMonth)),
  });

  // Entries by date
  const entriesByDate = useCallback(
    (day: Date): CalendarEntry[] =>
      entries.filter((e) => isSameDay(parseISO(e.scheduled_date), day)),
    [entries],
  );

  // ── SlideOver state ───────────────────────────────────────────────────────
  const [slideDay, setSlideDay] = useState<Date | null>(null);
  const [newTopic, setNewTopic] = useState('');
  const [newPillar, setNewPillar] = useState(DEFAULT_CONTENT_PILLARS[0]);
  const [newFormat, setNewFormat] = useState<(typeof FORMATS)[number]>('short');

  const dayEntries = slideDay ? entriesByDate(slideDay) : [];

  function addEntry() {
    if (!slideDay || !newTopic.trim()) return;
    const entry: CalendarEntry = {
      id: entryId(),
      scheduled_date: format(slideDay, 'yyyy-MM-dd'),
      topic: newTopic.trim(),
      content_pillar: newPillar,
      format: newFormat,
      status: 'planned',
      video_id: null,
      notes: null,
    };
    setEntries((prev) => [...prev, entry]);
    setNewTopic('');
  }

  // ── List sort ─────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>('scheduled_date');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sortedEntries = [...entries].sort((a, b) => {
    const av = a[sortKey] ?? '';
    const bv = b[sortKey] ?? '';
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  // Sort indicator
  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return <span className="text-white/20 ml-1">↕</span>;
    return <span className="text-gold ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  // ── AI Generate ───────────────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await authFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'calendar_plan' }),
      });
      const json = await res.json();
      const items: AIPlanItem[] = Array.isArray(json?.data) ? json.data : [];
      const generated: CalendarEntry[] = items.map((item) => ({
        id: entryId(),
        scheduled_date: offsetToDate(item.scheduled_date_offset ?? 0),
        topic: item.topic ?? 'AI-generated topic',
        content_pillar: item.content_pillar ?? DEFAULT_CONTENT_PILLARS[0],
        format: (FORMATS.includes(item.format as (typeof FORMATS)[number])
          ? item.format
          : 'short') as CalendarEntry['format'],
        status: 'planned',
        video_id: null,
        notes: null,
      }));
      setEntries((prev) => [...prev, ...generated]);
    } catch {
      // silently fail — no error toast needed per spec
    } finally {
      setGenerating(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Content Calendar"
        subtitle="Plan, track, and schedule your content pipeline."
        actions={
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center rounded-lg border border-border bg-surface-2 p-0.5">
              <button
                onClick={() => setView('month')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  view === 'month'
                    ? 'bg-surface text-white shadow-sm'
                    : 'text-white/45 hover:text-white/70'
                }`}
              >
                <LayoutGrid size={14} />
                Month
              </button>
              <button
                onClick={() => setView('list')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  view === 'list'
                    ? 'bg-surface text-white shadow-sm'
                    : 'text-white/45 hover:text-white/70'
                }`}
              >
                <List size={14} />
                List
              </button>
            </div>

            {/* Auto-generate */}
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="btn btn-gold flex items-center gap-2"
            >
              {generating ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              {generating ? 'Generating…' : 'Auto-Generate'}
            </button>
          </div>
        }
      />

      {/* ── MONTH VIEW ──────────────────────────────────────────────────────── */}
      {view === 'month' && (
        <SectionCard>
          {/* Month nav */}
          <div className="mb-5 flex items-center justify-between">
            <button
              onClick={() => setMonthOffset((n) => n - 1)}
              className="btn btn-ghost flex items-center gap-1 px-2.5 py-1.5"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center gap-2">
              <CalendarDays size={16} className="text-gold" />
              <span className="text-sm font-semibold text-white">{monthLabel}</span>
            </div>
            <button
              onClick={() => setMonthOffset((n) => n + 1)}
              className="btn btn-ghost flex items-center gap-1 px-2.5 py-1.5"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="mb-1 grid grid-cols-7 gap-px">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1 text-center text-xs font-semibold uppercase tracking-wider text-white/35">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-px rounded-xl overflow-hidden border border-border bg-border">
            {gridDays.map((day, idx) => {
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isToday = isSameDay(day, NOW);
              const dayItems = entriesByDate(day);
              const overflow = dayItems.length > 3 ? dayItems.length - 3 : 0;
              const visible = dayItems.slice(0, 3);

              return (
                <div
                  key={idx}
                  onClick={() => setSlideDay(day)}
                  className={`min-h-[100px] cursor-pointer bg-surface p-2 transition-colors hover:bg-surface-2 ${
                    !isCurrentMonth ? 'opacity-40' : ''
                  } ${isToday ? 'ring-1 ring-inset ring-gold/60' : ''}`}
                >
                  {/* Day number */}
                  <div
                    className={`mb-1.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      isToday
                        ? 'bg-gold text-bg'
                        : isCurrentMonth
                          ? 'text-white/80'
                          : 'text-white/25'
                    }`}
                  >
                    {format(day, 'd')}
                  </div>

                  {/* Entry chips */}
                  <div className="flex flex-col gap-0.5">
                    {visible.map((entry) => (
                      <div
                        key={entry.id}
                        className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] leading-tight ${STATUS_CHIP[entry.status] ?? STATUS_CHIP.planned}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[entry.status] ?? STATUS_DOT.planned}`}
                        />
                        <span className="truncate">{entry.topic}</span>
                      </div>
                    ))}
                    {overflow > 0 && (
                      <div className="px-1 text-[10px] text-white/40">+{overflow} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {Object.entries(STATUS_DOT).map(([status, dot]) => (
              <div key={status} className="flex items-center gap-1.5 text-xs text-white/40">
                <span className={`h-2 w-2 rounded-full ${dot}`} />
                {status.replace('_', ' ')}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ── LIST VIEW ───────────────────────────────────────────────────────── */}
      {view === 'list' && (
        <SectionCard title={`All Entries (${sortedEntries.length})`}>
          {sortedEntries.length === 0 ? (
            <EmptyState
              icon={<CalendarDays size={32} className="text-white/20" />}
              message="No calendar entries yet."
            />
          ) : (
            <DataTable
              head={
                <>
                  <Th>
                    <button
                      onClick={() => toggleSort('scheduled_date')}
                      className="flex items-center whitespace-nowrap hover:text-white/80"
                    >
                      Date {sortIndicator('scheduled_date')}
                    </button>
                  </Th>
                  <Th>
                    <button
                      onClick={() => toggleSort('topic')}
                      className="flex items-center hover:text-white/80"
                    >
                      Topic {sortIndicator('topic')}
                    </button>
                  </Th>
                  <Th>Pillar</Th>
                  <Th>Format</Th>
                  <Th>Status</Th>
                </>
              }
            >
              {sortedEntries.map((entry) => (
                <tr key={entry.id} className="row-hover">
                  <Td className="whitespace-nowrap text-white/55">{dateShort(entry.scheduled_date)}</Td>
                  <Td>
                    <span className="line-clamp-2 text-white/85">{entry.topic ?? '—'}</span>
                  </Td>
                  <Td>
                    <span className="pill bg-white/8 text-white/55 border border-white/10">
                      {entry.content_pillar ?? '—'}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-white/55 capitalize">{entry.format}</span>
                  </Td>
                  <Td>
                    <CalendarStatusBadge status={entry.status} />
                  </Td>
                </tr>
              ))}
            </DataTable>
          )}
        </SectionCard>
      )}

      {/* ── SLIDE OVER — Day detail ──────────────────────────────────────────── */}
      <SlideOver
        open={slideDay !== null}
        onClose={() => setSlideDay(null)}
        title={slideDay ? format(slideDay, 'EEEE, MMMM d, yyyy') : ''}
        subtitle={`${dayEntries.length} item${dayEntries.length !== 1 ? 's' : ''} scheduled`}
        width="max-w-lg"
      >
        {dayEntries.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={28} className="text-white/20" />}
            message="Nothing scheduled for this day."
          />
        ) : (
          <div className="mb-6 divide-y divide-border/60">
            {dayEntries.map((entry) => (
              <div key={entry.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white/90">{entry.topic}</div>
                  <div className="mt-0.5 text-xs text-white/40">
                    {entry.content_pillar} · {entry.format}
                  </div>
                </div>
                <CalendarStatusBadge status={entry.status} />
              </div>
            ))}
          </div>
        )}

        {/* Add content form */}
        <div className="rounded-xl border border-border bg-surface-2 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/40">
            <Plus size={12} />
            Add Content
          </div>

          <div className="space-y-3">
            {/* Topic */}
            <div>
              <label className="mb-1 block text-xs text-white/50">Topic</label>
              <input
                type="text"
                className="input w-full"
                placeholder="What's this piece about?"
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addEntry()}
              />
            </div>

            {/* Pillar */}
            <div>
              <label className="mb-1 block text-xs text-white/50">Content Pillar</label>
              <select
                className="input w-full"
                value={newPillar}
                onChange={(e) => setNewPillar(e.target.value)}
              >
                {DEFAULT_CONTENT_PILLARS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* Format */}
            <div>
              <label className="mb-1 block text-xs text-white/50">Format</label>
              <select
                className="input w-full"
                value={newFormat}
                onChange={(e) => setNewFormat(e.target.value as (typeof FORMATS)[number])}
              >
                {FORMATS.map((f) => (
                  <option key={f} value={f} className="capitalize">
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={addEntry}
              disabled={!newTopic.trim()}
              className="btn btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus size={14} />
              Add to Calendar
            </button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
