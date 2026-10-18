// ─────────────────────────────────────────────────────────────
// themeStore — light / dark mode, persisted to SecureStore
// ─────────────────────────────────────────────────────────────
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { lightTheme, darkTheme } from '@/theme/tokens';

// Use a structural type that matches both themes
type ThemeColors = Record<string, string>;
type AnyTheme = { colors: ThemeColors; spacing: typeof lightTheme.spacing; radii: typeof lightTheme.radii; fontSizes: typeof lightTheme.fontSizes; fontWeights: typeof lightTheme.fontWeights; lineHeights: typeof lightTheme.lineHeights; shadows: typeof lightTheme.shadows };

type ColorScheme = 'light' | 'dark';

interface ThemeState {
  scheme: ColorScheme;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  theme: any; // Loose type — both lightTheme and darkTheme are valid at runtime
  toggle: () => void;
  setScheme: (s: ColorScheme) => void;
}

const THEME_KEY = 'rc_theme';

export const useThemeStore = create<ThemeState>((set, get) => ({
  scheme: 'light',
  theme: lightTheme,

  toggle: () => {
    const next: ColorScheme = get().scheme === 'light' ? 'dark' : 'light';
    set({ scheme: next, theme: next === 'light' ? lightTheme : darkTheme });
    SecureStore.setItemAsync(THEME_KEY, next).catch(() => {});
  },

  setScheme: (s) => {
    set({ scheme: s, theme: s === 'light' ? lightTheme : darkTheme });
    SecureStore.setItemAsync(THEME_KEY, s).catch(() => {});
  },
}));

// Hydrate theme preference on launch
export async function hydrateTheme(): Promise<void> {
  try {
    const saved = await SecureStore.getItemAsync(THEME_KEY);
    if (saved === 'light' || saved === 'dark') {
      useThemeStore.getState().setScheme(saved);
    }
  } catch {
    // ignore
  }
}
