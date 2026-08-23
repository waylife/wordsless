/**
 * StreakBadge — the fire-and-number widget that lives on the home tab.
 *
 * Renders a small pill with a flame emoji, the current streak, and an
 * optional "best" hint. When the user has never checked in we render
 * nothing (no value in showing "🔥 0"), and when the streak is broken
 * we soften the color to nudge without shaming.
 */
import { Text, View } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';

import { FontSize, FontWeight, Radii, SemanticColors, Spacing } from '@/constants/theme';

export interface StreakBadgeProps {
  /** Current consecutive-days streak. 0 means "no streak yet". */
  current: number;
  /** Best streak ever — surfaced as "best N" when the user has history. */
  best?: number;
  /** Whether the user has already studied today. */
  studiedToday?: boolean;
  size?: 'sm' | 'md';
}

export function StreakBadge({ current, best, studiedToday, size = 'md' }: StreakBadgeProps) {
  if (current <= 0) return null;
  const tint = studiedToday ? SemanticColors.warning : SemanticColors.excluded;
  return (
    <View
      style={[
        styles.base,
        size === 'sm' ? styles.baseSm : styles.baseMd,
        { backgroundColor: tint + '22', borderColor: tint + '55' },
      ]}
      accessibilityRole="text"
      accessibilityLabel={`连续打卡 ${current} 天${best && best > current ? `,最佳 ${best} 天` : ''}`}
    >
      <Text style={[styles.flame, size === 'sm' ? styles.flameSm : styles.flameMd]}>🔥</Text>
      <View style={styles.text}>
        <Text style={[styles.current, { color: tint }, size === 'sm' ? styles.currentSm : null]}>
          {current}
          <Text style={styles.unit}> 天</Text>
        </Text>
        {best != null && best > current ? <Text style={styles.best}>最佳 {best}</Text> : null}
      </View>
    </View>
  );
}

const styles: { [k: string]: ViewStyle | TextStyle } = {
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radii.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  baseSm: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    gap: Spacing.one,
  },
  baseMd: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    gap: Spacing.two,
  },
  flame: {
    lineHeight: undefined,
  },
  flameSm: {
    fontSize: FontSize.body,
  },
  flameMd: {
    fontSize: FontSize.subtitle,
  },
  text: {
    flexDirection: 'column',
  },
  current: {
    fontWeight: FontWeight.bold,
  },
  currentSm: {
    fontSize: FontSize.body,
  },
  unit: {
    fontWeight: FontWeight.regular,
    fontSize: FontSize.small,
  },
  best: {
    fontSize: FontSize.caption,
    color: SemanticColors.excluded,
  },
};
