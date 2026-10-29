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

  try {
    const res = await fetch(`${env.API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    // Only logout on explicit auth rejection (token invalid/expired).
    // On 5xx or network errors, preserve the session and let the
    // original request fail — don't punish the user for a server blip.
    if (res.status === 401 || res.status === 403) {
      logout();
      return null;
    }
    if (!res.ok) {
      // Server error or network issue — don't logout, just fail this refresh
      return null;
    }

    const json = await res.json() as { data: { access_token: string; refresh_token: string } };
    setTokens(json.data.access_token, json.data.refresh_token);
    return json.data.access_token;
  } catch {
    // Network error — server unreachable, don't logout
    return null;
  }
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

// ─── Fare endpoints ───────────────────────────────────────────
export interface FareEstimate {
  low: number;
  high: number;
  cap: number;
  breakdown: {
    fuel_type: string;
    fuel_price: number;
    claimed_kmpl: number | null;
    kwh_per_100km: number | null;
    real_world_factor: number;
    distance_km: number;
    cost_per_km_low: number;
    cost_per_km_high: number;
  };
}

export const fareApi = {
  estimate: (vehicleId: string, distanceM: number, seats: number) => {
    const q = new URLSearchParams({
      vehicle_id: vehicleId,
      distance_m: String(distanceM),
      seats: String(seats),
    }).toString();
    return request<FareEstimate>(`/fare/estimate?${q}`);
  },
};

// ─── Geocoding endpoints ──────────────────────────────────────
export interface GeoResult {
  label: string;
  lat: number;
  lng: number;
  source: 'landmark' | 'cache' | 'ors';
}

export const geocodingApi = {
  landmarks: () => request<GeoResult[]>('/geocoding/landmarks'),
  search: (q: string) => {
    const params = new URLSearchParams({ q }).toString();
    return request<GeoResult[]>(`/geocoding/search?${params}`);
  },
};

// ─── Trips endpoints ──────────────────────────────────────────
export interface Trip {
  id: string;
  rider_id: string;
  origin_label: string;
  origin_lat: number;
  origin_lng: number;
  dest_label: string;
  dest_lat: number;
  dest_lng: number;
  depart_at: string;
  seats_total: number;
  seats_available: number;
  fare_set: number;
  fare_cap: number;
  status: 'open' | 'full' | 'in_progress' | 'completed' | 'cancelled';
  vehicle_id: string | null;
  vehicle_name?: string;
  vehicle_type?: string;
  is_recurring: boolean;
  rrule: string | null;
  community_id: string | null;
  notes: string | null;
  distance_m: number | null;
  duration_s: number | null;
  created_at: string;
}

export interface CreateTripPayload {
  origin_label: string;
  origin_lat: number;
  origin_lng: number;
  dest_label: string;
  dest_lat: number;
  dest_lng: number;
  depart_at: string;
  seats_total: number;
  fare_set: number;
  vehicle_id: string;
  community_id?: string;
  is_recurring?: boolean;
  rrule?: string;
  notes?: string;
  is_women_only?: boolean;
}

export const tripsApi = {
  create: (payload: CreateTripPayload) =>
    request<Trip & { fare_estimate: { cap: number; low: number; high: number } }>(
      '/trips',
      { method: 'POST', body: JSON.stringify(payload) },
    ),
  mine: (page = 1) => request<Trip[]>(`/trips/mine?page=${page}`),
  get: (id: string) => request<Trip>(`/trips/${id}`),
  update: (id: string, data: Partial<Pick<Trip, 'fare_set' | 'seats_total' | 'notes' | 'depart_at'>>) =>
    request<Trip>(`/trips/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  cancel: (id: string) => request<{ message: string }>(`/trips/${id}`, { method: 'DELETE' }),
};

// ─── Health check ─────────────────────────────────────────────
export const healthApi = {
  check: () =>
    fetch(`${env.API_URL}/health`)
      .then((r) => r.json() as Promise<{ success: boolean }>)
      .catch(() => ({ success: false })),
};

// ─── Search (Phase 7) ──────────────────────────────────────────
export interface SmartPickup {
  lat: number;
  lng: number;
  landmark: string | null;
}

export interface MatchResult {
  trip_id: string;
  rider_id: string;
  rider_name: string;
  trust_score: number;
  departure_time: string;
  origin_label: string;
  destination_label: string;
  seats_available: number;
  fare_set: number | null;
  fare_cap: number;
  is_women_only: boolean;
  vehicle_type: string;
  vehicle_make: string;
  vehicle_model: string;
  registration_suffix: string;
  community_id: string | null;
  notes: string | null;
  smart_pickup: SmartPickup;
  score: number;
  score_breakdown: {
    route_overlap: number;
    time_fit: number;
    detour: number;
    trust: number;
    preferences: number;
  };
}

export interface RideSearchParams {
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  departure_time: string;
  seats?: number;
  radius_m?: number;
  women_only?: boolean;
  community_id?: string | null;
  vehicle_type?: string | null;
}

export const searchApi = {
  searchRides: (params: RideSearchParams) =>
    request<MatchResult[]>('/search/rides', {
      method: 'POST',
      body: JSON.stringify(params),
    }),
};
