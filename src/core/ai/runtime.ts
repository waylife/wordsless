/**
 * AI runtime — the user-facing layer of the AI integration.
 *
 * `core/ai/client.ts` is the shared transport; this file adds:
 *
 *   - per-source API-key lookup from `expo-secure-store`
 *   - active source/model/prompt resolution from the AI settings store
 *   - cache-or-call semantics against the `ai_content` table
 *   - streaming callback for the in-app explain panel
 *   - a graceful "no key" result so the UI can disable AI features
 *     without crashing
 *
 * Legacy note: versions before multi-source support stored a single
 * MiniMax key in the `minimax_api_key` slot and a single `model` field
 * in the settings blob. `hydrateAi()` migrates both once, at store
 * hydrate time (see `stores/ai-store.ts`).
 */
import * as SecureStore from 'expo-secure-store';

import { aiContentRepository } from '@/db/repositories/ai-content';
import {
  DEFAULT_MODEL,
  DEFAULT_PROMPT_ID,
  defaultAiSettings,
  resolveSelection,
  type AiSettingsBlob,
  type StoredModelSource,
} from '@/core/ai/models';
import type { Db } from '@/db/client';
import type { AiContentTypeValue } from '@/db/schema';
import { useAiSettingsStore } from '@/stores/ai-store';

import { chatCompletion, AiApiError, type ChatMessage } from './client';

const DEFAULT_TIMEOUT_MS = 30_000;
/** Legacy single-key slot from pre-multi-source versions. */
const LEGACY_KEY_SLOT = 'minimax_api_key';

export type AiResult<T> =
  | { kind: 'ok'; content: T; source: 'cache' | 'live'; model?: string }
  | { kind: 'no-key' }
  | { kind: 'error'; message: string };

export interface ExplainRequest {
  word: { spelling: string; gloss: string };
  /** Persist to ai_content when the live call succeeds. */
  cacheAs?: AiContentTypeValue;
  /** Force a fresh model call, ignoring the cache. */
  forceRefresh?: boolean;
  /** Override the model; useful for tests and A/B paths. */
  model?: string;
}

export interface ExplainStreamHandlers {
  onDelta?: (delta: string) => void;
  onDone?: (full: string) => void;
  onError?: (err: Error) => void;
}

/** Read a source's API key from the system keychain. Empty string when unset. */
export async function getApiKey(source: StoredModelSource): Promise<string> {
  try {
    const v = await SecureStore.getItemAsync(source.keySlot);
    return v ?? '';
  } catch {
    return '';
  }
}

export async function setApiKey(source: StoredModelSource, key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    await SecureStore.deleteItemAsync(source.keySlot);
    return;
  }
  await SecureStore.setItemAsync(source.keySlot, trimmed);
}

export async function clearApiKey(source: StoredModelSource): Promise<void> {
  await SecureStore.deleteItemAsync(source.keySlot);
}

/**
 * One-time migration from the pre-multi-source layout:
 *   - copy the legacy `minimax_api_key` SecureStore entry into the
 *     MiniMax source slot when that slot is empty (they're the same
 *     slot today, but keep this explicit for future-proofing);
 *   - map the legacy settings `model` field (a bare model id) onto the
 *     new `selection` string when no selection exists yet.
 */
export async function migrateLegacyAiSettings(
  blob: AiSettingsBlob,
  legacyModel: string | null,
): Promise<{ blob: AiSettingsBlob; migratedKey: boolean }> {
  let migratedKey = false;
  try {
    const legacyKey = await SecureStore.getItemAsync(LEGACY_KEY_SLOT);
    if (legacyKey) migratedKey = true;
  } catch {
    // SecureStore unavailable (tests / unsupported platform) — skip.
  }

  if (blob.selection != null) return { blob, migratedKey };

  // Map a legacy bare model id onto the matching built-in source.
  let selection: string | null = blob.selection;
  if (legacyModel) {
    const match = blob.sources.find(
      (s) =>
        s.id.startsWith('builtin:') &&
        (s.customModels.some((m) => m.value === legacyModel) || legacyModel.startsWith('MiniMax-')),
    );
    if (match) selection = `${match.id}::${legacyModel}`;
  }
  return { blob: { ...blob, selection }, migratedKey };
}

/** Resolve the current AI settings blob from the store (pre-hydrate safe). */
function currentAiSettings(): AiSettingsBlob {
  const state = useAiSettingsStore.getState();
  if (state.hydrated && state.blob) return state.blob;
  // Store not hydrated yet (or empty): fall back to the built-in
  // defaults so tests and the pre-hydrate window keep working.
  return defaultAiSettings();
}

/** Outcome of a connectivity probe against a source's endpoint. */
export type ApiKeyTestResult =
  { ok: true; model: string; latencyMs: number } | { ok: false; message: string; status?: number };

export interface TestApiKeyOptions {
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Override endpoint/model for the probe. */
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

const TEST_TIMEOUT_MS = 15_000;
// Keep the probe cheap: one token in, one token out, ~¥0.00001 per try.
const TEST_PROMPT = 'Reply with exactly: OK';

/**
 * Verify that an API key works without touching the cache or the DB.
 *
 * This is deliberately a thin wrapper around `chatCompletion`: the
 * settings page wants a yes/no answer plus a human-readable reason,
 * not a vocabulary explanation. It never writes to SecureStore itself —
 * the caller decides whether a passing key gets persisted.
 */
export async function testApiKey(
  key: string,
  source: { apiStyle: 'openai' | 'anthropic'; baseUrl: string },
  opts: TestApiKeyOptions = {},
): Promise<ApiKeyTestResult> {
  const apiKey = key.trim();
  if (!apiKey) return { ok: false, message: '请先填写 API Key' };

  const started = Date.now();
  try {
    await chatCompletion({
      apiStyle: source.apiStyle,
      baseUrl: opts.baseUrl ?? source.baseUrl,
      apiKey,
      model: opts.model ?? DEFAULT_MODEL,
      messages: [{ role: 'user', content: TEST_PROMPT }],
      temperature: 0,
      timeoutMs: opts.timeoutMs ?? TEST_TIMEOUT_MS,
      fetchImpl: opts.fetchImpl,
      extraBody: { max_tokens: 8 },
    });
    return { ok: true, model: opts.model ?? DEFAULT_MODEL, latencyMs: Date.now() - started };
  } catch (err) {
    if (err instanceof AiApiError) {
      return { ok: false, status: err.status, message: describeApiError(err) };
    }
    if (isAbortError(err)) {
      return { ok: false, message: '请求超时,请检查网络后重试' };
    }
    return { ok: false, message: (err as Error).message ?? '未知错误' };
  }
}

/**
 * Ask the model for a JSON explanation of a word.
 *
 * Behaviour matrix:
 *   - `cacheAs` is set + cache hit + !forceRefresh → return cached
 *   - else: live call, then upsert into cache and return
 *   - if no API key is configured for the active source → `{ kind: 'no-key' }`
 *   - on any thrown error → `{ kind: 'error', message }`
 */
export async function explainWord(
  db: Db,
  req: ExplainRequest & { wordId: string; prompt: string },
): Promise<AiResult<unknown>> {
  if (req.cacheAs && !req.forceRefresh) {
    const cached = await aiContentRepository.find(db, req.wordId, req.cacheAs);
    if (cached) {
      return {
        kind: 'ok',
        content: cached.content,
        source: 'cache',
        model: cached.model,
      };
    }
  }

  const resolved = resolveActive();
  if (!resolved) return { kind: 'no-key' };

  const apiKey = await getApiKey(resolved.source);
  if (!apiKey) return { kind: 'no-key' };

  const model = req.model ?? resolved.model.value;

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: activeSystemPrompt() },
      { role: 'user', content: req.prompt },
    ];
    const result = await chatCompletion({
      apiStyle: resolved.source.apiStyle,
      baseUrl: resolved.source.baseUrl,
      apiKey,
      model,
      messages,
      temperature: 0.5,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
    const parsed = parseJsonPayload(result.text);
    if (req.cacheAs) {
      await aiContentRepository.upsert(db, {
        id: crypto.randomUUID(),
        wordId: req.wordId,
        type: req.cacheAs,
        content: parsed ?? { raw: result.text },
        model,
      });
    }
    return {
      kind: 'ok',
      content: parsed ?? { raw: result.text },
      source: 'live',
      model,
    };
  } catch (err) {
    return { kind: 'error', message: (err as Error).message };
  }
}

/**
 * Streaming variant — fires `onDelta` for each chunk, then `onDone`
 * with the aggregated text. We do NOT cache streaming output (the user
 * might abort mid-stream and we'd be storing half-sentences); call
 * `explainWord` to populate the cache for next time.
 */
export async function streamExplain(
  req: { word: { spelling: string; gloss: string }; prompt: string; model?: string },
  handlers: ExplainStreamHandlers,
): Promise<void> {
  const resolved = resolveActive();
  if (!resolved) {
    handlers.onError?.(new Error('未配置 API Key'));
    return;
  }
  const apiKey = await getApiKey(resolved.source);
  if (!apiKey) {
    handlers.onError?.(new Error('未配置 API Key'));
    return;
  }
  try {
    const model = req.model ?? resolved.model.value;
    const result = await chatCompletion({
      apiStyle: resolved.source.apiStyle,
      baseUrl: resolved.source.baseUrl,
      apiKey,
      model,
      messages: [
        { role: 'system', content: activeSystemPrompt() },
        { role: 'user', content: req.prompt },
      ],
      stream: true,
      onDelta: handlers.onDelta ?? (() => {}),
      temperature: 0.5,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
    handlers.onDone?.(result.text);
  } catch (err) {
    handlers.onError?.(err as Error);
  }
}

// ---- internals --------------------------------------------------------

/**
 * Resolve the currently-selected source + model from the AI settings
 * store. Falls back to the built-in MiniMax defaults across the (very
 * short) window between module load and the first hydrate() resolving,
 * plus any test environment that hasn't touched the store at all.
 */
function resolveActive(): { source: StoredModelSource; model: { value: string } } | null {
  const resolved = resolveSelection(currentAiSettings());
  return resolved ? { source: resolved.source, model: resolved.model } : null;
}

/** The active prompt preset's system prompt text. */
export function activeSystemPrompt(): string {
  const blob = currentAiSettings();
  const preset =
    blob.prompts.find((p) => p.id === blob.activePromptId) ??
    blob.prompts.find((p) => p.id === DEFAULT_PROMPT_ID);
  return preset?.prompt ?? '';
}

function parseJsonPayload(text: string): unknown | null {
  // Match the first {...} block — mirrors the batch pipeline helper so
  // both paths degrade the same way on malformed output.
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Turn an HTTP status + API error body into a short Chinese reason. */
function describeApiError(err: AiApiError): string {
  const detail = parseErrorDetail(err.body);
  switch (err.status) {
    case 401:
    case 403:
      return `密钥无效或无权访问${detail ? ` (${detail})` : ''}`;
    case 404:
      return `模型或接口不存在${detail ? ` (${detail})` : ''}`;
    case 429:
      return `请求过于频繁或已超额${detail ? ` (${detail})` : ''}`;
    case 400:
      return `请求参数不合法${detail ? ` (${detail})` : ''}`;
    default:
      return `接口返回 ${err.status}${detail ? ` (${detail})` : ''}`;
  }
}

// Try MiniMax's {"base_resp":{...}} then Anthropic/OpenAI {"error":{"message":...}}.
function parseErrorDetail(body: string): string | null {
  if (!body) return null;
  try {
    const json = JSON.parse(body) as {
      base_resp?: { status_msg?: string };
      error?: { message?: string };
    };
    return json.base_resp?.status_msg ?? json.error?.message ?? null;
  } catch {
    return null;
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}
