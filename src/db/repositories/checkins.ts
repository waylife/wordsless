/**
 * Checkins repository — daily roll-up table.
 *
 * One row per calendar day. Streak and Stats pages read here for fast
 * `O(days)` queries; the running totals are merged into the row as
 * review_log events happen.
 */
import { desc, eq, sql } from 'drizzle-orm';

import type { Db } from '../client';
import { type CheckinRow, type NewCheckinRow, checkins } from '../schema';

function todayKey(d: Date = new Date()): string {
  // YYYY-MM-DD in local time.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const checkinRepository = {
  today(): string {
    return todayKey();
  },

  async upsertToday(
    db: Db,
    patch: Pick<NewCheckinRow, 'newCount' | 'reviewCount' | 'studySeconds'>,
  ): Promise<void> {
    const date = todayKey();
    db.insert(checkins)
      .values({ date, ...patch })
      .onConflictDoUpdate({
        target: checkins.date,
        set: {
          newCount: sql`${checkins.newCount} + ${patch.newCount ?? 0}`,
          reviewCount: sql`${checkins.reviewCount} + ${patch.reviewCount ?? 0}`,
          studySeconds: sql`${checkins.studySeconds} + ${patch.studySeconds ?? 0}`,
        },
      })
      .run();
  },

  async findByDate(db: Db, date: string): Promise<CheckinRow | null> {
    const row = db.select().from(checkins).where(eq(checkins.date, date)).get();
    return row ?? null;
  },

  async listRecent(db: Db, days = 7): Promise<CheckinRow[]> {
    return db.select().from(checkins).orderBy(desc(checkins.date)).limit(days).all().reverse();
  },

  async currentStreak(db: Db): Promise<number> {
    // Walk back from today; stop on the first missing or zero-studied day.
    let streak = 0;
    const cursor = new Date();
    for (let i = 0; i < 365; i++) {
      const date = todayKey(cursor);
      const row = db.select().from(checkins).where(eq(checkins.date, date)).get();
      if (!row || row.newCount + row.reviewCount === 0) {
        if (i === 0) {
          // Today not yet studied — skip without breaking a streak
          // that ended yesterday.
          cursor.setDate(cursor.getDate() - 1);
          continue;
        }
        break;
      }
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  },
};
