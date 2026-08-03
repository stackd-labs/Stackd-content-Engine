// Wraps fetch() to attach the current Supabase session's access token as a
// Bearer header, for calling API routes gated by requireUser() (see
// lib/requireUser.ts). No-op when Supabase isn't configured or no session
// exists — those routes let the request through in that case too.
import { supabase } from './supabase';

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);

  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}

export default authFetch;
