// Server-side guard for API routes that shouldn't be callable by anyone who
// just finds the URL. Verifies the `Authorization: Bearer <access_token>`
// header against Supabase Auth. When Supabase isn't configured there's no
// login system at all (zero-config demo mode), so every request passes
// through — matches every other feature's demo fallback in this codebase.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const authRequired = Boolean(url && anonKey);

type RequireUserResult =
  | { ok: true; user: { id: string; email: string | null } | null }
  | { ok: false; status: number; error: string };

export async function requireUser(req: Request): Promise<RequireUserResult> {
  if (!authRequired) return { ok: true, user: null };

  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return { ok: false, status: 401, error: 'Missing Authorization bearer token' };
  }

  const client = createClient(url as string, anonKey as string, { auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, status: 401, error: 'Invalid or expired session' };
  }

  return { ok: true, user: { id: data.user.id, email: data.user.email ?? null } };
}
