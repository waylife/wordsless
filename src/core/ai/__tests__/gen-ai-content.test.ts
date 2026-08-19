/**
 * Tests for the batch script's AI generation function. We never call
 * the real MiniMax API; instead we inject a fetch mock through the
 * client (via env-resolved apiKey + a stub fetchImpl) and verify the
 * script does the right thing with the response.
 */
import { generateForWord } from '@/../data/gen-ai-content';
import { RateLimiter } from '@/core/ai/rate-limiter';

const WORD = {
  id: 'w-1',
  spelling: 'abandon',
  meanings: [{ pos: 'v.', def: 'give up' }],
};

function makeMockFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
}

describe('generateForWord', () => {
  it('returns parsed AI on a valid response', async () => {
    const fetchImpl = makeMockFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              example: { en: 'He abandoned the plan.', cn: '他放弃了这个计划。' },
              root: 'a- + bond',
              mnemonic: 'a-band-on, no band on',
            }),
          },
        },
      ],
    });
    // We can't easily pass fetchImpl through `generateForWord` (the
    // function doesn't accept it). Instead, install a process-level
    // fetch for the duration of this test.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      const out = await generateForWord(WORD, 'k', 'https://x', 'm', new RateLimiter(50, 1000));
      expect(out).not.toBeNull();
      expect(out?.example.cn).toBe('他放弃了这个计划。');
      expect(out?.root).toBe('a- + bond');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns null when the response text does not contain JSON', async () => {
    const fetchImpl = makeMockFetch({
      choices: [{ message: { content: 'I am not JSON, sorry.' } }],
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      const out = await generateForWord(WORD, 'k', 'https://x', 'm', new RateLimiter(50, 1000));
      expect(out).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns null when the primary definition is missing', async () => {
    const out = await generateForWord(
      { ...WORD, meanings: [] },
      'k',
      'https://x',
      'm',
      new RateLimiter(50, 1000),
    );
    expect(out).toBeNull();
  });
});
