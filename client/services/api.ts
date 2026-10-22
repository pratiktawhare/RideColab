// ─────────────────────────────────────────────────────────────
// API service — typed fetch wrapper with JWT + refresh rotation
// ─────────────────────────────────────────────────────────────
import { env } from '@/constants/env';
import { useAuthStore } from '@/store/authStore';

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function refreshTokens(): Promise<string | null> {
  const { refreshToken, setTokens, logout } = useAuthStore.getState();
  if (!refreshToken) { logout(); return null; }

  const res = await fetch(`${env.API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!res.ok) { logout(); return null; }
  const json = await res.json() as { data: { access_token: string; refresh_token: string } };
  setTokens(json.data.access_token, json.data.refresh_token);
  return json.data.access_token;
}

let refreshing: Promise<string | null> | null = null;

async function request<T>(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<T> {
  const { accessToken } = useAuthStore.getState();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`${env.API_URL}${path}`, { ...options, headers });

  if (res.status === 401 && !retried) {
    // Deduplicate concurrent refresh calls
    if (!refreshing) refreshing = refreshTokens().finally(() => { refreshing = null; });
    const newToken = await refreshing;
    if (!newToken) throw new ApiError('AUTH_INVALID_TOKEN', 'Session expired', 401);
    return request<T>(path, options, true);
  }

  const body = await res.json() as { success: boolean; data: T; error?: { code: string; message: string } };

  if (!res.ok || !body.success) {
    throw new ApiError(
      body.error?.code ?? 'UNKNOWN',
      body.error?.message ?? 'Request failed',
      res.status,
    );
  }

  return body.data;
}

// ─── Auth endpoints ───────────────────────────────────────────
export const authApi = {
  register: (email: string, password: string, name: string) =>
    request<{ access_token: string; refresh_token: string; user: import('@/store/authStore').AuthUser }>(
      '/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name }) },
    ),

  login: (email: string, password: string) =>
    request<{ access_token: string; refresh_token: string; user: import('@/store/authStore').AuthUser }>(
      '/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) },
    ),

  logout: () => request<void>('/auth/logout', { method: 'POST' }),

  consent: () => request<void>('/auth/consent', { method: 'POST' }),

  googleIdToken: (idToken: string) =>
    request<{ access_token: string; refresh_token: string; user: import('@/store/authStore').AuthUser }>(
      '/auth/google/id-token', { method: 'POST', body: JSON.stringify({ id_token: idToken }) },
    ),
};

// ─── User endpoints ───────────────────────────────────────────
export const userApi = {
  me: () => request<import('@/store/authStore').AuthUser>('/users/me'),
  updateMe: (data: Partial<import('@/store/authStore').AuthUser>) =>
    request<import('@/store/authStore').AuthUser>('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
  switchMode: (mode: 'rider' | 'passenger') =>
    request<{ mode: string }>('/users/me/settings', { method: 'PATCH', body: JSON.stringify({ mode }) }),
};

// ─── Catalog endpoints ────────────────────────────────────────
export const catalogApi = {
  vehicles: (params?: { type?: string; make?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return request<unknown[]>(`/catalog/vehicles${q ? `?${q}` : ''}`);
  },
};

// ─── Health check ─────────────────────────────────────────────
export const healthApi = {
  check: () =>
    fetch(`${env.API_URL}/health`)
      .then((r) => r.json() as Promise<{ success: boolean }>)
      .catch(() => ({ success: false })),
};
