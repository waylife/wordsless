/**
 * Favorites repository tests — round-trip add / remove / isFavorited.
 */
import { favoritesRepository } from '@/db/repositories/favorites';
import { wordRepository } from '@/db/repositories/words';
import { wordbookRepository } from '@/db/repositories/wordbooks';
import type { NewWord } from '@/db/schema';

import { createTestDb, type TestDbHandle } from './test-db';

const BOOK = {
  id: 'wb-1',
  code: 'cet4' as const,
  name: 'CET-4',
  wordCount: 2,
  downloaded: true,
  description: null,
};

const WORDS: NewWord[] = [
  {
    id: 'w-1',
    bookId: BOOK.id,
    spelling: 'a',
    phoneticUk: null,
    phoneticUs: null,
    meanings: [{ pos: 'n.', def: 'a' }],
    examples: [],
    rootAffix: null,
    audioStatus: 'ready',
  },
  {
    id: 'w-2',
    bookId: BOOK.id,
    spelling: 'b',
    phoneticUk: null,
    phoneticUs: null,
    meanings: [{ pos: 'n.', def: 'b' }],
    examples: [],
    rootAffix: null,
    audioStatus: 'ready',
  },
];

async function seed(handle: TestDbHandle): Promise<void> {
  await wordbookRepository.upsert(handle.db, BOOK);
  await wordRepository.insertMany(handle.db, WORDS);
}

describe('favoritesRepository', () => {
  it('add then isFavorited then remove', async () => {
    const handle = await createTestDb();
    try {
      await seed(handle);
      await favoritesRepository.add(handle.db, 'w-1');
      expect(await favoritesRepository.isFavorited(handle.db, 'w-1')).toBe(true);
      expect(await favoritesRepository.count(handle.db)).toBe(1);

      const list = await favoritesRepository.list(handle.db);
      expect(list.map((w) => w.id)).toEqual(['w-1']);

      await favoritesRepository.remove(handle.db, 'w-1');
      expect(await favoritesRepository.isFavorited(handle.db, 'w-1')).toBe(false);
      expect(await favoritesRepository.count(handle.db)).toBe(0);
    } finally {
      handle.close();
    }
  });

  it('add is idempotent (no duplicate rows)', async () => {
    const handle = await createTestDb();
    try {
      await seed(handle);
      await favoritesRepository.add(handle.db, 'w-1');
      await favoritesRepository.add(handle.db, 'w-1');
      expect(await favoritesRepository.count(handle.db)).toBe(1);
    } finally {
      handle.close();
    }
  });

  it('remove on a non-favorited word is a no-op', async () => {
    const handle = await createTestDb();
    try {
      await seed(handle);
      await favoritesRepository.remove(handle.db, 'w-1');
      expect(await favoritesRepository.isFavorited(handle.db, 'w-1')).toBe(false);
    } finally {
      handle.close();
    }
  });
});
