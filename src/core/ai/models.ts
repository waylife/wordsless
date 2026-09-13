/**
 * Multi-source model catalog + persisted-shape definitions.
 *
 * The app supports multiple model *sources* (MiniMax, DeepSeek, any
 * OpenAI-compatible or Anthropic-style endpoint). Each source has:
 *
 *   - an `apiStyle` that decides the wire protocol (request shape,
 *     auth header, streaming event format)
 *   - a base URL and a SecureStore slot for its API key
 *   - a list of models — built-in entries from BUILTIN_MODELS plus
 *     user-added custom entries persisted in the AI settings store
 *
 * Built-in sources are identified by a stable `builtinId`; user-added
 * sources use a generated `id`. The persisted store (see
 * `stores/ai-store.ts`) merges the two lists at read time, so this
 * module stays pure and side-effect-free.
 */

/** Wire protocol family for a source. */
export type ApiStyle = 'openai' | 'anthropic';

/** The style used to describe how to call a source's API. */
export interface SourceStyleInfo {
  value: ApiStyle;
  label: string;
  hint: string;
}

export const API_STYLE_OPTIONS: readonly SourceStyleInfo[] = [
  { value: 'openai', label: 'OpenAI 风格', hint: 'POST {baseUrl}/chat/completions，Bearer 鉴权' },
  {
    value: 'anthropic',
    label: 'Anthropic 风格',
    hint: 'POST {baseUrl}/v1/messages，x-api-key 鉴权',
  },
] as const;

/** A built-in source (first-party catalog, not user-created). */
export interface BuiltinSource {
  builtinId: string;
  /** Display name. */
  label: string;
  apiStyle: ApiStyle;
  baseUrl: string;
  /** SecureStore key slot for this source's API key. */
  keySlot: string;
  /** Built-in model list; user-added models merge in at runtime. */
  models: readonly BuiltinModel[];
}

export interface BuiltinModel {
  /** Model id sent to the API, e.g. `MiniMax-M2.5`. */
  value: string;
  /** Short display label. */
  label: string;
  /** One-line quality/cost descriptor. */
  note: string;
}

export const BUILTIN_SOURCES: readonly BuiltinSource[] = [
  {
    builtinId: 'minimax',
    label: 'MiniMax',
    apiStyle: 'openai',
    baseUrl: 'https://api.minimaxi.com/v1',
    keySlot: 'minimax_api_key',
    models: [
      { value: 'MiniMax-M3', label: 'M3', note: '质量最高' },
      { value: 'MiniMax-M2.7', label: 'M2.7', note: '质量/成本平衡' },
      { value: 'MiniMax-M2.5', label: 'M2.5', note: '推荐（默认）' },
      { value: 'MiniMax-M2.1', label: 'M2.1', note: '更省成本' },
      { value: 'MiniMax-M2', label: 'M2', note: '成本最低' },
    ],
  },
  {
    builtinId: 'deepseek',
    label: 'DeepSeek',
    apiStyle: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    keySlot: 'deepseek_api_key',
    models: [
      { value: 'deepseek-flash', label: 'Flash', note: '快速档（默认）' },
      { value: 'deepseek-v4-pro', label: 'V4 Pro', note: '旗舰档' },
    ],
  },
];

/** Default model when nothing has been selected yet. */
export const DEFAULT_SOURCE_ID = 'builtin:minimax';
export const DEFAULT_MODEL = 'MiniMax-M2.5';

// ---- persisted shapes (written to the `settings` SQLite table) ----

/** A model entry as persisted. `builtin: false` rows are user-added. */
export interface StoredModel {
  /** Model id sent to the API. */
  value: string;
  label: string;
  note: string;
  /** True when the entry ships with the app catalog. */
  builtin: boolean;
}

/** A source as persisted: built-ins store only deltas, custom ones everything. */
export interface StoredModelSource {
  /** `builtin:<id>` for catalog sources; `custom:<uuid>` otherwise. */
  id: string;
  label: string;
  apiStyle: ApiStyle;
  baseUrl: string;
  /** SecureStore slot — built-ins reuse the catalog slot. */
  keySlot: string;
  /** Extra (user-added) models beyond the built-in catalog. */
  customModels: StoredModel[];
  /** Override: hide a built-in model (user removed it). */
  hiddenBuiltinModels: string[];
}

/** One AI-explain prompt preset. `builtin: false` rows are user-authored. */
export interface StoredPromptPreset {
  id: string;
  label: string;
  /** Full system prompt text. */
  prompt: string;
  builtin: boolean;
}

export interface AiSettingsBlob {
  sources: StoredModelSource[];
  /** `${sourceId}::${modelValue}` of the currently selected model. */
  selection: string | null;
  prompts: StoredPromptPreset[];
  /** Active prompt preset id. */
  activePromptId: string;
}

export const DEFAULT_SELECTION = `${DEFAULT_SOURCE_ID}::${DEFAULT_MODEL}`;
export const DEFAULT_PROMPT_ID = 'builtin:default';

// ---- built-in prompt presets ----

export const BUILTIN_PROMPTS: readonly StoredPromptPreset[] = [
  {
    id: DEFAULT_PROMPT_ID,
    label: '标准（词源/助记/例句）',
    builtin: true,
    prompt: `You are a vocabulary coach. The user gives you a word and a short gloss; you respond with strict JSON (no prose, no markdown) shaped as:
{
  "root":     "the actual root/affix + one-sentence plain-language explanation, or \\"\\" if unsure",
  "mnemonic": "a memorable association under 30 words, or \\"\\" if unsure",
  "examples": [
    { "en": "one short example sentence (CEFR A2-B1 vocab)", "cn": "中文翻译" },
    { "en": "another natural example", "cn": "中文翻译" }
  ]
}

Rules:
- examples MUST be an array with 3 to 5 entries (never 0, never 1 or 2 unless the word genuinely can't support more).
- Every entry has both "en" and "cn" non-empty strings.
- Sentences should be varied: cover different contexts (formal/informal, past/present), don't just reword the same idea 5 times.
- Use only words a typical CET-4 student already knows.
- Output exactly one JSON object, no commentary.`,
  },
  {
    id: 'builtin:concise',
    label: '精简（只给例句）',
    builtin: true,
    prompt: `You are a vocabulary coach. The user gives you a word and a short gloss; you respond with strict JSON (no prose, no markdown) shaped as:
{
  "examples": [
    { "en": "one short example sentence (CEFR A2-B1 vocab)", "cn": "中文翻译" },
    { "en": "another natural example", "cn": "中文翻译" },
    { "en": "a third example in a different context", "cn": "中文翻译" }
  ]
}

Rules:
- Output ONLY "examples"; do not include "root" or "mnemonic".
- Every entry has both "en" and "cn" non-empty strings.
- Sentences should be varied: cover different contexts (formal/informal, past/present).
- Use only words a typical CET-4 student already knows.
- Output exactly one JSON object, no commentary.`,
  },
];

// ---- pure helpers over the persisted blob ----

export interface ResolvedModel {
  source: StoredModelSource;
  /** The selected model entry (built-in or custom). */
  model: StoredModel;
}

/** Look up a source row by id (handles both builtin: and custom: ids). */
export function findSource(
  sources: StoredModelSource[],
  id: string | null,
): StoredModelSource | null {
  if (!id) return null;
  return sources.find((s) => s.id === id) ?? null;
}

/**
 * Resolve the selected model against a source list. Falls back to the
 * default selection (and then to the first available source) so callers
 * never get null when the store has been hydrated.
 */
export function resolveSelection(
  blob: Pick<AiSettingsBlob, 'sources' | 'selection'>,
): ResolvedModel | null {
  const sources = blob.sources;
  if (sources.length === 0) return null;
  const [sourceId, modelValue] = (blob.selection ?? DEFAULT_SELECTION).split('::');
  const source = findSource(sources, sourceId) ?? sources[0]!;
  const model =
    effectiveModels(source).find((m) => m.value === modelValue) ?? effectiveModels(source)[0]!;
  return { source, model };
}

/** Built-in models (minus hidden) + custom models for one source. */
export function effectiveModels(source: StoredModelSource): StoredModel[] {
  const builtin = builtinSourceById(source.id);
  const hidden = new Set(source.hiddenBuiltinModels);
  const base: StoredModel[] = (builtin?.models ?? [])
    .filter((m) => !hidden.has(m.value))
    .map((m) => ({ value: m.value, label: m.label, note: m.note, builtin: true }));
  return [...base, ...source.customModels];
}

/** Find the built-in catalog source for a persisted `builtin:<id>` row. */
export function builtinSourceById(id: string): BuiltinSource | null {
  if (!id.startsWith('builtin:')) return null;
  const builtinId = id.slice('builtin:'.length);
  return BUILTIN_SOURCES.find((s) => s.builtinId === builtinId) ?? null;
}

/**
 * Seed the persisted blob for a fresh install: every built-in source
 * present, default selection, built-in prompts, default prompt active.
 */
export function defaultAiSettings(): AiSettingsBlob {
  return {
    sources: BUILTIN_SOURCES.map(seedSource),
    selection: DEFAULT_SELECTION,
    prompts: BUILTIN_PROMPTS.map((p) => ({ ...p })),
    activePromptId: DEFAULT_PROMPT_ID,
  };
}

/** Persisted row for a built-in source (empty custom lists, catalog defaults). */
export function seedSource(b: BuiltinSource): StoredModelSource {
  return {
    id: `builtin:${b.builtinId}`,
    label: b.label,
    apiStyle: b.apiStyle,
    baseUrl: b.baseUrl,
    keySlot: b.keySlot,
    customModels: [],
    hiddenBuiltinModels: [],
  };
}

// ---- validation used by the AI settings store on hydrate ----

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

export function isApiStyle(v: unknown): v is ApiStyle {
  return v === 'openai' || v === 'anthropic';
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function coerceSource(v: unknown): StoredModelSource | null {
  if (!isRecord(v)) return null;
  if (!isNonEmptyString(v.id) || !isNonEmptyString(v.label)) return null;
  if (!isNonEmptyString(v.baseUrl)) return null;
  const apiStyle = isApiStyle(v.apiStyle) ? v.apiStyle : 'openai';
  // Built-in rows must keep their catalog keySlot; custom rows get one
  // derived from their id.
  const keySlot = isNonEmptyString(v.keySlot) ? v.keySlot : `ai_key_${v.id}`;
  const customModels = Array.isArray(v.customModels)
    ? v.customModels.filter(
        (m): m is StoredModel =>
          isRecord(m) && isNonEmptyString(m.value) && isNonEmptyString(m.label),
      )
    : [];
  const hiddenBuiltinModels = Array.isArray(v.hiddenBuiltinModels)
    ? v.hiddenBuiltinModels.filter((m): m is string => typeof m === 'string')
    : [];
  return {
    id: v.id,
    label: v.label,
    apiStyle,
    baseUrl: v.baseUrl,
    keySlot,
    customModels: customModels.map((m) => ({
      value: m.value,
      label: m.label,
      note: typeof m.note === 'string' ? m.note : '',
      builtin: false,
    })),
    hiddenBuiltinModels,
  };
}

function coercePrompt(v: unknown): StoredPromptPreset | null {
  if (!isRecord(v)) return null;
  if (!isNonEmptyString(v.id) || !isNonEmptyString(v.label)) return null;
  if (typeof v.prompt !== 'string' || v.prompt.trim().length === 0) return null;
  return {
    id: v.id,
    label: v.label,
    prompt: v.prompt,
    builtin: v.builtin === true,
  };
}

/**
 * Coerce an unknown persisted value into a well-formed AiSettingsBlob,
 * repairing missing pieces from the defaults. Never throws — a corrupt
 * row degrades to defaults rather than breaking hydrate.
 */
export function coerceAiSettings(v: unknown): AiSettingsBlob {
  const defaults = defaultAiSettings();
  if (!isRecord(v)) return defaults;

  const rawSources = Array.isArray(v.sources) ? v.sources : [];
  const sources = rawSources.map(coerceSource).filter((s): s is StoredModelSource => s !== null);

  // Ensure every built-in source exists exactly once (merge keeps any
  // user edits like hidden models / custom additions).
  for (const b of BUILTIN_SOURCES) {
    const seeded = seedSource(b);
    const existing = sources.find((s) => s.id === seeded.id);
    if (!existing) sources.push(seeded);
  }

  const rawPrompts = Array.isArray(v.prompts) ? v.prompts : [];
  const prompts = rawPrompts.map(coercePrompt).filter((p): p is StoredPromptPreset => p !== null);
  for (const b of BUILTIN_PROMPTS) {
    if (!prompts.some((p) => p.id === b.id)) prompts.push({ ...b });
  }

  const selection = typeof v.selection === 'string' ? v.selection : null;
  const activePromptId = isNonEmptyString(v.activePromptId) ? v.activePromptId : DEFAULT_PROMPT_ID;

  return {
    sources,
    selection,
    prompts,
    activePromptId,
  };
}
