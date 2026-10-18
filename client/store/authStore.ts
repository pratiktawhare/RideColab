// ─────────────────────────────────────────────────────────────
// authStore — JWT tokens + current user, persisted to SecureStore
// ─────────────────────────────────────────────────────────────
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  mode: 'rider' | 'passenger';
  trust_score?: number;
  consent_given_at?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isHydrated: boolean;
  setTokens: (access: string, refresh: string) => void;
  setUser: (user: AuthUser) => void;
  logout: () => void;
  hydrate: () => Promise<void>;
}

const KEYS = { access: 'rc_access', refresh: 'rc_refresh', user: 'rc_user' };

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isHydrated: false,

  setTokens: (access, refresh) => {
    set({ accessToken: access, refreshToken: refresh });
    SecureStore.setItemAsync(KEYS.access, access).catch(() => {});
    SecureStore.setItemAsync(KEYS.refresh, refresh).catch(() => {});
  },

  setUser: (user) => {
    set({ user });
    SecureStore.setItemAsync(KEYS.user, JSON.stringify(user)).catch(() => {});
  },

  logout: () => {
    set({ user: null, accessToken: null, refreshToken: null });
    SecureStore.deleteItemAsync(KEYS.access).catch(() => {});
    SecureStore.deleteItemAsync(KEYS.refresh).catch(() => {});
    SecureStore.deleteItemAsync(KEYS.user).catch(() => {});
  },

  hydrate: async () => {
    try {
      const [access, refresh, userJson] = await Promise.all([
        SecureStore.getItemAsync(KEYS.access),
        SecureStore.getItemAsync(KEYS.refresh),
        SecureStore.getItemAsync(KEYS.user),
      ]);
      set({
        accessToken: access,
        refreshToken: refresh,
        user: userJson ? (JSON.parse(userJson) as AuthUser) : null,
        isHydrated: true,
      });
    } catch {
      set({ isHydrated: true });
    }
  },
}));
