/**
 * ModelResultView — renders a raw model response through the same
 * tolerant parser the AiExplainPanel uses (`parseSections`), so the
 * "测试" area on the AI settings page shows exactly what the study
 * flow would render for a real word.
 */
import { StyleSheet, Text, View } from 'react-native';

import { parseSections } from '@/components/ai-explain-panel';
import { Colors, FontSize, FontWeight, Radii, SemanticColors, Spacing } from '@/constants/theme';

export function ModelResultView({ text }: { text: string }) {
  const sections = parseSections(text);
  const hasAny = Boolean(sections.root || sections.mnemonic || sections.examples.length > 0);
  if (!hasAny) {
    return (
      <Text style={[styles.fallback, { color: Colors.light.textSecondary }]}>
        {text || '（空响应）'}
      </Text>
    );
  }
  return (
    <View style={styles.wrap}>
      {sections.root ? <Row label="词源" body={sections.root} /> : null}
      {sections.mnemonic ? <Row label="助记" body={sections.mnemonic} /> : null}
      {sections.examples.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.label}>例句 ({sections.examples.length})</Text>
          {sections.examples.map((ex, i) => (
            <View key={`${i}-${ex.en.slice(0, 24)}`} style={styles.example}>
              <Text style={styles.exampleEn}>
                {i + 1}. {ex.en}
              </Text>
              {ex.cn ? <Text style={styles.exampleCn}>{ex.cn}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Row({ label, body }: { label: string; body: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.three,
  },
  section: {
    gap: Spacing.half,
  },
  label: {
    fontSize: FontSize.small,
    fontWeight: FontWeight.semibold,
    color: SemanticColors.primary,
  },
  body: {
    fontSize: FontSize.body,
    lineHeight: 22,
    color: Colors.light.text,
  },
  example: {
    paddingLeft: Spacing.two,
    gap: 2,
  },
  exampleEn: {
    fontSize: FontSize.body,
    lineHeight: 20,
    color: Colors.light.text,
  },
  exampleCn: {
    fontSize: FontSize.small,
    lineHeight: 18,
    color: Colors.light.textSecondary,
  },
  fallback: {
    fontSize: FontSize.body,
    lineHeight: 22,
    borderRadius: Radii.md,
  },
});
