'use client';

// Tracks the current Supabase Auth session client-side. When Supabase isn't
// configured, `status` resolves straight to 'signed-in' — there's no login
// system in that mode, matching every other feature's zero-config demo
// fallback in this codebase (see lib/supabase.ts, lib/useTable.ts).
import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';

export type SessionStatus = 'loading' | 'signed-out' | 'signed-in';

export function useSupabaseSession() {
  const [status, setStatus] = useState<SessionStatus>(isSupabaseConfigured ? 'loading' : 'signed-in');
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    let settled = false;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        settled = true;
        setEmail(data.session?.user.email ?? null);
        setStatus(data.session ? 'signed-in' : 'signed-out');
      })
      // Only fall through to signed-out if we never got an answer, so a
      // transient Supabase error can't flip a real session out.
      .catch(() => {
        if (!settled) setStatus('signed-out');
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        setEmail(session.user.email ?? null);
        setStatus('signed-in');
      } else if (event === 'SIGNED_OUT') {
        setEmail(null);
        setStatus('signed-out');
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return { status, email };
}
