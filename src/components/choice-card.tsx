/**
 * ChoiceCard — 4-choice multiple-choice quiz for the "choice" review mode.
 *
 * Picks three distractor definitions from the same book and one correct
 * one. The session page passes the pre-shuffled `options`; this
 * component just renders them and reports the tap. After a tap, the
 * session flips the card and the user self-rates.
 */
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';

import { Colors, FontSize, FontWeight, Radii, SemanticColors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface ChoiceOption {
  id: string;
  /** Display text, e.g. "n. 能力". */
  label: string;
}

export interface ChoiceCardProps {
  options: ChoiceOption[];
  correctId: string;
  /** Selected option id; `null` until the user taps. */
  selectedId: string | null;
  disabled?: boolean;
  onSelect: (optionId: string) => void;
}

function ChoiceCardImpl({ options, correctId, selectedId, disabled, onSelect }: ChoiceCardProps) {
  const theme = useTheme();
  return (
    <View style={styles.list} testID="choice-card">
      {options.map((opt) => {
        const isSelected = selectedId === opt.id;
        const isCorrect = opt.id === correctId;
        const revealed = selectedId != null;
        const tint = !revealed
          ? theme.border
          : isCorrect
            ? SemanticColors.success
            : isSelected
              ? SemanticColors.danger
              : theme.border;
        const bg = !revealed
          ? 'transparent'
          : isCorrect
            ? SemanticColors.successSoft
            : isSelected
              ? SemanticColors.dangerSoft
              : 'transparent';
        return (
          <Pressable
            key={opt.id}
            testID={`choice-${opt.id}`}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected, disabled: Boolean(disabled) }}
            disabled={disabled}
            onPress={() => onSelect(opt.id)}
            style={[
              styles.option,
              {
                borderColor: tint,
                backgroundColor: bg,
              },
            ]}
          >
            <Text style={[styles.optionText, { color: theme.text }]}>{opt.label}</Text>
            {revealed && isCorrect ? (
              <Text style={[styles.tag, { color: SemanticColors.success }]}>正确</Text>
            ) : revealed && isSelected ? (
              <Text style={[styles.tag, { color: SemanticColors.danger }]}>你的选择</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export const ChoiceCard = memo(ChoiceCardImpl);

const styles: { [k: string]: ViewStyle | TextStyle } = {
  list: {
    gap: Spacing.two,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Radii.md,
    borderWidth: 1.5,
    backgroundColor: Colors.light.background,
  },
  optionText: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.medium,
    flex: 1,
  },
  tag: {
    fontSize: FontSize.caption,
    fontWeight: FontWeight.semibold,
    marginLeft: Spacing.two,
  },
};
