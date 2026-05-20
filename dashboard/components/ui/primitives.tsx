'use client';

import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-white/45">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent = false,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div className={`card ${accent ? 'border-gold/30' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="stat-label">{label}</span>
        {icon && <span className="text-gold/70">{icon}</span>}
      </div>
      <div className={`mt-2 text-3xl font-semibold tracking-tight ${accent ? 'text-gold' : 'text-white'}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-white/35">{hint}</div>}
    </div>
  );
}

export function SectionCard({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`card ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function EmptyState({ message, icon }: { message: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-white/35">
      {icon}
      <p className="text-sm">{message}</p>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-white/40">
      <Loader2 size={16} className="animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function ProgressBar({ value, animated = false }: { value: number; animated?: boolean }) {
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-white/8 ${animated ? 'shimmer' : ''}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-gold-dim to-gold transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <th className={`th ${className}`}>{children}</th>;
}
export function Td({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <td className={`td ${className}`}>{children}</td>;
}

export function DataTable({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="min-w-full divide-y divide-border">
        <thead className="bg-surface-2/50">
          <tr>{head}</tr>
        </thead>
        <tbody className="divide-y divide-border/60">{children}</tbody>
      </table>
    </div>
  );
}
