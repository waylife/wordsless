/**
 * MiniMax (a.k.a. MiniMax) HTTP client — minimal, OpenAI-compatible,
 * dependency-free.
 *
 * We intentionally don't use the openai SDK: it's a heavy transitive
 * dep for the single endpoint we care about, and the data-pipeline
 * scripts run in Node, not in the app, so we don't need SDK-level
 * retry, streaming, or browser-isms.
 *
 * The client is testable: pass a `fetchImpl` (defaults to global
 * `fetch`) and you can swap it for a mock in jest. Streaming is
 * supported via `stream: true` + the `onDelta` callback — useful for
 * the runtime "AI explain" panel where the user types a word and
 * expects incremental text.
 *
 * Usage:
 *   const text = await chatCompletion({
 *     baseUrl: 'https://api.minimaxi.com/v1',
 *     apiKey: process.env.MINIMAX_API_KEY!,
 *     model: 'MiniMax-M2',
 *     messages: [{ role: 'user', content: 'hello' }],
 *   });
 */
import { readFileSync } from 'node:fs';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  /** If set, asks the server to send Server-Sent Events. */
  stream?: boolean;
  /** Required when stream is true. */
  onDelta?: (delta: string) => void;
  /** Sampled temperature; the runtime defaults to 0.7, batch jobs use 0.3. */
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

const DEFAULT_BASE_URL = 'https://api.minimaxi.com/v1';
const DEFAULT_TIMEOUT_MS = 30_000;

export class MiniMaxApiError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string, message?: string) {
    super(message ?? `MiniMax API error ${status}: ${body.slice(0, 256)}`);
    this.name = 'MiniMaxApiError';
    this.status = status;
    this.body = body;
  }
}

export async function chatCompletion(opts: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/chat/completions`, {
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
    throw new MiniMaxApiError(response.status, body);
  }

  if (opts.stream) {
    if (!opts.onDelta) {
      throw new Error('chatCompletion({ stream: true }) requires onDelta');
    }
    return consumeStream(response, opts.onDelta);
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

async function consumeStream(
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
      const line = evt.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload) as {
          choices: { delta?: { content?: string } }[];
        };
        const delta = json.choices[0]?.delta?.content;
        if (delta) {
          aggregated += delta;
          onDelta(delta);
        }
      } catch {
        // Malformed event — skip, don't fail the whole stream.
      }
    }
  }
  return { text: aggregated, raw: null };
}

/**
 * Convenience: load the API key from `process.env` (preferred) or from
 * a `.env`-style file if the caller hands us a path. The build script
 * uses this so the runtime and build paths share the same lookup.
 */
export function readApiKey(envValue: string | undefined, dotenvPath?: string): string {
  if (envValue && envValue.trim().length > 0) return envValue.trim();
  if (!dotenvPath) return '';
  try {
    const text = readFileSync(dotenvPath, 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?MINIMAX_API_KEY\s*=\s*"?([^"\s]+)"?\s*$/);
      if (m) return m[1]!.trim();
    }
  } catch {
    // .env missing — caller will see the empty string and warn.
  }
  return '';
}
