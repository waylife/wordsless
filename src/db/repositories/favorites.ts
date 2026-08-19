/**
 * Favorites repository — single-row-per-word model.
 *
 * Favoriting a word adds a row; un-favoriting removes it. The schema
 * leaves room for a later migration to a log table without breaking
 * reads.
 */
import { count, desc, eq } from 'drizzle-orm';

import type { Db } from '../client';
import { type Word, favorites, words } from '../schema';

export const favoritesRepository = {
  async add(db: Db, wordId: string): Promise<void> {
    db.insert(favorites).values({ wordId }).onConflictDoNothing().run();
  },

  async remove(db: Db, wordId: string): Promise<void> {
    db.delete(favorites).where(eq(favorites.wordId, wordId)).run();
  },

  async isFavorited(db: Db, wordId: string): Promise<boolean> {
    const row = db
      .select({ wordId: favorites.wordId })
      .from(favorites)
      .where(eq(favorites.wordId, wordId))
      .get();
    return row != null;
  },

  async list(db: Db): Promise<Word[]> {
    return db
      .select({ word: words })
      .from(favorites)
      .innerJoin(words, eq(words.id, favorites.wordId))
      .orderBy(desc(favorites.ts))
      .all()
      .map((r) => r.word);
  },

  async count(db: Db): Promise<number> {
    const row = db.select({ value: count() }).from(favorites).get();
    return row?.value ?? 0;
  },
};
