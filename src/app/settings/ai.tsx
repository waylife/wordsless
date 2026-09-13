/**
 * AI 模型设置页 — 多来源 / 多模型 / 自定义 Prompt / 测试预览。
 *
 * 结构（自上而下）:
 *   1. 模型来源列表：每个来源一张卡片，含 API Key 输入、模型
 *      增删、点选当前使用的模型（全局唯一激活）。
 *   2. 添加自定义来源：名称 + API 风格（OpenAI/Anthropic）+
 *      baseUrl + 首个模型 id。
 *   3. AI 注释 Prompt：内置预设 + 用户自定义，单选激活，可编辑
 *      /删除自定义项。
 *   4. 测试区：用当前激活的来源+模型+Prompt 流式生成一次示例
 *      （固定词 serendipity），结果按词源/助记/例句渲染。
 *
 * 数据全部走 `useAiSettingsStore`（SQLite settings 表 ai / aiPrompts
 * 两个 key），Key 走 expo-secure-store 的 per-source slot。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ModelResultView } from '@/components/model-result-view';
import { streamExplain, getApiKey, setApiKey, clearApiKey, testApiKey } from '@/core/ai/runtime';
import {
  API_STYLE_OPTIONS,
  effectiveModels,
  type ApiStyle,
  type StoredModelSource,
  type StoredPromptPreset,
} from '@/core/ai/models';
import { useAiSettingsStore } from '@/stores/ai-store';
import { Colors, FontSize, FontWeight, Radii, SemanticColors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// 测试用固定示例词 —— 和学习流程同构的 user prompt。
const TEST_WORD = 'serendipity';
const TEST_GLOSS = '意外发现美好事物的能力';
const TEST_USER_PROMPT = `Word: ${TEST_WORD}\nGloss: ${TEST_GLOSS}\nProduce the JSON.`;

export default function AiSettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const blob = useAiSettingsStore((s) => s.blob);
  const hydrated = useAiSettingsStore((s) => s.hydrated);
  const setSelection = useAiSettingsStore((s) => s.setSelection);
  const addCustomSource = useAiSettingsStore((s) => s.addCustomSource);
  const removeSource = useAiSettingsStore((s) => s.removeSource);
  const addCustomModel = useAiSettingsStore((s) => s.addCustomModel);
  const removeModel = useAiSettingsStore((s) => s.removeModel);
  const setActivePrompt = useAiSettingsStore((s) => s.setActivePrompt);
  const addPrompt = useAiSettingsStore((s) => s.addPrompt);
  const updatePrompt = useAiSettingsStore((s) => s.updatePrompt);
  const removePrompt = useAiSettingsStore((s) => s.removePrompt);

  const active = useMemo(() => {
    if (!blob) return null;
    const [sourceId, modelValue] = (blob.selection ?? '').split('::');
    const source = blob.sources.find((s) => s.id === sourceId) ?? null;
    return { sourceId, modelValue, source };
  }, [blob]);

  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [promptEditor, setPromptEditor] = useState<
    { mode: 'create' } | { mode: 'edit'; preset: StoredPromptPreset } | null
  >(null);

  if (!hydrated || !blob) {
    return (
      <View style={[styles.screen, styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={Colors.light.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: theme.background }]}
      contentContainerStyle={[
        styles.screenContent,
        {
          // 根 Stack 路由 headerShown=false，顶部安全区要自己补，
          // 否则「返回」和标题会被状态栏/灵动岛压住。
          paddingTop: insets.top + Spacing.three,
          paddingBottom: insets.bottom + Spacing.six,
        },
      ]}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backLabel, { color: Colors.light.primary }]}>‹ 返回</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>AI 模型设置</Text>
      </View>

      <Text style={[styles.pageHint, { color: theme.textSecondary }]}>
        支持多个模型来源（MiniMax / DeepSeek 优先内置，也可添加任意 OpenAI 或 Anthropic
        风格的自定义来源）。每个来源可配置多个模型，全局同一时刻只使用一个。
      </Text>

      {/* ---------- 模型来源 ---------- */}
      {blob.sources.map((source) => (
        <SourceCard
          key={source.id}
          source={source}
          activeModelValue={active?.sourceId === source.id ? active.modelValue : null}
          onSelectModel={(modelValue) => void setSelection(source.id, modelValue)}
          onAddModel={(value) => void addCustomModel(source.id, { value })}
          onRemoveModel={(value) => void removeModel(source.id, value)}
          onRemoveSource={() => {
            if (source.id.startsWith('builtin:')) return;
            Alert.alert('删除来源', `确定删除「${source.label}」？其 API Key 也会一并清除。`, [
              { text: '取消', style: 'cancel' },
              {
                text: '删除',
                style: 'destructive',
                onPress: () => {
                  void clearApiKey(source);
                  void removeSource(source.id);
                },
              },
            ]);
          }}
        />
      ))}

      <Button
        label="＋ 添加自定义来源"
        variant="secondary"
        onPress={() => setAddSourceOpen(true)}
        style={styles.addAction}
      />

      {/* ---------- AI 注释 Prompt ---------- */}
      <Card variant="flat" padding="four" radius="lg" style={styles.card}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>AI 注释 Prompt</Text>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          内置多个预设，也支持自定义；可以保留多个，同一时刻只有一个生效。
        </Text>
        {blob.prompts.map((preset) => {
          const activeP = preset.id === blob.activePromptId;
          return (
            <View
              key={preset.id}
              style={[
                styles.promptRow,
                { borderColor: activeP ? Colors.light.primary : theme.border },
              ]}
            >
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: activeP }}
                style={styles.promptSelect}
                onPress={() => void setActivePrompt(preset.id)}
              >
                <View
                  style={[
                    styles.radio,
                    {
                      borderColor: activeP ? Colors.light.primary : theme.border,
                      backgroundColor: activeP ? Colors.light.primary : 'transparent',
                    },
                  ]}
                />
                <View style={styles.promptMeta}>
                  <Text style={[styles.promptLabel, { color: theme.text }]}>
                    {preset.label}
                    {preset.builtin ? '（内置）' : ''}
                  </Text>
                  <Text
                    numberOfLines={2}
                    style={[styles.promptPreview, { color: theme.textSecondary }]}
                  >
                    {preset.prompt.slice(0, 120)}
                  </Text>
                </View>
              </Pressable>
              <View style={styles.promptActions}>
                <Button
                  label="编辑"
                  variant="ghost"
                  size="sm"
                  onPress={() => setPromptEditor({ mode: 'edit', preset })}
                />
                {!preset.builtin ? (
                  <Button
                    label="删除"
                    variant="ghost"
                    size="sm"
                    onPress={() => void removePrompt(preset.id)}
                  />
                ) : null}
              </View>
            </View>
          );
        })}
        <Button
          label="＋ 新建自定义 Prompt"
          variant="secondary"
          onPress={() => setPromptEditor({ mode: 'create' })}
          style={styles.addAction}
        />
      </Card>

      {/* ---------- 测试 ---------- */}
      {/* key 随 selection/prompt 变化 → 配置切换时整个子树重挂载，
          上一次的测试结果自动清空，避免 effect 里 setState。 */}
      <Card
        variant="flat"
        padding="four"
        radius="lg"
        style={styles.card}
        key={`${blob.selection ?? ''}::${blob.activePromptId}`}
      >
        <TestArea activeSource={active?.source ?? null} modelValue={active?.modelValue ?? null} />
      </Card>

      {/* ---------- 添加自定义来源弹层 ---------- */}
      <AddSourceModal
        visible={addSourceOpen}
        onClose={() => setAddSourceOpen(false)}
        onSubmit={async (input) => {
          await addCustomSource(input);
          setAddSourceOpen(false);
        }}
      />

      {/* ---------- Prompt 编辑弹层 ---------- */}
      <PromptEditorModal
        state={promptEditor}
        onClose={() => setPromptEditor(null)}
        onSubmit={async (label, prompt, id) => {
          if (id) {
            await updatePrompt(id, { label, prompt });
          } else {
            await addPrompt({ label, prompt });
          }
          setPromptEditor(null);
        }}
      />
    </ScrollView>
  );
}

// ---- 测试区（独立组件：随配置 key 重挂载，天然清空旧结果） ----------

function TestArea({
  activeSource,
  modelValue,
}: {
  activeSource: StoredModelSource | null;
  modelValue: string | null | undefined;
}) {
  const theme = useTheme();
  const [testing, setTesting] = useState(false);
  const [testText, setTestText] = useState('');
  const [testError, setTestError] = useState<string | null>(null);

  const runTest = useCallback(async () => {
    if (!activeSource) return;
    setTesting(true);
    setTestText('');
    setTestError(null);
    await streamExplain(
      { word: { spelling: TEST_WORD, gloss: TEST_GLOSS }, prompt: TEST_USER_PROMPT },
      {
        onDelta: (delta) => setTestText((prev) => prev + delta),
        onDone: () => setTesting(false),
        onError: (err) => {
          setTesting(false);
          setTestError(err.message);
        },
      },
    );
  }, [activeSource]);

  return (
    <>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>测试效果</Text>
      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        {activeSource
          ? `用当前配置（${activeSource.label} · ${modelValue ?? ''} · 当前 Prompt）对示例词「${TEST_WORD}」流式生成一次。`
          : '先选择一个模型。'}
      </Text>
      <Button
        label={testing ? '生成中…' : '测试当前配置'}
        onPress={() => void runTest()}
        loading={testing}
        disabled={!activeSource}
      />
      {testError ? (
        <Text style={[styles.message, { color: SemanticColors.danger }]}>{testError}</Text>
      ) : null}
      {testText || testing ? (
        <View style={[styles.testResult, { borderColor: theme.border }]} testID="ai-test-result">
          <ModelResultView text={testText} />
        </View>
      ) : null}
    </>
  );
}

// ---- 单个来源卡片 --------------------------------------------------------

function SourceCard({
  source,
  activeModelValue,
  onSelectModel,
  onAddModel,
  onRemoveModel,
  onRemoveSource,
}: {
  source: StoredModelSource;
  /** 当前全局激活模型是否属于这个来源（值 = 模型 id，null = 不属于）。 */
  activeModelValue: string | null | undefined;
  onSelectModel: (modelValue: string) => void;
  onAddModel: (value: string) => void;
  onRemoveModel: (value: string) => void;
  onRemoveSource: () => void;
}) {
  const theme = useTheme();
  const [keyInput, setKeyInput] = useState('');
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [testingKey, setTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [newModel, setNewModel] = useState('');
  const [expanded, setExpanded] = useState(false);

  const models = effectiveModels(source);
  const isBuiltin = source.id.startsWith('builtin:');

  useEffect(() => {
    void (async () => {
      try {
        const k = await getApiKey(source);
        setHasKey(Boolean(k));
        setKeyInput(k);
      } catch {
        setHasKey(false);
      }
    })();
    // Re-read when the source identity changes (cards are keyed by id so
    // this effectively runs once per source).
  }, [source]);

  const onTest = async () => {
    const key = keyInput.trim();
    setTestResult(null);
    if (!key) {
      setTestResult({ ok: false, message: '请先填写 API Key' });
      return;
    }
    setTestingKey(true);
    try {
      const activeModel = activeModelValue ?? models[0]?.value;
      const result = await testApiKey(key, source, { model: activeModel });
      if (result.ok) {
        await setApiKey(source, key);
        setHasKey(true);
        setTestResult({
          ok: true,
          message: `测试通过（${result.model} · ${result.latencyMs} ms），Key 已保存`,
        });
      } else {
        setTestResult({ ok: false, message: `测试失败：${result.message}` });
      }
    } finally {
      setTestingKey(false);
    }
  };

  const styleInfo = API_STYLE_OPTIONS.find((o) => o.value === source.apiStyle);

  return (
    <Card variant="flat" padding="four" radius="lg" style={styles.card}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setExpanded((v) => !v)}
        style={styles.sourceHeader}
      >
        <View style={styles.sourceTitleRow}>
          <Text style={[styles.sourceTitle, { color: theme.text }]}>{source.label}</Text>
          {activeModelValue ? (
            <View style={[styles.badge, { backgroundColor: SemanticColors.successSoft }]}>
              <Text style={styles.badgeText}>使用中</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.hint, { color: theme.textSecondary }]} numberOfLines={1}>
          {styleInfo?.label} · {source.baseUrl}
        </Text>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          {expanded ? '▾ 收起' : '▸ 展开 Key / 模型管理'}
        </Text>
      </Pressable>

      {expanded ? (
        <View style={styles.sourceBody}>
          {/* API Key */}
          <View style={styles.keyRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: hasKey ? SemanticColors.success : SemanticColors.excluded },
              ]}
            />
            <Text style={[styles.statusText, { color: theme.textSecondary }]}>
              {hasKey == null ? '检查中…' : hasKey ? 'Key 已配置' : 'Key 未配置'}
            </Text>
          </View>
          <TextInput
            value={keyInput}
            onChangeText={(text) => {
              setKeyInput(text);
              setTestResult(null);
            }}
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
              label="保存 Key"
              onPress={() =>
                void (async () => {
                  await setApiKey(source, keyInput);
                  setHasKey(Boolean(keyInput.trim()));
                  setTestResult({ ok: true, message: '已保存到钥匙串' });
                })()
              }
              disabled={testingKey}
              size="sm"
            />
            <Button
              label="测试并保存"
              variant="secondary"
              onPress={() => void onTest()}
              loading={testingKey}
              disabled={!keyInput.trim()}
              size="sm"
            />
            {hasKey ? (
              <Button
                label="清除"
                variant="ghost"
                size="sm"
                onPress={() =>
                  void (async () => {
                    await clearApiKey(source);
                    setKeyInput('');
                    setHasKey(false);
                  })()
                }
                disabled={testingKey}
              />
            ) : null}
            {!isBuiltin ? (
              <Button label="删除来源" variant="danger" size="sm" onPress={onRemoveSource} />
            ) : null}
          </View>
          {testResult ? (
            <Text
              style={[
                styles.message,
                { color: testResult.ok ? SemanticColors.success : SemanticColors.danger },
              ]}
            >
              {testResult.message}
            </Text>
          ) : null}

          {/* 模型列表 */}
          <Text style={[styles.subLabel, { color: theme.textSecondary }]}>模型（点选使用）</Text>
          <View style={styles.row}>
            {models.map((m) => {
              const active = activeModelValue === m.value;
              return (
                <View key={m.value} style={styles.modelChipWrap}>
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${m.value} · ${m.note}`}
                    onPress={() => onSelectModel(m.value)}
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
                      {m.label}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`删除模型 ${m.value}`}
                    onPress={() => onRemoveModel(m.value)}
                    style={styles.modelRemove}
                    hitSlop={8}
                  >
                    <Text style={[styles.modelRemoveLabel, { color: theme.textSecondary }]}>×</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
          {(() => {
            const cur = models.find((m) => m.value === activeModelValue);
            return cur ? (
              <Text style={[styles.hint, { color: theme.textSecondary }]}>
                当前：{cur.value} · {cur.note}
              </Text>
            ) : null;
          })()}

          {/* 添加自定义模型 */}
          <View style={styles.inlineAdd}>
            <TextInput
              value={newModel}
              onChangeText={setNewModel}
              placeholder="模型 ID，如 gpt-4o-mini"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.input,
                styles.inlineInput,
                {
                  backgroundColor: theme.backgroundElement,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
            />
            <Button
              label="添加模型"
              variant="secondary"
              size="sm"
              disabled={!newModel.trim()}
              onPress={() => {
                onAddModel(newModel.trim());
                setNewModel('');
              }}
            />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

// ---- 添加来源弹层 --------------------------------------------------------

function AddSourceModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: {
    label: string;
    apiStyle: ApiStyle;
    baseUrl: string;
    firstModel: string;
  }) => Promise<void>;
}) {
  const theme = useTheme();
  const [label, setLabel] = useState('');
  const [apiStyle, setApiStyle] = useState<ApiStyle>('openai');
  const [baseUrl, setBaseUrl] = useState('');
  const [firstModel, setFirstModel] = useState('');
  const [busy, setBusy] = useState(false);

  const valid = label.trim() && baseUrl.trim() && firstModel.trim();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: theme.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>添加自定义来源</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭"
              hitSlop={8}
              onPress={() => (busy ? undefined : onClose())}
              style={({ pressed }) => [styles.modalClose, pressed && styles.modalClosePressed]}
            >
              <Text style={[styles.modalCloseLabel, { color: theme.textSecondary }]}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              支持 OpenAI 风格（/chat/completions）与 Anthropic 风格（/v1/messages）接口。
            </Text>

            <Text style={[styles.subLabel, { color: theme.textSecondary }]}>名称</Text>
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="如 智谱 / Moonshot / 自建网关"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                {
                  backgroundColor: theme.backgroundElement,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
            />

            <Text style={[styles.subLabel, { color: theme.textSecondary }]}>API 风格</Text>
            <View style={styles.row}>
              {API_STYLE_OPTIONS.map((opt) => {
                const active = opt.value === apiStyle;
                return (
                  <Pressable
                    key={opt.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    onPress={() => setApiStyle(opt.value)}
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
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              {API_STYLE_OPTIONS.find((o) => o.value === apiStyle)?.hint}
            </Text>

            <Text style={[styles.subLabel, { color: theme.textSecondary }]}>Base URL</Text>
            <TextInput
              value={baseUrl}
              onChangeText={setBaseUrl}
              placeholder="https://api.example.com/v1"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[
                styles.input,
                {
                  backgroundColor: theme.backgroundElement,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
            />

            <Text style={[styles.subLabel, { color: theme.textSecondary }]}>首个模型 ID</Text>
            <TextInput
              value={firstModel}
              onChangeText={setFirstModel}
              placeholder="如 glm-4.7 / kimi-k2 / claude-sonnet-4"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.input,
                {
                  backgroundColor: theme.backgroundElement,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
            />
          </ScrollView>

          <View style={styles.modalActions}>
            <Button label="取消" variant="ghost" onPress={onClose} disabled={busy} />
            <Button
              label={busy ? '添加中…' : '添加'}
              disabled={!valid || busy}
              loading={busy}
              onPress={() => {
                setBusy(true);
                void onSubmit({
                  label: label.trim(),
                  apiStyle,
                  baseUrl: baseUrl.trim(),
                  firstModel: firstModel.trim(),
                }).finally(() => setBusy(false));
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---- Prompt 编辑弹层 -------------------------------------------------------

function PromptEditorModal({
  state,
  onClose,
  onSubmit,
}: {
  state: { mode: 'create' } | { mode: 'edit'; preset: StoredPromptPreset } | null;
  onClose: () => void;
  onSubmit: (label: string, prompt: string, id?: string) => Promise<void>;
}) {
  const theme = useTheme();
  const editing = state?.mode === 'edit';
  const preset = state?.mode === 'edit' ? state.preset : null;
  // Re-seed the fields each time the modal opens for a different target.
  const [label, setLabel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [seedKey, setSeedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const wantKey = state ? (state.mode === 'edit' ? state.preset.id : 'create') : null;
  if (state && wantKey !== seedKey) {
    setSeedKey(wantKey);
    setLabel(preset?.label ?? '');
    setPrompt(preset?.prompt ?? '');
  }

  const valid = label.trim().length > 0 && prompt.trim().length > 0;

  return (
    <Modal
      visible={state != null}
      transparent
      animationType="fade"
      onRequestClose={() => (busy ? undefined : onClose())}
    >
      <View style={styles.modalBackdrop}>
        <View
          style={[styles.modalCard, styles.modalCardWide, { backgroundColor: theme.background }]}
        >
          {/* 头部固定：标题 + 右上角关闭。iOS Modal 没有系统返回手势，
              必须提供始终可见的关闭出口。 */}
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {editing ? '编辑 Prompt' : '新建自定义 Prompt'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭"
              hitSlop={8}
              onPress={() => (busy ? undefined : onClose())}
              style={({ pressed }) => [styles.modalClose, pressed && styles.modalClosePressed]}
            >
              <Text style={[styles.modalCloseLabel, { color: theme.textSecondary }]}>✕</Text>
            </Pressable>
          </View>

          {/* 表单区可滚动：超长 Prompt 文本不会再把底部按钮挤出屏幕。 */}
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              System prompt。输出需保持 JSON（root / mnemonic /
              examples），否则学习页无法结构化渲染。
            </Text>

            <Text style={[styles.subLabel, { color: theme.textSecondary }]}>名称</Text>
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="如 高考例句强化版"
              placeholderTextColor={theme.textSecondary}
              editable={!editing || !preset?.builtin}
              style={[
                styles.input,
                {
                  backgroundColor: theme.backgroundElement,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
            />

            <Text style={[styles.subLabel, { color: theme.textSecondary }]}>Prompt 内容</Text>
            <TextInput
              value={prompt}
              onChangeText={setPrompt}
              multiline
              textAlignVertical="top"
              editable={!editing || !preset?.builtin}
              style={[
                styles.input,
                styles.promptInput,
                {
                  backgroundColor: theme.backgroundElement,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
            />
          </ScrollView>

          {/* 底部按钮固定在卡片内，不随内容滚动。 */}
          <View style={styles.modalActions}>
            <Button label="取消" variant="ghost" onPress={onClose} disabled={busy} />
            <Button
              label={busy ? '保存中…' : '保存'}
              disabled={!valid || busy}
              loading={busy}
              onPress={() => {
                setBusy(true);
                void onSubmit(label.trim(), prompt.trim(), preset?.id).finally(() =>
                  setBusy(false),
                );
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---- styles ---------------------------------------------------------------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  backBtn: {
    paddingVertical: Spacing.one,
    paddingRight: Spacing.two,
  },
  backLabel: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
  },
  title: {
    fontSize: FontSize.title,
    fontWeight: FontWeight.bold,
  },
  pageHint: {
    fontSize: FontSize.small,
    lineHeight: 20,
  },
  card: {
    gap: Spacing.three,
  },
  sectionTitle: {
    fontSize: FontSize.subtitle,
    fontWeight: FontWeight.semibold,
  },
  hint: {
    fontSize: FontSize.small,
  },
  subLabel: {
    fontSize: FontSize.small,
    fontWeight: FontWeight.medium,
    marginTop: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  addAction: {
    alignSelf: 'flex-start',
  },
  input: {
    borderRadius: Radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: FontSize.body,
  },
  inlineAdd: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  inlineInput: {
    flex: 1,
  },
  message: {
    fontSize: FontSize.small,
  },
  sourceHeader: {
    gap: Spacing.half,
  },
  sourceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  sourceTitle: {
    fontSize: FontSize.subtitle,
    fontWeight: FontWeight.semibold,
    flex: 1,
  },
  sourceBody: {
    gap: Spacing.two,
  },
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radii.pill,
  },
  badgeText: {
    fontSize: FontSize.caption,
    fontWeight: FontWeight.semibold,
    color: Colors.light.text,
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
  segment: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radii.pill,
    borderWidth: 1,
  },
  segmentLabel: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
  },
  modelChipWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modelRemove: {
    marginLeft: -Spacing.one,
    marginBottom: Spacing.two,
    width: 20,
    alignItems: 'center',
  },
  modelRemoveLabel: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.bold,
  },
  promptRow: {
    borderRadius: Radii.md,
    borderWidth: 1,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  promptSelect: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    marginTop: 3,
  },
  promptMeta: {
    flex: 1,
    gap: 2,
  },
  promptLabel: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
  },
  promptPreview: {
    fontSize: FontSize.caption,
    lineHeight: 16,
  },
  promptActions: {
    flexDirection: 'row',
    gap: Spacing.one,
    paddingLeft: Spacing.six,
  },
  testResult: {
    borderRadius: Radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  modalCard: {
    borderRadius: Radii.lg,
    padding: Spacing.four,
    gap: Spacing.two,
    width: '100%',
    maxWidth: 480,
    maxHeight: '85%',
    flexShrink: 1,
  },
  modalCardWide: {
    maxHeight: '85%',
    // 关键：允许卡片收缩。否则子内容（超长文本框）会把卡片撑破，
    // 底部「取消/保存」被挤出屏幕，弹窗在 iOS 上无法关闭。
    flexShrink: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  modalClose: {
    width: 28,
    height: 28,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.backgroundElement,
  },
  modalClosePressed: {
    backgroundColor: Colors.light.backgroundSelected,
  },
  modalCloseLabel: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.bold,
  },
  modalScroll: {
    // 让 ScrollView 在 maxHeight 约束内收缩并接管滚动。
    flexShrink: 1,
  },
  modalScrollContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.one,
  },
  modalTitle: {
    fontSize: FontSize.subtitle,
    fontWeight: FontWeight.bold,
    flex: 1,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  promptInput: {
    // 固定高度：长文本在框内滚动，不再无限撑高弹窗。
    height: 220,
  },
});
