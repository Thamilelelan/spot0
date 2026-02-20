import { supabase } from './supabase';

/**
 * ─── BACKEND URL ────────────────────────────────────────────────────────────
 *  Android emulator  → 'http://10.0.2.2:5000'
 *  iOS simulator     → 'http://localhost:5000'
 *  Physical device   → 'http://<your-local-ip>:5000'  (e.g. 192.168.1.x)
 *  Production/ngrok  → replace with your public URL
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const BACKEND_URL = 'http://10.0.2.2:5000';

// ─── Internal: build Authorization header from current Supabase session ──────
async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  };
}

// ─── Internal: public headers (no auth) ──────────────────────────────────────
const publicHeaders: Record<string, string> = {
  'Content-Type': 'application/json',
};

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function apiGet<T = unknown>(
  path: string,
  requiresAuth = true
): Promise<T> {
  const headers = requiresAuth ? await authHeaders() : publicHeaders;
  const res = await fetch(`${BACKEND_URL}${path}`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── POST ─────────────────────────────────────────────────────────────────────
export async function apiPost<T = unknown>(
  path: string,
  body: object,
  requiresAuth = true
): Promise<T> {
  const headers = requiresAuth ? await authHeaders() : publicHeaders;
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error((errBody as any).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}
