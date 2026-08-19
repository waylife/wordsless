/**
 * Review-log repository — append-only event log.
 *
 * Every "show me a card, I rated it X" interaction appends a row.
 * The Streak and Stats pages aggregate over this; the FSRS scheduler
 * consumes a stream of recent events when it needs to recompute.
 */
import { count, desc, eq, gte, sql } from 'drizzle-orm';

import type { Db } from '../client';
import { type NewReviewLogRow, type ReviewLogRow, reviewLog } from '../schema';

export const reviewLogRepository = {
  async append(db: Db, row: NewReviewLogRow): Promise<void> {
    db.insert(reviewLog).values(row).run();
  },

  async listForWord(db: Db, wordId: string, limit = 50): Promise<ReviewLogRow[]> {
    return db
      .select()
      .from(reviewLog)
      .where(eq(reviewLog.wordId, wordId))
      .orderBy(desc(reviewLog.ts))
      .limit(limit)
      .all();
  },

  /**
   * Count reviews in a given window. Used by the Stats page to build
   * the 7-day bar chart.
   */
  async countSince(db: Db, since: Date): Promise<number> {
    const row = db.select({ value: count() }).from(reviewLog).where(gte(reviewLog.ts, since)).get();
    return row?.value ?? 0;
  },

  /**
   * Debug-only.
   */
  async _deleteAllForTests(db: Db): Promise<void> {
    db.delete(reviewLog)
      .where(sql`1=1`)
      .run();
  },
};
