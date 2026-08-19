/**
 * TabPlaceholder — minimal landing surface for a tab that's wired into the
 * router but doesn't have real content yet. We keep these around (rather
 * than 404-ing) so the tab bar stays usable while the feature is being
 * built out, and so the rest of the app can deep-link to them.
 */
import { Text, View } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Colors, FontSize, FontWeight, SemanticColors, Spacing } from '@/constants/theme';

export interface TabPlaceholderProps {
  emoji: string;
  title: string;
  description: string;
  cta?: { label: string; onPress: () => void };
  meta?: { label: string; value: string }[];
}

export function TabPlaceholder({ emoji, title, description, cta, meta }: TabPlaceholderProps) {
  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{description}</Text>
      </View>

      {meta && meta.length > 0 ? (
        <Card variant="flat" padding="four" radius="lg" style={styles.metaCard}>
          {meta.map((m) => (
            <View key={m.label} style={styles.metaRow}>
              <Text style={styles.metaLabel}>{m.label}</Text>
              <Text style={styles.metaValue}>{m.value}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {cta ? <Button label={cta.label} onPress={cta.onPress} fullWidth size="lg" /> : null}

      <Text style={styles.footnote}>Phase 0 占位页 · 实际功能将在后续阶段实现</Text>
    </View>
  );
}

const styles: { [k: string]: ViewStyle | TextStyle } = {
  screen: {
    flex: 1,
    backgroundColor: Colors.light.background,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    paddingBottom: Spacing.four,
    gap: Spacing.five,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  emoji: {
    fontSize: 64,
  },
  title: {
    fontSize: FontSize.display,
    fontWeight: FontWeight.bold,
    color: Colors.light.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FontSize.body,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
  },
  metaCard: {
    gap: Spacing.two,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: FontSize.body,
    color: Colors.light.textSecondary,
  },
  metaValue: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.light.text,
  },
  footnote: {
    fontSize: FontSize.caption,
    color: SemanticColors.excluded,
    textAlign: 'center',
    marginTop: 'auto' as unknown as number,
  } as TextStyle,
};
