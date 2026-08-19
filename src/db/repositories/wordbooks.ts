/**
 * Wordbooks repository — operations on the `wordbooks` reference table.
 *
 * The table holds the catalog of installable word lists (CET-4, TOEFL, …).
 * The actual vocabulary rows live in `words` and are managed by the
 * data-pipeline scripts in `data/`. UI code only ever reads here.
 */
import { and, eq } from 'drizzle-orm';

import type { Db } from '../client';
import { type NewWordbook, type Wordbook, wordbooks } from '../schema';

export const wordbookRepository = {
  async list(db: Db): Promise<Wordbook[]> {
    return db.select().from(wordbooks).all();
  },

  async findByCode(db: Db, code: string): Promise<Wordbook | null> {
    // Cast to the enum — `eq` is type-strict for `text({ enum })` columns.
    const row = db
      .select()
      .from(wordbooks)
      .where(eq(wordbooks.code, code as Wordbook['code']))
      .get();
    return row ?? null;
  },

  async findById(db: Db, id: string): Promise<Wordbook | null> {
    const row = db.select().from(wordbooks).where(eq(wordbooks.id, id)).get();
    return row ?? null;
  },

  async upsert(db: Db, row: NewWordbook): Promise<void> {
    db.insert(wordbooks)
      .values(row)
      .onConflictDoUpdate({
        target: wordbooks.id,
        set: {
          name: row.name,
          description: row.description ?? null,
          wordCount: row.wordCount,
          downloaded: row.downloaded,
        },
      })
      .run();
  },

  async markDownloaded(db: Db, id: string, downloaded: boolean): Promise<void> {
    db.update(wordbooks)
      .set({ downloaded })
      .where(and(eq(wordbooks.id, id)))
      .run();
  },
};
