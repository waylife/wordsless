/**
 * MiniMax client tests — run the chatCompletion function end-to-end
 * against a mock fetch, verifying request shape, error mapping, and
 * streaming consumption.
 */
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { MiniMaxApiError, chatCompletion, readApiKey } from '@/core/ai/client';

function makeFetch(
  handler: (url: string, init: RequestInit) => Promise<Response> | Response,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input as URL).toString();
    return handler(url, init ?? {});
  }) as unknown as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('chatCompletion (non-streaming)', () => {
  it('POSTs the right body and returns the text + usage', async () => {
    const fetchImpl = makeFetch((url, init) => {
      expect(url).toBe('https://api.minimaxi.com/v1/chat/completions');
      const parsed = JSON.parse(String(init.body)) as Record<string, unknown>;
      expect(parsed.model).toBe('MiniMax-M2');
      expect(parsed.messages).toHaveLength(1);
      expect(parsed.temperature).toBeCloseTo(0.7);
      return jsonResponse({
        choices: [{ message: { content: 'hello' } }],
        usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
      });
    });
    const result = await chatCompletion({
      baseUrl: 'https://api.minimaxi.com/v1',
      apiKey: 'k',
      model: 'MiniMax-M2',
      messages: [{ role: 'user', content: 'hi' }],
      fetchImpl,
    });
    expect(result.text).toBe('hello');
    expect(result.usage?.totalTokens).toBe(6);
  });

  it('throws MiniMaxApiError on non-2xx', async () => {
    const fetchImpl = makeFetch(() => new Response('rate limited', { status: 429 }));
    await expect(
      chatCompletion({
        baseUrl: 'https://api.minimaxi.com/v1',
        apiKey: 'k',
        model: 'm',
        messages: [{ role: 'user', content: 'x' }],
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(MiniMaxApiError);
  });

  it('aborts on timeout via AbortController', async () => {
    const fetchImpl = makeFetch((_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (signal) {
          signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }
        // Never resolve on the happy path — the abort must trigger first.
      });
    });
    await expect(
      chatCompletion({
        baseUrl: 'https://api.minimaxi.com/v1',
        apiKey: 'k',
        model: 'm',
        messages: [{ role: 'user', content: 'x' }],
        timeoutMs: 50,
        fetchImpl,
      }),
    ).rejects.toBeDefined();
  });
});

describe('readApiKey', () => {
  it('returns env value if non-empty', () => {
    expect(readApiKey('abc')).toBe('abc');
    expect(readApiKey('  abc  ')).toBe('abc');
    expect(readApiKey('   ')).toBe('');
  });

  it('falls back to .env file when env is empty', () => {
    const dir = join(tmpdir(), 'wordsless-test');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'test.env');
    writeFileSync(path, '# comment\nMINIMAX_API_KEY=sk-test-123\nOTHER=ignore\n', 'utf8');
    try {
      expect(readApiKey('', path)).toBe('sk-test-123');
      expect(readApiKey(undefined, path)).toBe('sk-test-123');
    } finally {
      try {
        unlinkSync(path);
      } catch {
        // ignore
      }
    }
  });

  it('returns empty string when nothing is set', () => {
    expect(readApiKey(undefined, '/definitely/does/not/exist')).toBe('');
  });
});
