/**
 * AI HTTP client — minimal, dependency-free, supports both OpenAI-style
 * (`POST {baseUrl}/chat/completions`, Bearer auth, SSE `chat.completion`
 * chunks) and Anthropic-style (`POST {baseUrl}/v1/messages`, `x-api-key`
 * auth, SSE `content_block_delta` events).
 *
 * We intentionally don't use the openai/anthropic SDKs: they're heavy
 * transitive deps for the single endpoint family we care about, and the
 * data-pipeline scripts run in Node, not in the app.
 *
 * The client is testable: pass a `fetchImpl` (defaults to global
 * `fetch`) and you can swap it for a mock in jest. Streaming is
 * supported via `stream: true` + the `onDelta` callback — useful for
 * the runtime "AI explain" panel where the user types a word and
 * expects incremental text.
 */
import type { ApiStyle } from './models';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  /** Which wire protocol to speak. Default: 'openai'. */
  apiStyle?: ApiStyle;
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  /** If set, asks the server to send Server-Sent Events. */
  stream?: boolean;
  /** Required when stream is true. */
  onDelta?: (delta: string) => void;
  /** Sampled temperature; the runtime defaults to 0.5, batch jobs use 0.3. */
  temperature?: number;
  /** Hard timeout in ms; aborts via AbortController. */
  timeoutMs?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Caller-tuned extra body fields. */
  extraBody?: Record<string, unknown>;
}

export interface ChatCompletionResult {
  text: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  raw: unknown;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const ANTHROPIC_VERSION = '2023-06-01';

export class AiApiError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string, message?: string) {
    super(message ?? `AI API error ${status}: ${body.slice(0, 256)}`);
    this.name = 'AiApiError';
    this.status = status;
    this.body = body;
  }
}

/** Back-compat alias: the client used to be MiniMax-only. */
export const MiniMaxApiError = AiApiError;

export async function chatCompletion(opts: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const style = opts.apiStyle ?? 'openai';
  return style === 'anthropic' ? anthropicCompletion(opts) : openaiCompletion(opts);
}

// ---- OpenAI-style --------------------------------------------------------

async function openaiCompletion(opts: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let response: Response;
  try {
    response = await fetchImpl(`${trimSlash(opts.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.7,
        stream: Boolean(opts.stream),
        ...opts.extraBody,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new AiApiError(response.status, body);
  }

  if (opts.stream) {
    if (!opts.onDelta) {
      throw new Error('chatCompletion({ stream: true }) requires onDelta');
    }
    return consumeOpenAiStream(response, opts.onDelta);
  }

  const json = (await response.json()) as {
    choices: { message: { content: string } }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };
  return {
    text: json.choices[0]?.message.content ?? '',
    usage: json.usage
      ? {
          promptTokens: json.usage.prompt_tokens,
          completionTokens: json.usage.completion_tokens,
          totalTokens: json.usage.total_tokens,
        }
      : undefined,
    raw: json,
  };
}

async function consumeOpenAiStream(
  response: Response,
  onDelta: (delta: string) => void,
): Promise<ChatCompletionResult> {
  if (!response.body) {
    throw new Error('Streaming response had no body');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let aggregated = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Split on the SSE separator (\n\n) and parse each event.
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const evt of events) {
      const delta = extractDataField(evt);
      if (delta == null) continue;
      if (delta === '[DONE]') continue;
      try {
        const json = JSON.parse(delta) as {
          choices: { delta?: { content?: string } }[];
        };
        const piece = json.choices[0]?.delta?.content;
        if (piece) {
          aggregated += piece;
          onDelta(piece);
        }
      } catch {
        // Malformed event — skip, don't fail the whole stream.
      }
    }
  }
  return { text: aggregated, raw: null };
}

/** Returns the payload of an SSE event's `data:` line, or null. */
function extractDataField(evt: string): string | null {
  for (const rawLine of evt.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('data:')) return line.slice(5).trim();
  }
  return null;
}

// ---- Anthropic-style -----------------------------------------------------

/**
 * Anthropic Messages API. System prompt is a top-level `system` field,
 * not a message; auth is `x-api-key` + `anthropic-version`. Streaming
 * emits `content_block_delta` events whose `delta.text` carries text.
 */
async function anthropicCompletion(opts: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const system = opts.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const conversational = opts.messages.filter((m) => m.role !== 'system');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let response: Response;
  try {
    response = await fetchImpl(`${trimSlash(opts.baseUrl)}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: opts.model,
        system: system || undefined,
        messages: conversational.map((m) => ({ role: m.role, content: m.content })),
        temperature: opts.temperature ?? 0.7,
        stream: Boolean(opts.stream),
        ...opts.extraBody,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new AiApiError(response.status, body);
  }

  if (opts.stream) {
    if (!opts.onDelta) {
      throw new Error('chatCompletion({ stream: true }) requires onDelta');
    }
    return consumeAnthropicStream(response, opts.onDelta);
  }

  const json = (await response.json()) as {
    content?: { type: string; text?: string }[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };
  const text = (json.content ?? [])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
  return {
    text,
    usage: json.usage
      ? {
          promptTokens: json.usage.input_tokens,
          completionTokens: json.usage.output_tokens,
          totalTokens:
            (json.usage.input_tokens ?? 0) + (json.usage.output_tokens ?? 0) || undefined,
        }
      : undefined,
    raw: json,
  };
}

async function consumeAnthropicStream(
  response: Response,
  onDelta: (delta: string) => void,
): Promise<ChatCompletionResult> {
  if (!response.body) {
    throw new Error('Streaming response had no body');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let aggregated = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const evt of events) {
      const payload = extractDataField(evt);
      if (payload == null || payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload) as {
          type?: string;
          delta?: { type?: string; text?: string };
        };
        if (json.type === 'content_block_delta' && typeof json.delta?.text === 'string') {
          aggregated += json.delta.text;
          onDelta(json.delta.text);
        }
      } catch {
        // Malformed event — skip, don't fail the whole stream.
      }
    }
  }
  return { text: aggregated, raw: null };
}

function trimSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
