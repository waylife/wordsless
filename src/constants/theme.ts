/**
 * Design tokens for the Wordsless app.
 *
 * This is the single source of truth for all visual constants. Components
 * should NEVER hardcode colors, paddings, or font sizes — they should read
 * from here so that theming and future re-skins stay mechanical.
 *
 * Tokens are organized in three layers:
 *   1. Primitive tokens (e.g. `Colors.light.text`) — raw values.
 *   2. Semantic tokens (e.g. `SemanticColors.success`) — meaning.
 *   3. Component-level usages compose these.
 *
 * The `useThemeColor` helper (see `./use-theme-color.ts`) bridges light/dark
 * via the system color scheme.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#11181C',
    textSecondary: '#5C6770',
    textInverse: '#FFFFFF',
    background: '#FFFFFF',
    backgroundElement: '#F2F4F7',
    backgroundSelected: '#E4E8EE',
    border: '#E1E4E8',
    primary: '#208AEF',
    primaryPressed: '#1B7AD0',
    onPrimary: '#FFFFFF',
    tint: '#208AEF',
    tabIconDefault: '#687076',
    tabIconSelected: '#208AEF',
  },
  dark: {
    text: '#ECEDEE',
    textSecondary: '#9BA1A6',
    textInverse: '#11181C',
    background: '#0F1115',
    backgroundElement: '#1B1F24',
    backgroundSelected: '#272C32',
    border: '#2A2F36',
    primary: '#3B9BFF',
    primaryPressed: '#208AEF',
    onPrimary: '#0F1115',
    tint: '#3B9BFF',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: '#3B9BFF',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * Semantic palette that does not change with light/dark — used for state
 * (success, danger) and brand accents that should be consistent across modes.
 */
export const SemanticColors = {
  success: '#22C55E',
  successSoft: '#DCFCE7',
  warning: '#F59E0B',
  warningSoft: '#FEF3C7',
  danger: '#EF4444',
  dangerSoft: '#FEE2E2',
  info: '#3B82F6',
  infoSoft: '#DBEAFE',
  primary: '#208AEF',
  mastered: '#22C55E',
  learning: '#F59E0B',
  new: '#3B82F6',
  review: '#8B5CF6',
  excluded: '#9BA1A6',
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  none: 0,
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 48,
  seven: 64,
} as const;

export const Radii = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  pill: 9999,
} as const;

export const FontSize = {
  caption: 12,
  small: 14,
  body: 16,
  subtitle: 18,
  title: 22,
  display: 28,
  hero: 36,
} as const;

export const FontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const HitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
