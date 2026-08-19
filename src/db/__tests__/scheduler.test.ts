/**
 * Scheduler tests — verify new-word picking, due-queue inclusion, the
 * daily cap, and the home-tab counts.
 */
import { buildSession, getHomeCounts } from '@/core/scheduler';
import { settingsRepository } from '@/db/repositories/settings';
import { wordStateRepository } from '@/db/repositories/word-states';
import { wordbookRepository } from '@/db/repositories/wordbooks';
import { wordRepository } from '@/db/repositories/words';
import type { NewWord, Word, WordState } from '@/db/schema';

import { createTestDb, type TestDbHandle } from './test-db';

const CET4 = {
  id: 'wb-cet4',
  code: 'cet4' as const,
  name: '四级',
  wordCount: 0,
  downloaded: true,
  description: null,
};

function makeWord(id: string, spelling: string, bookId = CET4.id): NewWord {
  return {
    id,
    bookId,
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

async function makeState(
  handle: TestDbHandle,
  word: Word,
  patch: Partial<WordState> = {},
): Promise<WordState> {
  const now = new Date();
  const state: WordState = {
    id: `ws-${word.id}`,
    wordId: word.id,
    status: 'new',
    fsrsState: { stability: 0, difficulty: 0 },
    dueAt: now,
    reps: 0,
    lapses: 0,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
  await wordStateRepository.upsert(handle.db, state);
  return state;
}

describe('buildSession', () => {
  it('returns an empty session when the book is empty', async () => {
    const handle = await createTestDb();
    try {
      await seedBook(handle, []);
      const session = buildSession(handle.db, {
        bookId: CET4.id,
        mode: 'learn',
        dailyNewWords: 5,
      });
      expect(session.items).toEqual([]);
      expect(session.counts.newCount).toBe(0);
    } finally {
      handle.close();
    }
  });

  it('picks up to dailyNewWords new words from the book', async () => {
    const handle = await createTestDb();
    try {
      const ws: NewWord[] = Array.from({ length: 10 }, (_, i) => makeWord(`w-${i}`, `word${i}`));
      await seedBook(handle, ws);
      const session = buildSession(handle.db, {
        bookId: CET4.id,
        mode: 'learn',
        dailyNewWords: 3,
      });
      expect(session.items).toHaveLength(3);
      expect(session.items.every((it) => it.state.status === 'new')).toBe(true);
      expect(session.counts.newCount).toBe(3);
    } finally {
      handle.close();
    }
  });

  it('review mode returns due cards without introducing new ones', async () => {
    const handle = await createTestDb();
    try {
      const ws: NewWord[] = Array.from({ length: 5 }, (_, i) => makeWord(`w-${i}`, `word${i}`));
      await seedBook(handle, ws);
      const stored = await Promise.all(
        ws.map((w, i) =>
          wordRepository.findById(handle.db, w.id).then((row) => ({ w: row!, idx: i })),
        ),
      );
      const past = new Date('2026-01-01T00:00:00Z');
      await makeState(handle, stored[0]!.w, {
        status: 'review',
        dueAt: past,
        fsrsState: { stability: 5, difficulty: 5 },
      });
      await makeState(handle, stored[1]!.w, {
        status: 'review',
        dueAt: past,
        fsrsState: { stability: 5, difficulty: 5 },
      });

      const session = buildSession(handle.db, {
        bookId: CET4.id,
        mode: 'review',
        dailyNewWords: 30,
      });
      expect(session.counts.newCount).toBe(0);
      expect(session.items.map((it) => it.word.spelling).sort()).toEqual(['word0', 'word1']);
    } finally {
      handle.close();
    }
  });

  it('learn mode includes both new and due cards (de-duped)', async () => {
    const handle = await createTestDb();
    try {
      const ws: NewWord[] = Array.from({ length: 5 }, (_, i) => makeWord(`w-${i}`, `word${i}`));
      await seedBook(handle, ws);
      const stored = await Promise.all(
        ws.map((w) => wordRepository.findById(handle.db, w.id).then((row) => row!)),
      );
      const past = new Date('2026-01-01T00:00:00Z');
      await makeState(handle, stored[0]!, {
        status: 'review',
        dueAt: past,
        fsrsState: { stability: 5, difficulty: 5 },
      });
      // stored[1..4] are fresh, no state row → eligible as "new" in learn mode

      const session = buildSession(handle.db, {
        bookId: CET4.id,
        mode: 'learn',
        dailyNewWords: 4,
      });
      // 1 due + 4 new = 5 total, ordered: new first, then due
      expect(session.items).toHaveLength(5);
      const spellings = session.items.map((it) => it.word.spelling);
      expect(new Set(spellings)).toEqual(new Set(['word0', 'word1', 'word2', 'word3', 'word4']));
    } finally {
      handle.close();
    }
  });
});

describe('getHomeCounts', () => {
  it('returns zeros on a fresh db', async () => {
    const handle = await createTestDb();
    try {
      const counts = await getHomeCounts(handle.db);
      expect(counts.dueCount).toBe(0);
      expect(counts.masteredCount).toBe(0);
      expect(counts.totalCount).toBe(0);
    } finally {
      handle.close();
    }
  });
});

// Touch import to make sure settingsRepository isn't dead-code-eliminated.
void settingsRepository;
