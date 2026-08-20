/**
 * wordRepository.sampleDistractors tests — pull N random words from a
 * book other than the excluded one, capped at the requested count.
 */
import { wordRepository } from '@/db/repositories/words';
import { wordbookRepository } from '@/db/repositories/wordbooks';
import type { NewWord } from '@/db/schema';

import { createTestDb, type TestDbHandle } from './test-db';

const CET4 = {
  id: 'wb-cet4',
  code: 'cet4' as const,
  name: '四级',
  wordCount: 0,
  downloaded: true,
  description: null,
};

function makeWord(id: string, spelling: string): NewWord {
  return {
    id,
    bookId: CET4.id,
    spelling,
    phoneticUk: '/x/',
    phoneticUs: '/x/',
    meanings: [{ pos: 'n.', def: `def-${spelling}` }],
    examples: [],
    rootAffix: null,
    audioStatus: 'ready',
  };
}

async function seedBook(handle: TestDbHandle, words: NewWord[]): Promise<void> {
  await wordbookRepository.upsert(handle.db, { ...CET4, wordCount: words.length });
  await wordRepository.insertMany(handle.db, words);
}

describe('wordRepository.sampleDistractors', () => {
  it('returns up to N other words from the book', async () => {
    const handle = await createTestDb();
    try {
      await seedBook(
        handle,
        Array.from({ length: 10 }, (_, i) => makeWord(`w-${i}`, `word${i}`)),
      );
      const out = await wordRepository.sampleDistractors(handle.db, CET4.id, 'w-0', 3);
      expect(out).toHaveLength(3);
      expect(out.every((w) => w.id !== 'w-0')).toBe(true);
      expect(new Set(out.map((w) => w.id)).size).toBe(3);
    } finally {
      handle.close();
    }
  });

  it('returns fewer than N when the book is too small', async () => {
    const handle = await createTestDb();
    try {
      await seedBook(handle, [makeWord('w-0', 'a'), makeWord('w-1', 'b')]);
      const out = await wordRepository.sampleDistractors(handle.db, CET4.id, 'w-0', 3);
      expect(out).toHaveLength(1);
      expect(out[0]?.id).toBe('w-1');
    } finally {
      handle.close();
    }
  });

  it('returns [] when the only word is the excluded one', async () => {
    const handle = await createTestDb();
    try {
      await seedBook(handle, [makeWord('w-0', 'a')]);
      const out = await wordRepository.sampleDistractors(handle.db, CET4.id, 'w-0', 3);
      expect(out).toEqual([]);
    } finally {
      handle.close();
    }
  });

  it('returns [] when n is 0', async () => {
    const handle = await createTestDb();
    try {
      await seedBook(handle, [makeWord('w-0', 'a'), makeWord('w-1', 'b')]);
      const out = await wordRepository.sampleDistractors(handle.db, CET4.id, 'w-0', 0);
      expect(out).toEqual([]);
    } finally {
      handle.close();
    }
  });
});
