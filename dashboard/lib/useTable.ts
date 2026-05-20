'use client';

// ============================================================
// useTable — single data-access hook for the whole dashboard.
//
//  - Supabase configured  -> initial fetch + live realtime updates
//  - Supabase NOT set      -> returns placeholder data immediately
//
// Pages never branch on this; they just consume `rows`.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';
import { PLACEHOLDERS, type TableName } from './placeholder';

interface Options {
  orderBy?: string;
  ascending?: boolean;
  limit?: number;
}

export function useTable<T = any>(table: TableName, opts: Options = {}) {
  const { orderBy = 'created_at', ascending = false, limit } = opts;
  const [rows, setRows] = useState<T[]>(() => PLACEHOLDERS[table] as unknown as T[]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [live, setLive] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    let query = supabase.from(table).select('*');
    // not every table has created_at; guard the common ones
    const orderable = ['videos', 'leads', 'comments', 'emails'].includes(table)
      ? orderBy
      : table === 'pipeline_runs'
        ? 'started_at'
        : table === 'content_calendar'
          ? 'scheduled_date'
          : table === 'posts'
            ? 'posted_at'
            : null;
    if (orderable) query = query.order(orderable, { ascending, nullsFirst: false });
    if (limit) query = query.limit(limit);

    query.then(({ data, error }) => {
      if (!mounted.current) return;
      if (!error && data) setRows(data as T[]);
      setLoading(false);
    });

    const channel = supabase
      .channel(`rt:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        if (!mounted.current) return;
        setRows((prev) => {
          const next = [...prev] as any[];
          const rec: any = payload.new ?? payload.old;
          const idx = next.findIndex((r) => r.id === rec.id);
          if (payload.eventType === 'INSERT' && idx === -1) next.unshift(rec);
          else if (payload.eventType === 'UPDATE' && idx !== -1) next[idx] = rec;
          else if (payload.eventType === 'DELETE' && idx !== -1) next.splice(idx, 1);
          return next as T[];
        });
      })
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));

    return () => {
      mounted.current = false;
      supabase?.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  return { rows, loading, live, isLive: live, usingPlaceholders: !isSupabaseConfigured };
}
