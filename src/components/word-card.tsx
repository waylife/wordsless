/**
 * WordCard — the core flashcard surface used in learn/review sessions.
 *
 * Renders two faces (front + back) the session page toggles between
 * via the `flipped` prop. The card deliberately does not own the flip
 * state — the session page knows when to flip (on tap / on answer).
 *
 * Visual choices:
 *   - the card has a fixed minimum height so the layout doesn't jump
 *     between flipped/unflipped states
 *   - the back face fades the phonetic in smaller; meanings take the
 *     dominant visual weight (they're the answer)
 *   - a play button on the front speaks the spelling with the user's
 *     preferred accent (audio.speak is fire-and-forget)
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ViewStyle, TextStyle } from 'react-native';

import { audio } from '@/core/audio/speech';
import type { Word } from '@/db/schema';
import type { Accent } from '@/stores/settings-store';
import { Colors, FontSize, FontWeight, Radii, SemanticColors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface WordCardProps {
  word: Word;
  flipped: boolean;
  accent: Accent;
  /** When false the play button is disabled (e.g. before audio loads). */
  onPlay?: () => void;
  onPress?: () => void;
}

function WordCardImpl({ word, flipped, accent, onPlay, onPress }: WordCardProps) {
  const theme = useTheme();
  const primaryMeaning = word.meanings[0];
  const example = word.examples[0];
  const phonetic = accent === 'en-GB' ? word.phoneticUk : word.phoneticUs;

  function handlePlay() {
    onPlay?.();
    void audio.speak(word.spelling, { accent });
  }

  return (
    <Pressable
      testID={`word-card-${word.id}`}
      accessibilityRole="button"
      accessibilityLabel={flipped ? '翻面显示单词' : '翻面显示释义'}
      onPress={onPress}
      style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
    >
      {flipped ? (
        <View style={styles.back}>
          <Text style={[styles.spelling, { color: theme.text }]}>{word.spelling}</Text>
          {phonetic ? (
            <Text style={[styles.phonetic, { color: theme.textSecondary }]}>{phonetic}</Text>
          ) : null}
          <View style={styles.divider} />
          {primaryMeaning ? (
            <View style={styles.meaningBlock}>
              <Text style={[styles.pos, { color: SemanticColors.primary }]}>
                {primaryMeaning.pos}
              </Text>
              <Text style={[styles.def, { color: theme.text }]}>{primaryMeaning.def}</Text>
            </View>
          ) : null}
          {word.meanings.slice(1, 3).map((m, i) => (
            <Text key={i} style={[styles.altMeaning, { color: theme.textSecondary }]}>
              {m.pos} {m.def}
            </Text>
          ))}
          {example ? (
            <View style={styles.exampleBlock}>
              <Text style={[styles.exampleEn, { color: theme.text }]}>
                &ldquo;{example.en}&rdquo;
              </Text>
              <Text style={[styles.exampleCn, { color: theme.textSecondary }]}>{example.cn}</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.front}>
          <Pressable
            testID="play-button"
            accessibilityRole="button"
            accessibilityLabel="播放发音"
            onPress={handlePlay}
            hitSlop={12}
            style={({ pressed }) => [styles.playButton, pressed && styles.playButtonPressed]}
          >
            <Text style={styles.playIcon}>▶</Text>
          </Pressable>
          <Text style={[styles.spelling, styles.spellingFront, { color: theme.text }]}>
            {word.spelling}
          </Text>
          {phonetic ? (
            <Text style={[styles.phonetic, { color: theme.textSecondary }]}>{phonetic}</Text>
          ) : null}
          <Text style={[styles.hint, { color: theme.textSecondary }]}>轻点卡片查看释义</Text>
        </View>
      )}
    </Pressable>
  );
}

export const WordCard = memo(WordCardImpl);

const styles: { [k: string]: ViewStyle | TextStyle } = {
  card: {
    minHeight: 360,
    borderRadius: Radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
    justifyContent: 'center',
  },
  front: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  back: {
    gap: Spacing.two,
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.light.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  playButtonPressed: {
    backgroundColor: Colors.light.primaryPressed,
  },
  playIcon: {
    color: Colors.light.onPrimary,
    fontSize: 22,
    fontWeight: FontWeight.bold,
    marginLeft: 3, // visual centering for the triangle
  },
  spelling: {
    fontSize: 42,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.5,
  },
  spellingFront: {
    fontSize: 48,
  },
  phonetic: {
    fontSize: FontSize.subtitle,
  },
  hint: {
    fontSize: FontSize.small,
    marginTop: Spacing.three,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.light.border,
    marginVertical: Spacing.two,
  },
  meaningBlock: {
    gap: Spacing.half,
  },
  pos: {
    fontSize: FontSize.small,
    fontWeight: FontWeight.semibold,
  },
  def: {
    fontSize: FontSize.title,
    fontWeight: FontWeight.semibold,
  },
  altMeaning: {
    fontSize: FontSize.body,
  },
  exampleBlock: {
    marginTop: Spacing.three,
    gap: Spacing.half,
  },
  exampleEn: {
    fontSize: FontSize.body,
    fontStyle: 'italic',
  },
  exampleCn: {
    fontSize: FontSize.small,
  },
};
