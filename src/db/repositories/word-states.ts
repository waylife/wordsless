/**
 * Word-states repository — the heart of the app.
 *
 * Each word the user has touched (or been scheduled to touch) has a row
 * here; the FSRS scheduler in `core/fsrs` reads + writes the `fsrsState`
 * blob and `dueAt`/`reps`/`lapses` counters.
 *
 * The repository deliberately hides raw SQL — every read is shaped to
 * one of the actual UI asks (today's review queue, next unseen words in
 * a book, lookup by id). The scheduler never builds its own query.
 */
import { and, asc, count, eq, lte, or, sql } from 'drizzle-orm';

import type { Db } from '../client';
import {
  type FsrsSnapshot,
  type NewWordState,
  type WordState,
  type WordStatusValue,
  wordStates,
  words,
} from '../schema';

const MAX_FETCH = 200;

export const wordStateRepository = {
  async findById(db: Db, id: string): Promise<WordState | null> {
    const row = db.select().from(wordStates).where(eq(wordStates.id, id)).get();
    return row ?? null;
  },

  async findByWordId(db: Db, wordId: string): Promise<WordState | null> {
    const row = db.select().from(wordStates).where(eq(wordStates.wordId, wordId)).get();
    return row ?? null;
  },

  /**
   * Today's review queue — every `word_states` row with `due_at <= now`
   * and a `review` / `learning` status. Excludes words the user has
   * marked as `excluded` or that graduated to `mastered` and aren't
   * due yet.
   */
  async dueQueue(
    db: Db,
    now: Date,
    limit = MAX_FETCH,
  ): Promise<(WordState & { word: typeof words.$inferSelect })[]> {
    const rows = db
      .select({ state: wordStates, word: words })
      .from(wordStates)
      .innerJoin(words, eq(words.id, wordStates.wordId))
      .where(
        and(
          lte(wordStates.dueAt, now),
          or(eq(wordStates.status, 'review'), eq(wordStates.status, 'learning')),
        ),
      )
      .orderBy(asc(wordStates.dueAt))
      .limit(limit)
      .all();
    return rows.map((r) => ({ ...r.state, word: r.word }));
  },

  /**
   * New-word queue for a book. Picks words the user has never seen
   * (no row in `word_states`) up to the daily quota.
   *
   * Excludes words that are `excluded` already.
   */
  async newQueue(db: Db, bookId: string, limit: number): Promise<WordState[]> {
    const rows = db
      .select()
      .from(wordStates)
      .innerJoin(words, eq(words.id, wordStates.wordId))
      .where(eq(words.bookId, bookId))
      .orderBy(asc(words.spelling))
      .limit(limit * 4) // over-fetch because we filter client-side for "new" status
      .all();
    const newOnes = rows.filter((r) => r.word_states.status === 'new').slice(0, limit);
    return newOnes.map((r) => r.word_states);
  },

  async countByStatus(db: Db, status: WordStatusValue): Promise<number> {
    const row = db
      .select({ value: count() })
      .from(wordStates)
      .where(eq(wordStates.status, status))
      .get();
    return row?.value ?? 0;
  },

  async countAll(db: Db): Promise<number> {
    const row = db.select({ value: count() }).from(wordStates).get();
    return row?.value ?? 0;
  },

  async upsert(db: Db, row: NewWordState): Promise<void> {
    const now = new Date();
    db.insert(wordStates)
      .values({ ...row, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: wordStates.id,
        set: {
          status: row.status,
          fsrsState: row.fsrsState,
          dueAt: row.dueAt,
          reps: row.reps,
          lapses: row.lapses,
          updatedAt: now,
        },
      })
      .run();
  },

  async applyReview(
    db: Db,
    id: string,
    patch: {
      status: WordStatusValue;
      dueAt: Date;
      reps: number;
      lapses: number;
      fsrsState: FsrsSnapshot;
    },
  ): Promise<void> {
    const now = new Date();
    db.update(wordStates)
      .set({
        status: patch.status,
        dueAt: patch.dueAt,
        reps: patch.reps,
        lapses: patch.lapses,
        fsrsState: patch.fsrsState,
        updatedAt: now,
      })
      .where(eq(wordStates.id, id))
      .run();
  },

  async markExcluded(db: Db, id: string): Promise<void> {
    db.update(wordStates)
      .set({ status: 'excluded', updatedAt: new Date() })
      .where(eq(wordStates.id, id))
      .run();
  },

  /**
   * Debug-only: drop every word_state row. Called by the data reset
   * utility, never by the running app.
   */
  async _deleteAllForTests(db: Db): Promise<void> {
    db.delete(wordStates)
      .where(sql`1=1`)
      .run();
  },
};

// Re-export so `wordState` is a single import surface for the UI.
export type { WordState };
