/**
 * Prompt + response helpers for the wordsless AI batch pipeline.
 *
 * The pipeline asks the model to produce three artifacts per word:
 *   - example: two short example sentences (en + cn)
 *   - root:    the actual root/affix etymology
 *   - mnemonic: a memorable association
 *
 * Output is strict JSON (one block, no prose). The model is asked to
 * leave a field empty if it is unsure rather than hallucinate.
 */
import type { ChatCompletionOptions } from './client';

export type AiContentType = 'example' | 'root' | 'mnemonic';

export interface AiExample {
  en: string;
  cn: string;
}

export interface AiGenerated {
  example: AiExample;
  root: string;
  mnemonic: string;
}

const SYSTEM_PROMPT = `You are a vocabulary coach. For the word the user gives you, you produce three artifacts, all in strict JSON:
- example: a short natural English example sentence plus a Chinese translation. The example must use only words a typical CET-4 student already knows.
- root: the actual root or affix that the word is built from, plus a one-sentence plain-language explanation. If you are not confident, output "".
- mnemonic: a memorable association that helps the user recall the meaning. Keep it under 30 words. If you are not confident, output "".

Output exactly one JSON object with keys "example", "root", "mnemonic". No prose, no markdown, no commentary. If a field is empty, write "" for that field.`;

export function buildUserPrompt(spelling: string, definition: string): string {
  return `Word: ${spelling}\nGloss: ${definition}\nProduce the JSON.`;
}

/** Extracts the first {...} JSON object from a model response. */
export function extractJsonObject(text: string): unknown | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function validateGenerated(value: unknown): AiGenerated | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const ex = v.example as { en?: unknown; cn?: unknown } | undefined;
  if (!ex || typeof ex.en !== 'string' || typeof ex.cn !== 'string') return null;
  if (ex.en.trim().length === 0 || ex.cn.trim().length === 0) return null;
  if (typeof v.root !== 'string' || typeof v.mnemonic !== 'string') return null;
  return {
    example: { en: ex.en.trim(), cn: ex.cn.trim() },
    root: v.root.trim(),
    mnemonic: v.mnemonic.trim(),
  };
}

export function buildChatOptions(
  baseUrl: string,
  apiKey: string,
  model: string,
  spelling: string,
  definition: string,
  overrides: Partial<ChatCompletionOptions> = {},
): ChatCompletionOptions {
  return {
    baseUrl,
    apiKey,
    model,
    stream: false,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(spelling, definition) },
    ],
    temperature: 0.3,
    timeoutMs: 30_000,
    ...overrides,
  };
}
