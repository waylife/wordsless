/**
 * Repository tests — run against an in-memory better-sqlite3 db.
 */
import { checkinRepository } from '@/db/repositories/checkins';
import { favoritesRepository } from '@/db/repositories/favorites';
import { reviewLogRepository } from '@/db/repositories/review-log';
import { wordStateRepository } from '@/db/repositories/word-states';
import { wordRepository } from '@/db/repositories/words';
import { wordbookRepository } from '@/db/repositories/wordbooks';
import type { NewWord } from '@/db/schema';

import { createTestDb, type TestDbHandle } from './test-db';

const CET4 = {
  id: 'wb-cet4',
  code: 'cet4' as const,
  name: '四级',
  wordCount: 2,
  downloaded: true,
  description: null,
};

const WORDS: NewWord[] = [
  {
    id: 'w-1',
    bookId: CET4.id,
    spelling: 'abandon',
    phoneticUk: '/əˈbændən/',
    phoneticUs: '/əˈbændən/',
    meanings: [{ pos: 'v.', def: '放弃' }],
    examples: [],
    rootAffix: null,
    audioStatus: 'ready',
  },
  {
    id: 'w-2',
    bookId: CET4.id,
    spelling: 'ability',
    phoneticUk: '/əˈbɪləti/',
    phoneticUs: '/əˈbɪləti/',
    meanings: [{ pos: 'n.', def: '能力' }],
    examples: [],
    rootAffix: null,
    audioStatus: 'ready',
  },
];

async function seed(handle: TestDbHandle) {
  await wordbookRepository.upsert(handle.db, CET4);
  await wordRepository.insertMany(handle.db, WORDS);
}

describe('wordbookRepository', () => {
  it('upserts and reads back by id and by code', async () => {
    const handle = await createTestDb();
    try {
      await wordbookRepository.upsert(handle.db, CET4);
      const all = await wordbookRepository.list(handle.db);
      expect(all).toHaveLength(1);
      const byId = await wordbookRepository.findById(handle.db, CET4.id);
      expect(byId?.code).toBe('cet4');
      const byCode = await wordbookRepository.findByCode(handle.db, 'cet4');
      expect(byCode?.id).toBe(CET4.id);
    } finally {
      handle.close();
    }
  });
});

describe('wordRepository', () => {
  it('insertMany, listByBook, countByBook, findBySpelling, search', async () => {
    const handle = await createTestDb();
    try {
      await seed(handle);
      const list = await wordRepository.listByBook(handle.db, { bookId: CET4.id });
      expect(list.map((w) => w.spelling)).toEqual(['abandon', 'ability']);
      const count = await wordRepository.countByBook(handle.db, CET4.id);
      expect(count).toBe(2);
      const find = await wordRepository.findBySpelling(handle.db, CET4.id, 'abandon');
      expect(find?.id).toBe('w-1');
      const search = await wordRepository.search(handle.db, CET4.id, 'abi');
      expect(search.map((w) => w.spelling)).toEqual(['ability']);
    } finally {
      handle.close();
    }
  });
});

describe('wordStateRepository', () => {
  it('upserts a state, counts by status, applies reviews', async () => {
    const handle = await createTestDb();
    try {
      await seed(handle);
      await wordStateRepository.upsert(handle.db, {
        id: 'ws-1',
        wordId: 'w-1',
        status: 'new',
        fsrsState: { stability: 0, difficulty: 0 },
        dueAt: new Date(),
        reps: 0,
        lapses: 0,
      });
      expect(await wordStateRepository.countByStatus(handle.db, 'new')).toBe(1);
      await wordStateRepository.applyReview(handle.db, 'ws-1', {
        status: 'review',
        dueAt: new Date(Date.now() + 86_400_000),
        reps: 1,
        lapses: 0,
        fsrsState: { stability: 1, difficulty: 5 },
      });
      const after = await wordStateRepository.findById(handle.db, 'ws-1');
      expect(after?.status).toBe('review');
      expect(after?.reps).toBe(1);
    } finally {
      handle.close();
    }
  });

  it('newQueue returns tracked states for the book, filtered by status', async () => {
    const handle = await createTestDb();
    try {
      await seed(handle);
      // Two tracked states: one 'new' (the candidate we want surfaced),
      // one already 'review' (not a new word).
      await wordStateRepository.upsert(handle.db, {
        id: 'ws-1',
        wordId: 'w-1',
        status: 'new',
        fsrsState: { stability: 0, difficulty: 0 },
        dueAt: new Date(),
        reps: 0,
        lapses: 0,
      });
      await wordStateRepository.upsert(handle.db, {
        id: 'ws-2',
        wordId: 'w-2',
        status: 'review',
        fsrsState: { stability: 1, difficulty: 5 },
        dueAt: new Date(),
        reps: 1,
        lapses: 0,
      });
      const queue = await wordStateRepository.newQueue(handle.db, CET4.id, 10);
      // Only the 'new' status row should be returned.
      expect(queue.map((s) => s.id)).toEqual(['ws-1']);
    } finally {
      handle.close();
    }
  });
});

describe('reviewLogRepository', () => {
  it('appends and counts since', async () => {
    const handle = await createTestDb();
    try {
      await seed(handle);
      await reviewLogRepository.append(handle.db, {
        id: 'r-1',
        wordId: 'w-1',
        rating: 'good',
        mode: 'learn',
        ts: new Date(),
        durationMs: 1500,
      });
      const count = await reviewLogRepository.countSince(handle.db, new Date(Date.now() - 60_000));
      expect(count).toBe(1);
    } finally {
      handle.close();
    }
  });
});

describe('favoritesRepository', () => {
  it('adds, checks, lists, removes', async () => {
    const handle = await createTestDb();
    try {
      await seed(handle);
      expect(await favoritesRepository.isFavorited(handle.db, 'w-1')).toBe(false);
      await favoritesRepository.add(handle.db, 'w-1');
      expect(await favoritesRepository.isFavorited(handle.db, 'w-1')).toBe(true);
      const list = await favoritesRepository.list(handle.db);
      expect(list.map((w) => w.id)).toEqual(['w-1']);
      await favoritesRepository.remove(handle.db, 'w-1');
      expect(await favoritesRepository.isFavorited(handle.db, 'w-1')).toBe(false);
    } finally {
      handle.close();
    }
  });
});

describe('checkinRepository', () => {
  it('upserts a today row, increments on second call, and reads streak', async () => {
    const handle = await createTestDb();
    try {
      await checkinRepository.upsertToday(handle.db, {
        newCount: 3,
        reviewCount: 0,
        studySeconds: 0,
      });
      const today = checkinRepository.today();
      const row = await checkinRepository.findByDate(handle.db, today);
      expect(row?.newCount).toBe(3);

      await checkinRepository.upsertToday(handle.db, {
        newCount: 2,
        reviewCount: 0,
        studySeconds: 0,
      });
      const after = await checkinRepository.findByDate(handle.db, today);
      expect(after?.newCount).toBe(5);

      const streak = await checkinRepository.currentStreak(handle.db);
      expect(streak).toBe(1);
    } finally {
      handle.close();
    }
  });
});
