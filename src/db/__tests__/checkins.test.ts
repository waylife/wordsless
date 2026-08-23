/**
 * checkinRepository — currentStreak() edge cases.
 *
 * The basic happy-path is covered in repositories.test.ts. This file
 * exercises the break / skip / past-history branches that the home
 * tab relies on.
 */
import { checkinRepository } from '@/db/repositories/checkins';

import { createTestDb, type TestDbHandle } from './test-db';

function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function offsetKey(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return todayKey(d);
}

async function writeCheckin(handle: TestDbHandle, daysBack: number, newCount: number) {
  const date = offsetKey(daysBack);
  handle.sqlite
    .prepare(
      'INSERT OR REPLACE INTO checkins (date, new_count, review_count, study_seconds) VALUES (?, ?, 0, 0)',
    )
    .run(date, newCount);
}

describe('checkinRepository.currentStreak', () => {
  it('returns 0 when there is no history at all', async () => {
    const handle = await createTestDb();
    try {
      expect(await checkinRepository.currentStreak(handle.db)).toBe(0);
    } finally {
      handle.close();
    }
  });

  it('skips today when not yet studied and counts from yesterday', async () => {
    const handle = await createTestDb();
    try {
      // User has not studied today but did study yesterday.
      await writeCheckin(handle, 1, 5);
      expect(await checkinRepository.currentStreak(handle.db)).toBe(1);
    } finally {
      handle.close();
    }
  });

  it('breaks on a missing day and reports only the most recent run', async () => {
    const handle = await createTestDb();
    try {
      // Today + yesterday + 3-days-ago are studied; the day before
      // yesterday is not — streak should be 2, not 3.
      await writeCheckin(handle, 0, 4);
      await writeCheckin(handle, 1, 6);
      await writeCheckin(handle, 3, 2);
      expect(await checkinRepository.currentStreak(handle.db)).toBe(2);
    } finally {
      handle.close();
    }
  });

  it('does not count days with zero study', async () => {
    const handle = await createTestDb();
    try {
      await writeCheckin(handle, 0, 0);
      await writeCheckin(handle, 1, 0);
      // Both rows are zero-studied; nothing should count.
      expect(await checkinRepository.currentStreak(handle.db)).toBe(0);
    } finally {
      handle.close();
    }
  });

  it('handles a long unbroken streak', async () => {
    const handle = await createTestDb();
    try {
      for (let i = 0; i < 14; i++) {
        await writeCheckin(handle, i, 1);
      }
      expect(await checkinRepository.currentStreak(handle.db)).toBe(14);
    } finally {
      handle.close();
    }
  });
});
