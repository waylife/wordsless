/**
 * AI settings store — runtime mirror of the multi-source AI config.
 *
 * Source of truth is the `settings` SQLite table under two keys:
 *
 *   - `ai`        → { sources, selection } — model sources + which
 *                   source::model is active
 *   - `aiPrompts` → { prompts, activePromptId } — AI-explain prompt
 *                   presets (built-in + user-authored) + the active one
 *
 * API keys never live here — each source's key goes to
 * `expo-secure-store` under the source's `keySlot`.
 *
 * Migration: the legacy single `model` field in the `app` settings row
 * maps onto `selection` on first hydrate (see `migrateLegacyAiSettings`
 * in `core/ai/runtime.ts`).
 */
import { create } from 'zustand';

import {
  coerceAiSettings,
  defaultAiSettings,
  resolveSelection,
  DEFAULT_PROMPT_ID,
  DEFAULT_SELECTION,
  type AiSettingsBlob,
  type StoredModel,
  type StoredModelSource,
  type StoredPromptPreset,
} from '@/core/ai/models';
import { migrateLegacyAiSettings } from '@/core/ai/runtime';
import { settingsRepository } from '@/db/repositories/settings';
import { getDb } from '@/db/client';

const SOURCES_KEY = 'ai';
const PROMPTS_KEY = 'aiPrompts';

export interface AiSettingsState {
  /** Full blob; null until hydrated (callers can also use `hydrated`). */
  blob: AiSettingsBlob | null;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  /** Sources list = built-in catalog (seeded) + user-added. */
  sources: () => StoredModelSource[];
  /** Active source::model, resolved with defaults. */
  activeModel: () => { source: StoredModelSource; model: StoredModel } | null;
  /** Active prompt preset. */
  activePrompt: () => StoredPromptPreset | null;

  // ---- sources / models ----
  setSelection: (sourceId: string, modelValue: string) => Promise<void>;
  addCustomSource: (input: {
    label: string;
    apiStyle: 'openai' | 'anthropic';
    baseUrl: string;
    firstModel: string;
  }) => Promise<StoredModelSource>;
  updateSource: (
    id: string,
    patch: Partial<Pick<StoredModelSource, 'label' | 'baseUrl'>>,
  ) => Promise<void>;
  removeSource: (id: string) => Promise<void>;
  addCustomModel: (
    sourceId: string,
    model: { value: string; label?: string; note?: string },
  ) => Promise<void>;
  removeModel: (sourceId: string, modelValue: string) => Promise<void>;

  // ---- prompts ----
  setActivePrompt: (id: string) => Promise<void>;
  addPrompt: (input: { label: string; prompt: string }) => Promise<StoredPromptPreset>;
  updatePrompt: (id: string, patch: { label?: string; prompt?: string }) => Promise<void>;
  removePrompt: (id: string) => Promise<void>;
}

function genId(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}

/** Persist the mutable halves of the blob (sources+selection / prompts+active). */
async function persistBlob(blob: AiSettingsBlob): Promise<void> {
  try {
    const db = await getDb();
    await settingsRepository.set(db, SOURCES_KEY, {
      sources: blob.sources,
      selection: blob.selection,
    });
    await settingsRepository.set(db, PROMPTS_KEY, {
      prompts: blob.prompts,
      activePromptId: blob.activePromptId,
    });
  } catch {
    // Persistence failure is non-fatal — in-memory state still wins
    // for this session.
  }
}

export const useAiSettingsStore = create<AiSettingsState>((set, get) => ({
  blob: null,
  hydrated: false,

  async hydrate() {
    try {
      const db = await getDb();
      const sourcesRow = await settingsRepository.get<{
        sources: unknown;
        selection: unknown;
      }>(db, SOURCES_KEY);
      const promptsRow = await settingsRepository.get<{
        prompts: unknown;
        activePromptId: unknown;
      }>(db, PROMPTS_KEY);
      const merged = {
        sources: sourcesRow?.sources,
        selection: sourcesRow?.selection,
        prompts: promptsRow?.prompts,
        activePromptId: promptsRow?.activePromptId,
      };
      let blob = coerceAiSettings(merged);

      // One-time migration from the legacy single-model settings field.
      const appRow = await settingsRepository.get<{ model?: unknown }>(db, 'app');
      const legacyModel = typeof appRow?.model === 'string' ? appRow.model : null;
      const migrated = await migrateLegacyAiSettings(blob, legacyModel);
      blob = migrated.blob;
      // Final fallback: never leave a null selection in the store —
      // `resolveSelection` also defends, but a concrete value keeps
      // the UI in sync with what it displays.
      if (blob.selection == null) {
        blob = { ...blob, selection: DEFAULT_SELECTION };
      }

      set({ blob, hydrated: true });
      return;
    } catch {
      // DB not ready yet — fall through to defaults and let a later
      // hydrate() call win.
    }
    set({ blob: defaultAiSettings(), hydrated: true });
  },

  sources() {
    return get().blob?.sources ?? [];
  },

  activeModel() {
    const blob = get().blob;
    if (!blob) return null;
    return resolveSelection(blob);
  },

  activePrompt() {
    const blob = get().blob;
    if (!blob) return null;
    return (
      blob.prompts.find((p) => p.id === blob.activePromptId) ??
      blob.prompts.find((p) => p.id === DEFAULT_PROMPT_ID) ??
      null
    );
  },

  async setSelection(sourceId, modelValue) {
    const blob = requireBlob();
    const next: AiSettingsBlob = {
      ...blob,
      selection: `${sourceId}::${modelValue}`,
    };
    set({ blob: next });
    await persistBlob(next);
  },

  async addCustomSource(input) {
    const blob = requireBlob();
    const source: StoredModelSource = {
      id: genId('custom'),
      label: input.label,
      apiStyle: input.apiStyle,
      baseUrl: input.baseUrl,
      keySlot: '', // assigned below from the generated id
      customModels: [
        {
          value: input.firstModel,
          label: input.firstModel,
          note: '自定义',
          builtin: false,
        },
      ],
      hiddenBuiltinModels: [],
    };
    source.keySlot = `ai_key_${source.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const next: AiSettingsBlob = { ...blob, sources: [...blob.sources, source] };
    set({ blob: next });
    await persistBlob(next);
    return source;
  },

  async updateSource(id, patch) {
    const blob = requireBlob();
    const next: AiSettingsBlob = {
      ...blob,
      sources: blob.sources.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    };
    set({ blob: next });
    await persistBlob(next);
  },

  async removeSource(id) {
    const blob = requireBlob();
    if (blob.sources.length <= 1) return; // never leave zero sources
    const sources = blob.sources.filter((s) => s.id !== id);
    const selection =
      blob.selection?.startsWith(`${id}::`) || !blob.selection ? null : blob.selection;
    const next: AiSettingsBlob = { ...blob, sources, selection };
    // Re-point selection at a sensible default when we just removed it.
    if (!next.selection) {
      const fallback = resolveSelection(next);
      next.selection = fallback ? `${fallback.source.id}::${fallback.model.value}` : null;
    }
    set({ blob: next });
    await persistBlob(next);
  },

  async addCustomModel(sourceId, model) {
    const blob = requireBlob();
    const next: AiSettingsBlob = {
      ...blob,
      sources: blob.sources.map((s) =>
        s.id === sourceId
          ? {
              ...s,
              customModels: [
                ...s.customModels.filter((m) => m.value !== model.value),
                {
                  value: model.value,
                  label: model.label ?? model.value,
                  note: model.note ?? '自定义',
                  builtin: false,
                },
              ],
            }
          : s,
      ),
    };
    set({ blob: next });
    await persistBlob(next);
  },

  async removeModel(sourceId, modelValue) {
    const blob = requireBlob();
    const next: AiSettingsBlob = {
      ...blob,
      sources: blob.sources.map((s) => {
        if (s.id !== sourceId) return s;
        const isBuiltin = s.customModels.every((m) => m.value !== modelValue);
        return isBuiltin
          ? {
              ...s,
              hiddenBuiltinModels: [...s.hiddenBuiltinModels, modelValue],
            }
          : {
              ...s,
              customModels: s.customModels.filter((m) => m.value !== modelValue),
            };
      }),
    };
    // If we just removed the selected model, re-point at the first
    // remaining one.
    if (next.selection === `${sourceId}::${modelValue}`) {
      const src = next.sources.find((s) => s.id === sourceId);
      if (src) {
        const models = resolveSelection({ ...next, selection: null });
        const target =
          src.customModels.find((m) => m.value !== modelValue) ??
          (models ? models.model : undefined);
        next.selection = target ? `${sourceId}::${target.value}` : null;
      }
    }
    set({ blob: next });
    await persistBlob(next);
  },

  async setActivePrompt(id) {
    const blob = requireBlob();
    const next: AiSettingsBlob = { ...blob, activePromptId: id };
    set({ blob: next });
    await persistBlob(next);
  },

  async addPrompt(input) {
    const blob = requireBlob();
    const preset: StoredPromptPreset = {
      id: genId('prompt'),
      label: input.label,
      prompt: input.prompt,
      builtin: false,
    };
    const next: AiSettingsBlob = { ...blob, prompts: [...blob.prompts, preset] };
    set({ blob: next });
    await persistBlob(next);
    return preset;
  },

  async updatePrompt(id, patch) {
    const blob = requireBlob();
    const next: AiSettingsBlob = {
      ...blob,
      prompts: blob.prompts.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    };
    set({ blob: next });
    await persistBlob(next);
  },

  async removePrompt(id) {
    const blob = requireBlob();
    if (blob.prompts.length <= 1) return; // never leave zero prompts
    const prompts = blob.prompts.filter((p) => p.id !== id);
    const activePromptId = blob.activePromptId === id ? DEFAULT_PROMPT_ID : blob.activePromptId;
    const next: AiSettingsBlob = { ...blob, prompts, activePromptId };
    set({ blob: next });
    await persistBlob(next);
  },
}));

function requireBlob(): AiSettingsBlob {
  const blob = useAiSettingsStore.getState().blob;
  if (!blob) {
    // Pre-hydrate write (shouldn't happen from the UI, which renders
    // after hydrate) — degrade to defaults rather than crash.
    return defaultAiSettings();
  }
  return blob;
}
