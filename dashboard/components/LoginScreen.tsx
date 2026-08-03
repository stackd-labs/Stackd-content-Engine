'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Logo } from './Logo';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setError('');

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) setError(authError.message);
    setLoading(false);
  }

  async function handleGoogle() {
    if (!supabase) return;
    setGoogleLoading(true);
    setError('');

    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    });
    if (authError) {
      setError(authError.message);
      setGoogleLoading(false);
    }
    // On success the browser redirects to Google — no need to reset loading.
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <div className="card">
          <h1 className="mb-1 text-xl font-bold text-white">Sign in</h1>
          <p className="mb-6 text-sm text-white/45">Stackd Studios team access only</p>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading || loading}
            className="btn-ghost mb-5 w-full disabled:opacity-60"
          >
            {googleLoading ? 'Redirecting…' : 'Continue with Google'}
          </button>

          <div className="mb-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="stat-label">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="email" className="stat-label mb-1.5 block">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@stackdstudiosai.com"
                className="input"
              />
            </div>
            <div>
              <label htmlFor="password" className="stat-label mb-1.5 block">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="input"
              />
            </div>

            {error && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading || googleLoading} className="btn-gold w-full disabled:opacity-40">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default LoginScreen;
