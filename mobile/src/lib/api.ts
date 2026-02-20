import { supabase } from './supabase';

/**
 * ─── BACKEND URL ────────────────────────────────────────────────────────────
 *  Same WiFi (Expo Go real phone) → 'http://YOUR_LAPTOP_IP:5000'
 *    Run `ipconfig` → find IPv4 under Wi-Fi adapter, e.g. 192.168.1.45
 *  ngrok (any network)           → 'https://xxxx.ngrok-free.app'
 *  Android emulator only         → 'http://10.0.2.2:5000'
 *  iOS simulator only            → 'http://localhost:5000'
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const BACKEND_URL = 'https://05f3-103-249-82-131.ngrok-free.app'; // ngrok tunnel → localhost:5000

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
