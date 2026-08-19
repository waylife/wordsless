/**
 * AI runtime — the user-facing layer of the MiniMax integration.
 *
 * The plan separates "build-time" AI (the batch script that fills the
 * wordbook corpus) from "run-time" AI (the on-device explainer).
 * `core/ai/client.ts` is the shared transport; this file adds:
 *
 *   - API-key lookup from `expo-secure-store` (`MINIMAX_API_KEY` slot)
 *   - Cache-or-call semantics against the `ai_content` table
 *   - Streaming callback for the in-app explain panel
 *   - A graceful "no key" result so the UI can disable AI features
 *     without crashing
 */
import * as SecureStore from 'expo-secure-store';

import { aiContentRepository } from '@/db/repositories/ai-content';
import type { Db } from '@/db/client';
import type { AiContentTypeValue } from '@/db/schema';

import { chatCompletion, type ChatMessage } from './client';

const KEY_SLOT = 'minimax_api_key';
const DEFAULT_BASE_URL = 'https://api.minimaxi.com/v1';
const DEFAULT_MODEL = 'MiniMax-M2';
const DEFAULT_TIMEOUT_MS = 30_000;

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
}

export interface ExplainStreamHandlers {
  onDelta?: (delta: string) => void;
  onDone?: (full: string) => void;
  onError?: (err: Error) => void;
}

/** Read the API key from the system keychain. Empty string when unset. */
export async function getApiKey(): Promise<string> {
  try {
    const v = await SecureStore.getItemAsync(KEY_SLOT);
    return v ?? '';
  } catch {
    return '';
  }
}

export async function setApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    await SecureStore.deleteItemAsync(KEY_SLOT);
    return;
  }
  await SecureStore.setItemAsync(KEY_SLOT, trimmed);
}

export async function clearApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_SLOT);
}

/**
 * Ask the model for a JSON explanation of a word.
 *
 * Behaviour matrix:
 *   - `cacheAs` is set + cache hit + !forceRefresh → return cached
 *   - else: live call, then upsert into cache and return
 *   - if no API key is configured → `{ kind: 'no-key' }`
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

  const apiKey = await getApiKey();
  if (!apiKey) return { kind: 'no-key' };

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: runtimeSystemPrompt() },
      { role: 'user', content: req.prompt },
    ];
    const result = await chatCompletion({
      baseUrl: DEFAULT_BASE_URL,
      apiKey,
      model: DEFAULT_MODEL,
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
        model: DEFAULT_MODEL,
      });
    }
    return {
      kind: 'ok',
      content: parsed ?? { raw: result.text },
      source: 'live',
      model: DEFAULT_MODEL,
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
  req: { word: { spelling: string; gloss: string }; prompt: string },
  handlers: ExplainStreamHandlers,
): Promise<void> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    handlers.onError?.(new Error('未配置 API Key'));
    return;
  }
  try {
    const result = await chatCompletion({
      baseUrl: DEFAULT_BASE_URL,
      apiKey,
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: runtimeSystemPrompt() },
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

const RUNTIME_SYSTEM_PROMPT = `You are a vocabulary coach. The user gives you a word and a short gloss; you respond with strict JSON (no prose, no markdown) shaped as:
{
  "root":   "the actual root/affix + one-sentence plain-language explanation, or \"\" if unsure",
  "mnemonic": "a memorable association under 30 words, or \"\" if unsure",
  "example": { "en": "one short example sentence (CEFR A2-B1 vocab)", "cn": "中文翻译" }
}`;

function runtimeSystemPrompt(): string {
  return RUNTIME_SYSTEM_PROMPT;
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
