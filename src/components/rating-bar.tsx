/**
 * RatingBar — the four-button self-rating bar shown under a flashcard.
 *
 * The labels use the Anki-flavoured vocabulary: "不认识 / 模糊 / 认识 /
 * 太简单" with the FSRS-mapped next interval as a hint. The mapping is
 * `wordRatingToGrade` in `core/fsrs.ts`; the interval numbers come
 * from a preview computed before the user taps.
 */
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';

import type { ReviewRatingValue } from '@/db/schema';
import { Colors, FontSize, FontWeight, Radii, SemanticColors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface RatingBarProps {
  /** The next-due interval for each rating, in days. */
  preview: Record<ReviewRatingValue, { intervalDays: number }>;
  disabled?: boolean;
  onRate: (rating: ReviewRatingValue) => void;
}

const ORDER: ReviewRatingValue[] = ['forgot', 'hard', 'good', 'easy'];

const LABEL: Record<ReviewRatingValue, string> = {
  forgot: '不认识',
  hard: '模糊',
  good: '认识',
  easy: '太简单',
};

const TINT: Record<ReviewRatingValue, string> = {
  forgot: SemanticColors.danger,
  hard: SemanticColors.warning,
  good: SemanticColors.success,
  easy: SemanticColors.primary,
};

function formatInterval(days: number): string {
  if (days < 1) {
    const mins = Math.max(1, Math.round(days * 24 * 60));
    return `${mins}m`;
  }
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

function RatingBarImpl({ preview, disabled, onRate }: RatingBarProps) {
  const theme = useTheme();
  return (
    <View style={styles.row} testID="rating-bar">
      {ORDER.map((r) => {
        const tint = TINT[r];
        return (
          <Pressable
            key={r}
            testID={`rate-${r}`}
            accessibilityRole="button"
            accessibilityLabel={`${LABEL[r]}, 下一interval ${formatInterval(preview[r].intervalDays)}`}
            disabled={disabled}
            onPress={() => onRate(r)}
            style={({ pressed }) => [
              styles.button,
              {
                borderColor: tint,
                backgroundColor: pressed ? tint : 'transparent',
                opacity: disabled ? 0.5 : 1,
              },
            ]}
          >
            {({ pressed }) => (
              <RatingButtonContent
                rating={r}
                pressed={pressed}
                intervalLabel={formatInterval(preview[r].intervalDays)}
                tint={tint}
                muted={theme.textSecondary}
              />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function RatingButtonContent({
  rating,
  pressed,
  intervalLabel,
  tint,
  muted,
}: {
  rating: ReviewRatingValue;
  pressed: boolean;
  intervalLabel: string;
  tint: string;
  muted: string;
}) {
  const fg = pressed ? Colors.light.onPrimary : tint;
  return (
    <>
      <Text style={[styles.label, { color: fg }]}>{LABEL[rating]}</Text>
      <Text style={[styles.interval, { color: pressed ? Colors.light.onPrimary : muted }]}>
        {intervalLabel}
      </Text>
    </>
  );
}

export const RatingBar = memo(RatingBarImpl);

const styles: { [k: string]: ViewStyle | TextStyle } = {
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
    width: '100%',
  },
  button: {
    flex: 1,
    paddingVertical: Spacing.three,
    borderRadius: Radii.md,
    borderWidth: 1.5,
    alignItems: 'center',
    gap: Spacing.half,
  } as ViewStyle,
  label: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
  },
  interval: {
    fontSize: FontSize.caption,
  },
};
