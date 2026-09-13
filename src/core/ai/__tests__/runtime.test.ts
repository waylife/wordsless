/**
 * AI runtime tests — multi-source key storage, no-key fallback,
 * cache-hit short circuit, live-call + persist flow, and the legacy
 * settings migration. We mock both the network (via the `fetchImpl`
 * injection in chatCompletion) and the SecureStore round-trip.
 */
import {
  clearApiKey,
  explainWord,
  getApiKey,
  setApiKey,
  streamExplain,
  testApiKey,
} from '@/core/ai/runtime';
import { seedSource, BUILTIN_SOURCES, type StoredModelSource } from '@/core/ai/models';
import { aiContentRepository } from '@/db/repositories/ai-content';
import { wordbookRepository } from '@/db/repositories/wordbooks';
import { wordRepository } from '@/db/repositories/words';
import type { Db } from '@/db/client';
import type { NewWord, Word } from '@/db/schema';

import { createTestDb, type TestDbHandle } from '../../../db/__tests__/test-db';

// Mocks for expo-secure-store and expo-crypto
jest.mock('expo-secure-store', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    getItemAsync: jest.fn(async (key: string) => store[key] ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      delete store[key];
    }),
  };
});

const MINIMAX = seedSource(BUILTIN_SOURCES[0]!);
const DEEPSEEK = seedSource(BUILTIN_SOURCES[1]!);
const ANTHROPIC_SOURCE: StoredModelSource = {
  id: 'custom:anthropic-test',
  label: 'Anthropic',
  apiStyle: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  keySlot: 'anthropic_api_key',
  customModels: [{ value: 'claude-sonnet-4', label: 'Sonnet 4', note: 'test', builtin: false }],
  hiddenBuiltinModels: [],
};

const TARGET_WORD: Word = {
  id: 'w-1',
  bookId: 'wb-1',
  spelling: 'serendipity',
  phoneticUk: '/ˌserənˈdɪpəti/',
  phoneticUs: '/ˌserənˈdɪpəti/',
  meanings: [{ pos: 'n.', def: '意外发现美好事物的能力' }],
  examples: [],
  rootAffix: null,
  audioStatus: 'ready',
  createdAt: new Date(),
};

const TARGET_BOOK = {
  id: 'wb-1',
  code: 'cet4' as const,
  name: 'CET-4',
  wordCount: 1,
  downloaded: true,
  description: null,
};

const TARGET_NEW_WORD: NewWord = {
  id: TARGET_WORD.id,
  bookId: TARGET_WORD.bookId,
  spelling: TARGET_WORD.spelling,
  phoneticUk: TARGET_WORD.phoneticUk,
  phoneticUs: TARGET_WORD.phoneticUs,
  meanings: TARGET_WORD.meanings,
  examples: [],
  rootAffix: null,
  audioStatus: 'ready',
};

const CACHE_BLOB = {
  root: 'serendip + ity',
  mnemonic: 'serene + dip into + city',
  example: { en: 'Finding this cafe was pure serendipity.', cn: '找到这家咖啡馆纯属意外。' },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function sseResponse(events: string[]): Response {
  const body = events.join('\n\n') + '\n\n[DONE]\n';
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

describe('API key storage (per source)', () => {
  beforeEach(async () => {
    await clearApiKey(MINIMAX);
    await clearApiKey(DEEPSEEK);
  });

  it('setApiKey → getApiKey round-trips per source', async () => {
    await setApiKey(MINIMAX, 'sk-minimax-1');
    await setApiKey(DEEPSEEK, 'sk-deepseek-1');
    expect(await getApiKey(MINIMAX)).toBe('sk-minimax-1');
    expect(await getApiKey(DEEPSEEK)).toBe('sk-deepseek-1');
  });

  it('setApiKey with empty string clears the slot', async () => {
    await setApiKey(MINIMAX, 'sk-test');
    await setApiKey(MINIMAX, '  ');
    expect(await getApiKey(MINIMAX)).toBe('');
  });
});

describe('testApiKey', () => {
  beforeEach(async () => {
    await clearApiKey(MINIMAX);
  });

  it('returns ok with latency and sends a minimal probe request', async () => {
    const fakeFetch = jest.fn(async (url, init) => {
      expect(url).toBe('https://api.minimaxi.com/v1/chat/completions');
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
      const parsed = JSON.parse(String(init.body)) as Record<string, unknown>;
      expect(parsed.model).toBe('MiniMax-M2.5');
      expect(parsed.temperature).toBe(0);
      expect(parsed.stream).toBe(false);
      expect(parsed.max_tokens).toBe(8);
      expect(parsed.messages).toHaveLength(1);
      return jsonResponse({ choices: [{ message: { content: 'OK' } }] });
    }) as unknown as typeof fetch;

    const result = await testApiKey('  sk-test  ', MINIMAX, { fetchImpl: fakeFetch });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model).toBe('MiniMax-M2.5');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('probes an anthropic-style source against /v1/messages', async () => {
    const fakeFetch = jest.fn(async (url, init) => {
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-ant');
      expect((init.headers as Record<string, string>)['anthropic-version']).toBeDefined();
      const parsed = JSON.parse(String(init.body)) as Record<string, unknown>;
      expect(parsed.model).toBe('claude-sonnet-4');
      expect(parsed.system).toBeUndefined();
      return jsonResponse({
        content: [{ type: 'text', text: 'OK' }],
        usage: { input_tokens: 3, output_tokens: 1 },
      });
    }) as unknown as typeof fetch;

    const result = await testApiKey('sk-ant', ANTHROPIC_SOURCE, {
      fetchImpl: fakeFetch,
      model: 'claude-sonnet-4',
    });
    expect(result.ok).toBe(true);
  });

  it('succeeds for a passing probe without writing the key to SecureStore', async () => {
    const fakeFetch = jest.fn(async () =>
      jsonResponse({ choices: [{ message: { content: 'OK' } }] }),
    ) as unknown as typeof fetch;

    const result = await testApiKey('sk-fresh', MINIMAX, { fetchImpl: fakeFetch });
    expect(result.ok).toBe(true);
    expect(await getApiKey(MINIMAX)).toBe('');
  });

  it('rejects an empty key without touching the network', async () => {
    const fakeFetch = jest.fn() as unknown as typeof fetch;
    const result = await testApiKey('   ', MINIMAX, { fetchImpl: fakeFetch });
    expect(result).toEqual({ ok: false, message: '请先填写 API Key' });
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it('maps 401 plus MiniMax base_resp detail to a Chinese reason', async () => {
    const fakeFetch = jest.fn(async () =>
      jsonResponse(
        {
          base_resp: { status_code: 1004, status_msg: 'Invalid token' },
        },
        401,
      ),
    ) as unknown as typeof fetch;

    const result = await testApiKey('sk-bad', MINIMAX, { fetchImpl: fakeFetch });
    expect(result).toMatchObject({
      ok: false,
      status: 401,
      message: '密钥无效或无权访问 (Invalid token)',
    });
  });

  it('maps 429 to a rate-limit reason', async () => {
    const fakeFetch = jest.fn(async () =>
      jsonResponse({ base_resp: { status_code: 1039, status_msg: 'quota exceeded' } }, 429),
    ) as unknown as typeof fetch;

    const result = await testApiKey('sk-limited', MINIMAX, { fetchImpl: fakeFetch });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(429);
      expect(result.message).toContain('请求过于频繁或已超额');
    }
  });

  it('maps an anthropic-style error body to a reason', async () => {
    const fakeFetch = jest.fn(async () =>
      jsonResponse({ error: { message: 'invalid x-api-key' } }, 401),
    ) as unknown as typeof fetch;

    const result = await testApiKey('sk-ant-bad', ANTHROPIC_SOURCE, { fetchImpl: fakeFetch });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('invalid x-api-key');
    }
  });

  it('reports a timeout when the request is aborted', async () => {
    const fakeFetch = jest.fn(
      (_url, init) =>
        new Promise<never>((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          if (signal.aborted) {
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
            return;
          }
          signal.addEventListener('abort', () =>
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })),
          );
        }),
    ) as unknown as typeof fetch;

    const result = await testApiKey('sk-slow', MINIMAX, {
      fetchImpl: fakeFetch,
      timeoutMs: 5,
    });
    expect(result).toEqual({ ok: false, message: '请求超时,请检查网络后重试' });
  });

  it('surfaces a transport error message unchanged', async () => {
    const fakeFetch = jest.fn(async () => {
      throw new Error('Network request failed');
    }) as unknown as typeof fetch;

    const result = await testApiKey('sk-offline', MINIMAX, { fetchImpl: fakeFetch });
    expect(result).toEqual({ ok: false, message: 'Network request failed' });
  });
});

describe('explainWord', () => {
  let handle: TestDbHandle;

  beforeEach(async () => {
    await clearApiKey(MINIMAX);
    handle = await createTestDb();
    // Seed the parent wordbook + word so the ai_content FK is satisfied.
    await wordbookRepository.upsert(handle.db, TARGET_BOOK);
    await wordRepository.insertMany(handle.db, [TARGET_NEW_WORD]);
  });

  afterEach(() => {
    handle.close();
  });

  it('returns no-key when no API key is configured', async () => {
    const result = await explainWord(handle.db, {
      wordId: TARGET_WORD.id,
      word: { spelling: TARGET_WORD.spelling, gloss: TARGET_WORD.meanings[0]!.def },
      prompt: 'whatever',
      cacheAs: 'mnemonic',
    });
    expect(result.kind).toBe('no-key');
  });

  it('returns cache hit without calling the network', async () => {
    await setApiKey(MINIMAX, 'sk-test');
    await aiContentRepository.upsert(handle.db, {
      id: 'cache-1',
      wordId: TARGET_WORD.id,
      type: 'mnemonic',
      content: CACHE_BLOB,
      model: 'MiniMax-M2',
    });

    const result = await explainWord(handle.db, {
      wordId: TARGET_WORD.id,
      word: { spelling: TARGET_WORD.spelling, gloss: TARGET_WORD.meanings[0]!.def },
      prompt: 'whatever',
      cacheAs: 'mnemonic',
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.source).toBe('cache');
      expect(result.content).toEqual(CACHE_BLOB);
    }
  });

  it('live call persists the result into ai_content', async () => {
    await setApiKey(MINIMAX, 'sk-test');
    const fakeFetch = jest.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: JSON.stringify(CACHE_BLOB) } }],
        usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
      }),
    ) as unknown as typeof fetch;
    (global as { fetch: typeof fetch }).fetch = fakeFetch;

    const result = await explainWord(handle.db, {
      wordId: TARGET_WORD.id,
      word: { spelling: TARGET_WORD.spelling, gloss: TARGET_WORD.meanings[0]!.def },
      prompt: 'whatever',
      cacheAs: 'mnemonic',
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.source).toBe('live');
    }
    const cached = await aiContentRepository.find(handle.db, TARGET_WORD.id, 'mnemonic');
    expect(cached).not.toBeNull();
    expect(cached?.model).toBe('MiniMax-M2.5');
  });

  it('error result returns kind=error and does not write the cache', async () => {
    await setApiKey(MINIMAX, 'sk-test');
    const fakeFetch = jest.fn(
      async () => new Response('boom', { status: 500 }),
    ) as unknown as typeof fetch;
    (global as { fetch: typeof fetch }).fetch = fakeFetch;

    const result = await explainWord(handle.db, {
      wordId: TARGET_WORD.id,
      word: { spelling: TARGET_WORD.spelling, gloss: TARGET_WORD.meanings[0]!.def },
      prompt: 'whatever',
      cacheAs: 'mnemonic',
    });
    expect(result.kind).toBe('error');
    const cached = await aiContentRepository.find(handle.db, TARGET_WORD.id, 'mnemonic');
    expect(cached).toBeNull();
  });
});

describe('streamExplain', () => {
  it('forwards each SSE delta to the onDelta callback', async () => {
    await setApiKey(MINIMAX, 'sk-test');
    const events = [
      'data: {"choices":[{"delta":{"content":"hello "}}]}',
      'data: {"choices":[{"delta":{"content":"world"}}]}',
    ];
    const fakeFetch = jest.fn(async () => sseResponse(events)) as unknown as typeof fetch;
    (global as { fetch: typeof fetch }).fetch = fakeFetch;

    const deltas: string[] = [];
    await new Promise<void>((resolve) => {
      void streamExplain(
        { word: { spelling: 'x', gloss: 'y' }, prompt: 'p' },
        {
          onDelta: (d) => deltas.push(d),
          onDone: () => resolve(),
          onError: () => resolve(),
        },
      );
    });
    expect(deltas.join('')).toBe('hello world');
  });

  it('reports onError when the API key is missing', async () => {
    await clearApiKey(MINIMAX);
    const onError = jest.fn();
    await streamExplain({ word: { spelling: 'x', gloss: 'y' }, prompt: 'p' }, { onError });
    expect(onError).toHaveBeenCalled();
  });
});

// Touch the import so tree-shaking doesn't drop the type re-export.
void ({} as Db);
