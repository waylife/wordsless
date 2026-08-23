/**
 * Settings tab — runtime controls for the prefs that the rest of the
 * app reads on the fly.
 *
 *  - 口音        → drives `audio.speak(accent)`
 *  - 每日新词    → drives `buildSession(dailyNewWords)`
 *  - 每日提醒    → drives `scheduleDailyReminder` (F14, Phase 4)
 *  - API Key     → written to `expo-secure-store`; read by
 *                  `core/ai/runtime.getApiKey`
 *
 * Theme override lands in F18.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { getApiKey, setApiKey, clearApiKey } from '@/core/ai/runtime';
import {
  getReminderPermission,
  isSchedulingAvailable,
  requestReminderPermission,
  scheduleDailyReminder,
  type ReminderPermission,
} from '@/core/notifications';
import {
  ACCENT_OPTIONS,
  DAILY_NEW_WORD_OPTIONS,
  REMINDER_HOUR_OPTIONS,
  REMINDER_MINUTE_OPTIONS,
  type Accent,
  type DailyNewWords,
  type ReminderHour,
  type ReminderMinute,
  useSettingsStore,
} from '@/stores/settings-store';
import { Colors, FontSize, FontWeight, Radii, SemanticColors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function SettingsTab() {
  const theme = useTheme();
  const accent = useSettingsStore((s) => s.accent);
  const dailyNewWords = useSettingsStore((s) => s.dailyNewWords);
  const reminderEnabled = useSettingsStore((s) => s.reminderEnabled);
  const reminderHour = useSettingsStore((s) => s.reminderHour);
  const reminderMinute = useSettingsStore((s) => s.reminderMinute);
  const setAccent = useSettingsStore((s) => s.setAccent);
  const setDailyNewWords = useSettingsStore((s) => s.setDailyNewWords);
  // Pulled from the store but driven through the applyReminder
  // pipeline below; the store's own setters are exercised in
  // settings-store.test.ts so we don't re-export them here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const setReminderEnabled = useSettingsStore((s) => s.setReminderEnabled);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const setReminderTime = useSettingsStore((s) => s.setReminderTime);

  const [keyInput, setKeyInput] = useState('');
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [savingKey, setSavingKey] = useState(false);
  const [keyMessage, setKeyMessage] = useState<string | null>(null);

  const schedulingAvailable = isSchedulingAvailable();
  const [permission, setPermission] = useState<ReminderPermission>('undetermined');
  const [schedulingMessage, setSchedulingMessage] = useState<string | null>(null);
  const [schedulingBusy, setSchedulingBusy] = useState(false);

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

  // Probe the OS permission on mount. We don't show a system prompt
  // yet — the user has to opt in via the toggle first.
  useEffect(() => {
    if (!schedulingAvailable) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPermission('unsupported');
      return;
    }
    void (async () => {
      const p = await getReminderPermission();
      setPermission(p);
    })();
  }, [schedulingAvailable]);

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

  // Re-schedule whenever any of the reminder inputs change. We
  // always re-call — `scheduleDailyReminder` cancels the previous
  // entry first, so a single call is enough.
  const applyReminder = useCallback(
    async (
      next: { enabled: boolean; hour: ReminderHour; minute: ReminderMinute },
      permissionOverride?: ReminderPermission,
    ) => {
      setSchedulingMessage(null);
      if (!schedulingAvailable) {
        setSchedulingMessage('当前平台不支持本地通知(模拟器/网页)');
        return;
      }
      setSchedulingBusy(true);
      try {
        let perm = permissionOverride ?? permission;
        if (next.enabled && perm !== 'granted' && perm !== 'unsupported') {
          perm = await requestReminderPermission();
          setPermission(perm);
        }
        if (next.enabled && perm !== 'granted') {
          // Persist the user's intent, but skip scheduling until they
          // grant the OS prompt. The next time they open the toggle,
          // we'll re-prompt.
          if (perm === 'unsupported') {
            // No OS prompt to wait for; do not flip the persisted
            // setting back to false — the user can re-enable on a
            // real device.
            setSchedulingMessage(permissionMessage('unsupported'));
            return;
          }
          setSchedulingMessage(permissionMessage(perm));
          await useSettingsStore.getState().setReminderEnabled(false);
          return;
        }
        const result = await scheduleDailyReminder({
          enabled: next.enabled,
          hour: next.hour,
          minute: next.minute,
        });
        if (!result.ok) {
          setSchedulingMessage(
            result.reason === 'invalid-time'
              ? '时间不合法'
              : `调度失败: ${result.reason ?? '未知原因'}`,
          );
          return;
        }
        setSchedulingMessage(
          next.enabled ? `已开启,每天 ${formatTime(next.hour, next.minute)} 提醒` : '已关闭提醒',
        );
      } finally {
        setSchedulingBusy(false);
      }
    },
    [permission, schedulingAvailable],
  );

  const onToggleReminder = useCallback(
    (next: boolean) => {
      void applyReminder({
        enabled: next,
        hour: reminderHour,
        minute: reminderMinute,
      });
    },
    [applyReminder, reminderHour, reminderMinute],
  );

  const onPickHour = useCallback(
    (h: ReminderHour) => {
      const minute = reminderMinute;
      void applyReminder({ enabled: reminderEnabled, hour: h, minute });
    },
    // applyReminder closes over `permission`; we intentionally don't
    // add `reminderHour` to deps because it's only used as the
    // "current value" within the callback body.
    [applyReminder, reminderEnabled, reminderMinute],
  );

  const onPickMinute = useCallback(
    (m: ReminderMinute) => {
      const hour = reminderHour;
      void applyReminder({ enabled: reminderEnabled, hour, minute: m });
    },
    // See onPickHour for why reminderMinute is omitted.
    [applyReminder, reminderEnabled, reminderHour],
  );

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
        <View style={styles.reminderHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>每日提醒</Text>
          <Switch
            testID="reminder-switch"
            value={reminderEnabled}
            onValueChange={onToggleReminder}
            disabled={!schedulingAvailable || schedulingBusy}
            trackColor={{ true: Colors.light.primary, false: theme.backgroundElement }}
          />
        </View>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          {schedulingAvailable
            ? '每天到点弹出通知,点开直接进入学习。'
            : '当前为模拟器或网页,通知功能不可用。'}
        </Text>

        {schedulingAvailable ? (
          <View style={styles.timeBlock}>
            <Text style={[styles.timeLabel, { color: theme.textSecondary }]}>小时</Text>
            <View style={styles.timeGrid}>
              {REMINDER_HOUR_OPTIONS.map((h) => {
                const active = h === reminderHour;
                return (
                  <Pressable
                    key={h}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    onPress={() => onPickHour(h)}
                    style={[
                      styles.timeCell,
                      {
                        backgroundColor: active ? Colors.light.primary : theme.backgroundElement,
                        borderColor: active ? Colors.light.primary : theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.timeCellLabel,
                        { color: active ? Colors.light.onPrimary : theme.text },
                      ]}
                    >
                      {String(h).padStart(2, '0')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text
              style={[styles.timeLabel, { color: theme.textSecondary, marginTop: Spacing.three }]}
            >
              分钟
            </Text>
            <View style={styles.row}>
              {REMINDER_MINUTE_OPTIONS.map((m) => {
                const active = m === reminderMinute;
                return (
                  <Pressable
                    key={m}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    onPress={() => onPickMinute(m)}
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
                      :{String(m).padStart(2, '0')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {schedulingMessage ? (
          <Text
            style={[
              styles.message,
              {
                color: schedulingMessage.startsWith('已开启')
                  ? SemanticColors.success
                  : theme.textSecondary,
              },
            ]}
          >
            {schedulingMessage}
          </Text>
        ) : null}
        {schedulingBusy ? <ActivityIndicator color={Colors.light.primary} /> : null}
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

function formatTime(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function permissionMessage(p: ReminderPermission): string {
  switch (p) {
    case 'denied':
      return '系统通知权限被拒绝,需要去系统设置里开启';
    case 'undetermined':
      return '需要授予通知权限才能开启提醒';
    case 'unsupported':
      return '当前平台不支持本地通知';
    case 'granted':
      return '已开启';
  }
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
  reminderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeBlock: {
    gap: Spacing.two,
  },
  timeLabel: {
    fontSize: FontSize.small,
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  timeCell: {
    width: 44,
    paddingVertical: Spacing.one,
    borderRadius: Radii.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  timeCellLabel: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
  },
};
