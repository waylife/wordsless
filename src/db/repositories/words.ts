/**
 * Words repository — operations on the `words` reference table.
 *
 * The table is the canonical, immutable vocabulary store. Once a row
 * is inserted (by the data-pipeline build script) it should not be
 * edited from the app — only read. Edits go through a new build.
 */
import { and, count, eq, like, sql } from 'drizzle-orm';

import type { Db } from '../client';
import { type NewWord, type Word, words } from '../schema';

export interface WordListOptions {
  bookId: string;
  limit?: number;
  offset?: number;
}

export const wordRepository = {
  async findById(db: Db, id: string): Promise<Word | null> {
    const row = db.select().from(words).where(eq(words.id, id)).get();
    return row ?? null;
  },

  async findBySpelling(db: Db, bookId: string, spelling: string): Promise<Word | null> {
    const row = db
      .select()
      .from(words)
      .where(and(eq(words.bookId, bookId), eq(words.spelling, spelling)))
      .get();
    return row ?? null;
  },

  async listByBook(db: Db, opts: WordListOptions): Promise<Word[]> {
    const { bookId, limit = 100, offset = 0 } = opts;
    return db
      .select()
      .from(words)
      .where(eq(words.bookId, bookId))
      .limit(limit)
      .offset(offset)
      .all();
  },

  async countByBook(db: Db, bookId: string): Promise<number> {
    const row = db.select({ value: count() }).from(words).where(eq(words.bookId, bookId)).get();
    return row?.value ?? 0;
  },

  /**
   * Naive substring search; we'll graduate to FTS5 once the catalog is
   * big enough for LIKE to hurt.
   */
  async search(db: Db, bookId: string, query: string, limit = 50): Promise<Word[]> {
    const q = `%${query.trim().toLowerCase()}%`;
    return db
      .select()
      .from(words)
      .where(and(eq(words.bookId, bookId), like(sql`lower(${words.spelling})`, q)))
      .limit(limit)
      .all();
  },

  async insertMany(db: Db, rows: NewWord[]): Promise<void> {
    if (rows.length === 0) return;
    // Chunk to keep individual statements under SQLite's parameter limit.
    // onConflictDoNothing makes the call idempotent: re-seeding the
    // same compiled JSON after the user uninstalls is safe.
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      db.insert(words)
        .values(rows.slice(i, i + CHUNK))
        .onConflictDoNothing()
        .run();
    }
  },
};
