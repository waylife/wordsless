/**
 * AI settings store — verifies the multi-source blob round-trips
 * through the `ai` / `aiPrompts` settings rows, selection changes,
 * custom source/model/prompt management, and the legacy single-model
 * migration path.
 */
import { settingsRepository } from '@/db/repositories/settings';
import { useAiSettingsStore } from '@/stores/ai-store';
import { defaultAiSettings, DEFAULT_PROMPT_ID } from '@/core/ai/models';

import { createTestDb, type TestDbHandle } from '@/db/__tests__/test-db';

jest.mock('@/db/client', () => ({
  getDb: jest.fn(),
}));

function mockedGetDb(): jest.Mock {
  return jest.requireMock('@/db/client').getDb as jest.Mock;
}

async function resetStore(handle: TestDbHandle) {
  await settingsRepository._deleteAllForTests(handle.db);
  useAiSettingsStore.setState({ blob: null, hydrated: false });
}

async function resetToDefaults(handle: TestDbHandle) {
  await resetStore(handle);
  useAiSettingsStore.setState({ blob: defaultAiSettings(), hydrated: true });
}

describe('useAiSettingsStore', () => {
  let handle: TestDbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
    const getDb = mockedGetDb();
    getDb.mockReset();
    getDb.mockResolvedValue(handle.db);
    await resetStore(handle);
  });
  afterEach(() => handle.close());

  it('hydrates to defaults on a fresh DB', async () => {
    await useAiSettingsStore.getState().hydrate();
    const s = useAiSettingsStore.getState();
    expect(s.hydrated).toBe(true);
    expect(s.blob?.sources.map((x) => x.id)).toEqual(['builtin:minimax', 'builtin:deepseek']);
    expect(s.blob?.selection).toBe('builtin:minimax::MiniMax-M2.5');
    expect(s.blob?.activePromptId).toBe(DEFAULT_PROMPT_ID);
  });

  it('persists selection changes across re-hydration', async () => {
    await resetToDefaults(handle);
    await useAiSettingsStore.getState().setSelection('builtin:deepseek', 'deepseek-v4-pro');

    // Simulate an app restart.
    useAiSettingsStore.setState({ blob: null, hydrated: false });
    await useAiSettingsStore.getState().hydrate();
    expect(useAiSettingsStore.getState().blob?.selection).toBe('builtin:deepseek::deepseek-v4-pro');
    const active = useAiSettingsStore.getState().activeModel();
    expect(active?.source.id).toBe('builtin:deepseek');
    expect(active?.model.value).toBe('deepseek-v4-pro');
  });

  it('adds and persists a custom source with its first model', async () => {
    await resetToDefaults(handle);
    const source = await useAiSettingsStore.getState().addCustomSource({
      label: '智谱',
      apiStyle: 'openai',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      firstModel: 'glm-4.7',
    });
    expect(source.id).toMatch(/^custom:/);
    expect(source.keySlot).toContain('ai_key_');

    useAiSettingsStore.setState({ blob: null, hydrated: false });
    await useAiSettingsStore.getState().hydrate();
    const blob = useAiSettingsStore.getState().blob!;
    const reloaded = blob.sources.find((s) => s.id === source.id);
    expect(reloaded?.label).toBe('智谱');
    expect(reloaded?.customModels.map((m) => m.value)).toEqual(['glm-4.7']);
  });

  it('adds and removes custom models on a built-in source', async () => {
    await resetToDefaults(handle);
    const store = useAiSettingsStore.getState();
    await store.addCustomModel('builtin:minimax', { value: 'MiniMax-M9' });
    expect(
      useAiSettingsStore
        .getState()
        .blob?.sources.find((s) => s.id === 'builtin:minimax')!
        .customModels.map((m) => m.value),
    ).toEqual(['MiniMax-M9']);

    await useAiSettingsStore.getState().removeModel('builtin:minimax', 'MiniMax-M9');
    expect(
      useAiSettingsStore.getState().blob?.sources.find((s) => s.id === 'builtin:minimax')!
        .customModels,
    ).toHaveLength(0);
  });

  it('removing the selected model re-points the selection', async () => {
    await resetToDefaults(handle);
    // 默认 selection 是 builtin:minimax::MiniMax-M2.5；删掉它。
    await useAiSettingsStore.getState().removeModel('builtin:minimax', 'MiniMax-M2.5');
    const blob = useAiSettingsStore.getState().blob!;
    expect(blob.selection).not.toBe('builtin:minimax::MiniMax-M2.5');
    const active = useAiSettingsStore.getState().activeModel();
    expect(active).not.toBeNull();
  });

  it('manages custom prompts: add → activate → remove falls back', async () => {
    await resetToDefaults(handle);
    const created = await useAiSettingsStore.getState().addPrompt({
      label: '我的版本',
      prompt: 'Custom system prompt.',
    });
    expect(created.id).toMatch(/^prompt:/);

    await useAiSettingsStore.getState().setActivePrompt(created.id);
    expect(useAiSettingsStore.getState().blob?.activePromptId).toBe(created.id);

    useAiSettingsStore.setState({ blob: null, hydrated: false });
    await useAiSettingsStore.getState().hydrate();
    expect(useAiSettingsStore.getState().blob?.activePromptId).toBe(created.id);

    await useAiSettingsStore.getState().removePrompt(created.id);
    expect(useAiSettingsStore.getState().blob?.activePromptId).toBe(DEFAULT_PROMPT_ID);
  });

  it('migrates the legacy app.model field to a selection on first hydrate', async () => {
    await settingsRepository.set(handle.db, 'app', { model: 'MiniMax-M2.1' });
    await useAiSettingsStore.getState().hydrate();
    const blob = useAiSettingsStore.getState().blob!;
    expect(blob.selection).toBe('builtin:minimax::MiniMax-M2.1');
  });

  it('does not override an existing selection during legacy migration', async () => {
    await settingsRepository.set(handle.db, 'app', { model: 'MiniMax-M2.1' });
    await settingsRepository.set(handle.db, 'ai', {
      sources: defaultAiSettings().sources,
      selection: 'builtin:deepseek::deepseek-flash',
    });
    await useAiSettingsStore.getState().hydrate();
    expect(useAiSettingsStore.getState().blob?.selection).toBe('builtin:deepseek::deepseek-flash');
  });
});
