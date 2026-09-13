/**
 * Multi-source model catalog tests — pure functions over the persisted
 * blob shape: coercion/repair on hydrate, selection resolution with
 * fallbacks, and effective model merging.
 */
import {
  BUILTIN_PROMPTS,
  BUILTIN_SOURCES,
  DEFAULT_SELECTION,
  coerceAiSettings,
  defaultAiSettings,
  effectiveModels,
  resolveSelection,
  seedSource,
} from '@/core/ai/models';

describe('defaultAiSettings', () => {
  it('seeds every built-in source and prompt', () => {
    const blob = defaultAiSettings();
    expect(blob.sources.map((s) => s.id)).toEqual(
      BUILTIN_SOURCES.map((s) => `builtin:${s.builtinId}`),
    );
    expect(blob.prompts.map((p) => p.id)).toEqual(BUILTIN_PROMPTS.map((p) => p.id));
    expect(blob.selection).toBe(DEFAULT_SELECTION);
    expect(blob.activePromptId).toBe('builtin:default');
  });
});

describe('effectiveModels', () => {
  it('merges built-in and custom models for a source', () => {
    const base = seedSource(BUILTIN_SOURCES[0]!);
    const models = effectiveModels({
      ...base,
      customModels: [{ value: 'MiniMax-M9', label: 'M9', note: '自定义', builtin: false }],
    });
    expect(models.map((m) => m.value)).toContain('MiniMax-M2.5');
    expect(models.map((m) => m.value)).toContain('MiniMax-M9');
    expect(models.every((m) => m.builtin === true || m.value === 'MiniMax-M9')).toBe(true);
  });

  it('hides built-in models listed in hiddenBuiltinModels', () => {
    const base = seedSource(BUILTIN_SOURCES[0]!);
    const models = effectiveModels({ ...base, hiddenBuiltinModels: ['MiniMax-M3'] });
    expect(models.map((m) => m.value)).not.toContain('MiniMax-M3');
  });
});

describe('resolveSelection', () => {
  it('resolves the default selection', () => {
    const blob = defaultAiSettings();
    const r = resolveSelection(blob);
    expect(r?.source.id).toBe('builtin:minimax');
    expect(r?.model.value).toBe('MiniMax-M2.5');
  });

  it('resolves a custom source + custom model', () => {
    const blob = defaultAiSettings();
    blob.sources.push({
      id: 'custom:abc',
      label: 'My GW',
      apiStyle: 'anthropic',
      baseUrl: 'https://gw.example.com',
      keySlot: 'ai_key_custom_abc',
      customModels: [{ value: 'my-model', label: 'my-model', note: '', builtin: false }],
      hiddenBuiltinModels: [],
    });
    blob.selection = 'custom:abc::my-model';
    const r = resolveSelection(blob);
    expect(r?.source.label).toBe('My GW');
    expect(r?.model.value).toBe('my-model');
  });

  it('falls back to the first source when the selection is stale', () => {
    const blob = defaultAiSettings();
    blob.selection = 'builtin:gone::nope';
    const r = resolveSelection(blob);
    expect(r).not.toBeNull();
    expect(r?.source.id).toBe(blob.sources[0]!.id);
    expect(r?.model.value).toBe(effectiveModels(blob.sources[0]!)[0]!.value);
  });

  it('returns null for an empty source list', () => {
    expect(resolveSelection({ sources: [], selection: null })).toBeNull();
  });
});

describe('coerceAiSettings', () => {
  it('returns defaults for garbage input', () => {
    const blob = coerceAiSettings('nonsense');
    expect(blob).toEqual(defaultAiSettings());
  });

  it('repairs missing built-in sources and prompts', () => {
    const blob = coerceAiSettings({
      sources: [
        {
          id: 'builtin:minimax',
          label: 'MiniMax',
          apiStyle: 'openai',
          baseUrl: 'https://api.minimaxi.com/v1',
          keySlot: 'minimax_api_key',
          customModels: [{ value: 'MiniMax-M9', label: 'M9' }],
          hiddenBuiltinModels: ['MiniMax-M2'],
        },
        // deepseek missing → should be re-seeded
      ],
      selection: 'builtin:minimax::MiniMax-M9',
      prompts: [], // all built-in prompts missing → re-seeded
      activePromptId: 'builtin:missing',
    });
    expect(blob.sources.map((s) => s.id)).toContain('builtin:deepseek');
    expect(blob.prompts.map((p) => p.id)).toEqual(
      expect.arrayContaining(BUILTIN_PROMPTS.map((p) => p.id)),
    );
    expect(blob.selection).toBe('builtin:minimax::MiniMax-M9');
    // unknown activePromptId is preserved but prompts exist; caller
    // falls back to builtin:default at read time
    expect(blob.activePromptId).toBe('builtin:missing');
    const models = effectiveModels(blob.sources[0]!);
    expect(models.map((m) => m.value)).not.toContain('MiniMax-M2');
    expect(models.map((m) => m.value)).toContain('MiniMax-M9');
  });

  it('drops malformed source rows but keeps valid ones', () => {
    const blob = coerceAiSettings({
      sources: [
        { id: '', label: 'no id' },
        { id: 'custom:ok', label: 'OK', baseUrl: 'https://x.example' },
      ],
    });
    expect(blob.sources.map((s) => s.id)).not.toContain('');
    expect(blob.sources.map((s) => s.id)).toContain('custom:ok');
  });
});
