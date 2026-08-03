'use client';

// Gates the whole dashboard behind Supabase Auth. In demo mode (Supabase not
// configured) this is a no-op passthrough — see useSupabaseSession.
import { useSupabaseSession } from '@/lib/useSupabaseSession';
import { LoginScreen } from './LoginScreen';

export function AppGate({ children }: { children: React.ReactNode }) {
  const { status } = useSupabaseSession();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-gold" />
      </div>
    );
  }

  if (status === 'signed-out') {
    return <LoginScreen />;
  }

  return <>{children}</>;
}

export default AppGate;
