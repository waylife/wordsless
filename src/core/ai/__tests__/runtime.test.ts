/**
 * AI runtime tests — verify the no-key fallback, cache-hit short
 * circuit, and live-call + persist flow. We mock both the network
 * (via the `fetchImpl` injection in chatCompletion) and the
 * SecureStore round-trip.
 */
import { explainWord, getApiKey, setApiKey, clearApiKey, streamExplain } from '@/core/ai/runtime';
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

describe('API key storage', () => {
  beforeEach(async () => {
    await clearApiKey();
  });

  it('setApiKey → getApiKey round-trips', async () => {
    await setApiKey('sk-test-1');
    expect(await getApiKey()).toBe('sk-test-1');
  });

  it('setApiKey with empty string clears the slot', async () => {
    await setApiKey('sk-test');
    await setApiKey('  ');
    expect(await getApiKey()).toBe('');
  });
});

describe('explainWord', () => {
  let handle: TestDbHandle;

  beforeEach(async () => {
    await clearApiKey();
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
    await setApiKey('sk-test');
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
    await setApiKey('sk-test');
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
    expect(cached?.model).toBe('MiniMax-M2');
  });

  it('error result returns kind=error and does not write the cache', async () => {
    await setApiKey('sk-test');
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
    await setApiKey('sk-test');
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
    await clearApiKey();
    const onError = jest.fn();
    await streamExplain({ word: { spelling: 'x', gloss: 'y' }, prompt: 'p' }, { onError });
    expect(onError).toHaveBeenCalled();
  });
});

// Touch the import so tree-shaking doesn't drop the type re-export.
void ({} as Db);
