/**
 * MiniMax client tests — run the chatCompletion function end-to-end
 * against a mock fetch, verifying request shape, error mapping, and
 * streaming consumption.
 *
 * The `readApiKey` test cases now live in `data/__tests__/readApiKey.test.ts`
 * because `readApiKey` itself lives under `data/` (Node-only, kept out of
 * the app bundle graph so Metro never resolves `node:fs`).
 */
import { MiniMaxApiError, chatCompletion } from '@/core/ai/client';

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
