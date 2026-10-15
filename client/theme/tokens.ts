// ─────────────────────────────────────────────────────────────
// RideColab Design Tokens
// Single source of truth for all colours, spacing, radii, typography.
// Used by both light and dark themes.
// ─────────────────────────────────────────────────────────────

export const palette = {
  // Primary brand
  navy: '#0F1B33',        // Primary text, primary buttons
  navyLight: '#1A2E55',   // Hover/pressed state

  // Accent
  teal: '#0E9384',        // Savings, active tabs, positive states
  tealLight: '#0FB5A4',   // Hover teal
  tealMuted: '#E6F7F6',   // Teal background chip

  // Status
  amber: '#F59E0B',       // Warnings, rain mode
  amberLight: '#FEF3C7',  // Amber background
  red: '#EF4444',         // SOS, destructive actions
  redLight: '#FEE2E2',    // Red background
  green: '#22C55E',       // Success
  greenLight: '#DCFCE7',  // Green background

  // Neutrals
  white: '#FFFFFF',
  grey50: '#F9FAFB',
  grey100: '#F3F4F6',     // Screen background
  grey200: '#E5E7EB',     // Dividers
  grey300: '#D1D5DB',     // Disabled borders
  grey400: '#9CA3AF',     // Placeholder text
  grey500: '#6B7280',     // Secondary text
  grey600: '#4B5563',
  grey700: '#374151',
  grey800: '#1F2937',
  grey900: '#111827',
  black: '#000000',
} as const;

// ─── Spacing (4px grid) ───────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
  '6xl': 64,
} as const;

// ─── Border radii ─────────────────────────────────────────────
export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  '2xl': 24,
  full: 9999,
} as const;

// ─── Typography scale ─────────────────────────────────────────
export const fontSizes = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 34,
} as const;

export const fontWeights = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const lineHeights = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.75,
} as const;

// ─── Shadows ──────────────────────────────────────────────────
export const shadows = {
  sm: {
    shadowColor: palette.navy,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: palette.navy,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: palette.navy,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

// ─── Light theme ──────────────────────────────────────────────
export const lightTheme = {
  colors: {
    background: palette.grey100,
    surface: palette.white,
    primary: palette.navy,
    primaryPressed: palette.navyLight,
    accent: palette.teal,
    accentMuted: palette.tealMuted,
    text: palette.navy,
    textSecondary: palette.grey500,
    textMuted: palette.grey400,
    border: palette.grey200,
    divider: palette.grey200,
    inputBg: palette.grey50,
    warning: palette.amber,
    warningBg: palette.amberLight,
    danger: palette.red,
    dangerBg: palette.redLight,
    success: palette.green,
    successBg: palette.greenLight,
    tabActive: palette.teal,
    tabInactive: palette.grey400,
    mapOverlay: 'rgba(255,255,255,0.95)',
  },
  spacing,
  radii,
  fontSizes,
  fontWeights,
  lineHeights,
  shadows,
} as const;

// ─── Dark theme ───────────────────────────────────────────────
export const darkTheme = {
  colors: {
    background: '#0A0F1E',
    surface: '#111827',
    primary: palette.white,
    primaryPressed: palette.grey200,
    accent: palette.teal,
    accentMuted: '#0E9384' + '33',
    text: palette.white,
    textSecondary: palette.grey400,
    textMuted: palette.grey500,
    border: palette.grey700,
    divider: palette.grey800,
    inputBg: palette.grey800,
    warning: palette.amber,
    warningBg: palette.amber + '22',
    danger: palette.red,
    dangerBg: palette.red + '22',
    success: palette.green,
    successBg: palette.green + '22',
    tabActive: palette.teal,
    tabInactive: palette.grey600,
    mapOverlay: 'rgba(17,24,39,0.95)',
  },
  spacing,
  radii,
  fontSizes,
  fontWeights,
  lineHeights,
  shadows,
} as const;

export type Theme = typeof lightTheme;
export type ThemeColors = Theme['colors'];
