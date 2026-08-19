/**
 * Tests for src/db/seed.ts — verify the seed pipeline correctly
 * populates wordbooks + words from a compiled JSON, and that running
 * it twice is idempotent.
 */
import { wordbookRepository } from '@/db/repositories/wordbooks';
import { wordRepository } from '@/db/repositories/words';
import { seedWordbook, type CompiledWordbook } from '@/db/seed';
import type { NewWord } from '@/db/schema';

import { createTestDb } from './test-db';

const CET4: CompiledWordbook = {
  book: { id: 'wb-cet4', code: 'cet4', name: 'CET-4 大学英语四级', wordCount: 2 },
  words: [
    {
      id: 'w-a',
      bookId: 'wb-cet4',
      spelling: 'abandon',
      phoneticUk: '/əˈbændən/',
      phoneticUs: '/əˈbændən/',
      meanings: [{ pos: 'v.', def: '放弃' }],
      examples: [],
      rootAffix: null,
      audioStatus: 'pending',
    } satisfies NewWord,
    {
      id: 'w-b',
      bookId: 'wb-cet4',
      spelling: 'ability',
      phoneticUk: '/əˈbɪləti/',
      phoneticUs: '/əˈbɪləti/',
      meanings: [{ pos: 'n.', def: '能力' }],
      examples: [],
      rootAffix: null,
      audioStatus: 'pending',
    } satisfies NewWord,
  ],
};

describe('seedWordbook', () => {
  it('inserts the wordbook row and every word', async () => {
    const handle = await createTestDb();
    try {
      const result = await seedWordbook(handle.db, CET4);
      expect(result.code).toBe('cet4');
      expect(result.wordsInserted).toBe(2);
      expect(result.alreadyInstalled).toBe(false);

      const wb = await wordbookRepository.findByCode(handle.db, 'cet4');
      expect(wb?.downloaded).toBe(true);
      expect(wb?.wordCount).toBe(2);

      const list = await wordRepository.listByBook(handle.db, { bookId: 'wb-cet4' });
      expect(list.map((w) => w.spelling).sort()).toEqual(['abandon', 'ability']);
    } finally {
      handle.close();
    }
  });

  it('is idempotent — running twice keeps the same data and reports alreadyInstalled', async () => {
    const handle = await createTestDb();
    try {
      const first = await seedWordbook(handle.db, CET4);
      const second = await seedWordbook(handle.db, CET4);
      expect(first.wordsInserted).toBe(2);
      expect(second.alreadyInstalled).toBe(true);

      const list = await wordRepository.listByBook(handle.db, { bookId: 'wb-cet4' });
      // Unique key on (book_id, spelling) — duplicates roll up.
      expect(list).toHaveLength(2);
    } finally {
      handle.close();
    }
  });
});
