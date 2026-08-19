/**
 * Bridges light/dark theme tokens with the system color scheme.
 *
 * Used by components that should adapt to the user's OS-level theme.
 * For app-wide forced themes (we don't currently have one), this would
 * be the place to override the scheme.
 */
import { useColorScheme as useSystemColorScheme } from '@/hooks/use-color-scheme';

import { Colors, type ThemeColor } from '@/constants/theme';

type ColorScheme = 'light' | 'dark';

function normalizeScheme(scheme: ReturnType<typeof useSystemColorScheme>): ColorScheme {
  return scheme === 'dark' ? 'dark' : 'light';
}

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark,
): string {
  const theme = normalizeScheme(useSystemColorScheme());
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  }
  return Colors[theme][colorName as ThemeColor];
}

export type { ThemeColor };
