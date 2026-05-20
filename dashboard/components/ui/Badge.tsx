import type { ReactNode } from 'react';

type Tone = 'gold' | 'green' | 'blue' | 'red' | 'grey' | 'navy' | 'amber';

const TONE: Record<Tone, string> = {
  gold: 'bg-gold/15 text-gold border border-gold/30',
  green: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  blue: 'bg-sky-500/15 text-sky-300 border border-sky-500/30',
  red: 'bg-rose-500/15 text-rose-300 border border-rose-500/30',
  grey: 'bg-white/8 text-white/55 border border-white/10',
  navy: 'bg-navy-light/40 text-sky-200 border border-navy-glow/50',
  amber: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
};

export function Badge({ tone = 'grey', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`pill ${TONE[tone]}`}>{children}</span>;
}

// ---- domain mappings ----------------------------------------
const VIDEO_TONE: Record<string, Tone> = {
  drafting: 'grey', producing: 'blue', rendering: 'blue', posting: 'amber',
  live: 'green', failed: 'red', flagged: 'gold',
};
const POST_TONE: Record<string, Tone> = { scheduled: 'amber', posted: 'green', failed: 'red' };
const LEAD_TONE: Record<string, Tone> = {
  new: 'blue', contacted: 'amber', qualified: 'navy', booked: 'gold', converted: 'green', dead: 'grey',
};
const CAL_TONE: Record<string, Tone> = {
  planned: 'grey', in_production: 'blue', ready: 'gold', posted: 'green', skipped: 'red',
};
const SENTIMENT_TONE: Record<string, Tone> = {
  positive: 'green', question: 'blue', negative: 'red', spam: 'grey', trigger: 'gold',
};
const RESPONSE_TONE: Record<string, Tone> = {
  pending: 'amber', approved: 'blue', posted: 'green', skipped: 'grey',
};
const PIPELINE_TONE: Record<string, Tone> = { running: 'gold', completed: 'green', failed: 'red' };

const human = (s: string) => s.replace(/_/g, ' ');

export const VideoStatusBadge = ({ status }: { status: string }) => (
  <Badge tone={VIDEO_TONE[status] ?? 'grey'}>{human(status)}</Badge>
);
export const PostStatusBadge = ({ status }: { status: string }) => (
  <Badge tone={POST_TONE[status] ?? 'grey'}>{human(status)}</Badge>
);
export const LeadStatusBadge = ({ status }: { status: string }) => (
  <Badge tone={LEAD_TONE[status] ?? 'grey'}>{human(status)}</Badge>
);
export const CalendarStatusBadge = ({ status }: { status: string }) => (
  <Badge tone={CAL_TONE[status] ?? 'grey'}>{human(status)}</Badge>
);
export const SentimentBadge = ({ sentiment }: { sentiment: string | null }) => (
  <Badge tone={SENTIMENT_TONE[sentiment ?? ''] ?? 'grey'}>{human(sentiment ?? 'unknown')}</Badge>
);
export const ResponseStatusBadge = ({ status }: { status: string }) => (
  <Badge tone={RESPONSE_TONE[status] ?? 'grey'}>{human(status)}</Badge>
);
export const PipelineStatusBadge = ({ status }: { status: string }) => (
  <Badge tone={PIPELINE_TONE[status] ?? 'grey'}>{human(status)}</Badge>
);

export function ViralityScore({ score }: { score: number | null }) {
  if (score == null) return <span className="text-white/30">—</span>;
  const tone: Tone = score >= 8 ? 'green' : score >= 6 ? 'gold' : score >= 4 ? 'amber' : 'red';
  return <Badge tone={tone}>{score}/10</Badge>;
}
