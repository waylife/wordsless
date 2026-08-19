/**
 * Settings tab — runtime controls for the prefs that the rest of the
 * app reads on the fly.
 *
 *  - 口音        → drives `audio.speak(accent)`
 *  - 每日新词    → drives `buildSession(dailyNewWords)`
 *  - API Key     → written to `expo-secure-store`; read by
 *                  `core/ai/runtime.getApiKey`
 *
 * Notification reminders (F14) and theme overrides land in Phase 4.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { getApiKey, setApiKey, clearApiKey } from '@/core/ai/runtime';
import {
  ACCENT_OPTIONS,
  DAILY_NEW_WORD_OPTIONS,
  type Accent,
  type DailyNewWords,
  useSettingsStore,
} from '@/stores/settings-store';
import { Colors, FontSize, FontWeight, Radii, SemanticColors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function SettingsTab() {
  const theme = useTheme();
  const accent = useSettingsStore((s) => s.accent);
  const dailyNewWords = useSettingsStore((s) => s.dailyNewWords);
  const setAccent = useSettingsStore((s) => s.setAccent);
  const setDailyNewWords = useSettingsStore((s) => s.setDailyNewWords);

  const [keyInput, setKeyInput] = useState('');
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [savingKey, setSavingKey] = useState(false);
  const [keyMessage, setKeyMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const k = await getApiKey();
        setHasKey(Boolean(k));
        setKeyInput(k);
      } catch {
        setHasKey(false);
      }
    })();
  }, []);

  const onSaveKey = async () => {
    setSavingKey(true);
    setKeyMessage(null);
    try {
      if (!keyInput.trim()) {
        await clearApiKey();
        setHasKey(false);
        setKeyMessage('已清除');
      } else {
        await setApiKey(keyInput);
        setHasKey(true);
        setKeyMessage('已保存到钥匙串');
      }
    } catch (err) {
      setKeyMessage(`保存失败: ${(err as Error).message}`);
    } finally {
      setSavingKey(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>设置</Text>

      <Card variant="flat" padding="four" radius="lg" style={styles.card}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>发音偏好</Text>
        <View style={styles.row}>
          {ACCENT_OPTIONS.map((opt) => {
            const active = opt.value === accent;
            return (
              <Pressable
                key={opt.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => void setAccent(opt.value as Accent)}
                style={[
                  styles.segment,
                  {
                    backgroundColor: active ? Colors.light.primary : theme.backgroundElement,
                    borderColor: active ? Colors.light.primary : theme.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.segmentLabel,
                    { color: active ? Colors.light.onPrimary : theme.text },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card variant="flat" padding="four" radius="lg" style={styles.card}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>每日新词量</Text>
        <View style={styles.row}>
          {DAILY_NEW_WORD_OPTIONS.map((n) => {
            const active = n === dailyNewWords;
            return (
              <Pressable
                key={n}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => void setDailyNewWords(n as DailyNewWords)}
                style={[
                  styles.segment,
                  {
                    backgroundColor: active ? Colors.light.primary : theme.backgroundElement,
                    borderColor: active ? Colors.light.primary : theme.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.segmentLabel,
                    { color: active ? Colors.light.onPrimary : theme.text },
                  ]}
                >
                  {n}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          每天学习时最多引入这么多新词;复习量由 FSRS 自动计算。
        </Text>
      </Card>

      <Card variant="flat" padding="four" radius="lg" style={styles.card}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>AI 解释</Text>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          使用 MiniMax API 为任意单词生成词源 / 助记 / 例句。Key 仅存本地钥匙串,不上传。
        </Text>
        <View style={styles.keyRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: hasKey ? SemanticColors.success : SemanticColors.excluded },
            ]}
          />
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>
            {hasKey == null ? '检查中…' : hasKey ? '已配置' : '未配置'}
          </Text>
        </View>
        <TextInput
          value={keyInput}
          onChangeText={setKeyInput}
          placeholder="sk-..."
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={[
            styles.input,
            {
              backgroundColor: theme.backgroundElement,
              color: theme.text,
              borderColor: theme.border,
            },
          ]}
        />
        <View style={styles.actions}>
          <Button
            label={savingKey ? '保存中…' : '保存'}
            onPress={() => void onSaveKey()}
            loading={savingKey}
          />
          {hasKey ? (
            <Button
              label="清除"
              variant="ghost"
              onPress={() => {
                setKeyInput('');
                void onSaveKey();
              }}
            />
          ) : null}
        </View>
        {keyMessage ? (
          <Text style={[styles.message, { color: theme.textSecondary }]}>{keyMessage}</Text>
        ) : null}
        {savingKey ? <ActivityIndicator color={Colors.light.primary} /> : null}
      </Card>
    </View>
  );
}

const styles: { [k: string]: ViewStyle | TextStyle } = {
  screen: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    fontSize: FontSize.display,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.two,
  },
  card: {
    gap: Spacing.three,
  },
  sectionTitle: {
    fontSize: FontSize.subtitle,
    fontWeight: FontWeight.semibold,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  segment: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Radii.pill,
    borderWidth: 1,
  },
  segmentLabel: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
  },
  hint: {
    fontSize: FontSize.small,
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: FontSize.small,
  },
  input: {
    borderRadius: Radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: FontSize.body,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  message: {
    fontSize: FontSize.small,
  },
};
