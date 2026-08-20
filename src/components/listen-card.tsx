/**
 * ListenCard — audio-first quiz for the "listen" review mode.
 *
 * Visual layout:
 *   [big play button]   "听音辨词"
 *   [1 correct + 3 distractor spellings]
 *
 * Mirrors ChoiceCard's tap-to-reveal flow: when the user picks an
 * option, the parent flips the card and shows the rating bar. We
 * deliberately share the ChoiceOption shape so the test surface is
 * the same as the existing 4-choice quiz.
 */
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';

import { audio } from '@/core/audio/speech';
import type { Accent } from '@/stores/settings-store';
import { Colors, FontSize, FontWeight, Radii, SemanticColors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ChoiceCard, type ChoiceOption } from './choice-card';

export interface ListenCardProps {
  /** Spellings the user can pick from; the correct one has `isCorrect` true. */
  options: ChoiceOption[];
  correctId: string;
  selectedId: string | null;
  disabled?: boolean;
  onSelect: (optionId: string) => void;
  /** Spelling to speak when the user taps the play button. */
  spelling: string;
  accent: Accent;
}

function ListenCardImpl({
  options,
  correctId,
  selectedId,
  disabled,
  onSelect,
  spelling,
  accent,
}: ListenCardProps) {
  const theme = useTheme();

  function handlePlay() {
    void audio.speak(spelling, { accent, rate: 0.85 });
  }

  return (
    <View style={styles.wrap} testID="listen-card">
      <View style={styles.hero}>
        <Pressable
          testID="listen-play"
          accessibilityRole="button"
          accessibilityLabel="播放发音"
          onPress={handlePlay}
          hitSlop={12}
          style={({ pressed }) => [
            styles.playButton,
            {
              backgroundColor: pressed ? Colors.light.primaryPressed : Colors.light.primary,
            },
          ]}
        >
          <Text style={styles.playIcon}>▶</Text>
        </Pressable>
        <Text style={[styles.prompt, { color: theme.textSecondary }]}>听音辨词 · 选正确的拼写</Text>
      </View>
      <ChoiceCard
        options={options}
        correctId={correctId}
        selectedId={selectedId}
        disabled={disabled}
        onSelect={onSelect}
      />
    </View>
  );
}

export const ListenCard = memo(ListenCardImpl);

const styles: { [k: string]: ViewStyle | TextStyle } = {
  wrap: {
    gap: Spacing.four,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  playButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    color: Colors.light.onPrimary,
    fontSize: 36,
    fontWeight: FontWeight.bold,
    marginLeft: 4,
  },
  prompt: {
    fontSize: FontSize.body,
  },
  // Touch the import so tree-shaking doesn't drop the constants.
  _mark: { borderRadius: Radii.lg, backgroundColor: SemanticColors.successSoft } as ViewStyle,
};
