/**
 * Migration tests — verify the v1 DDL produces a schema that matches
 * the Drizzle definitions.
 */
import { runMigrations } from '@/db/migrate';

import { createTestDb } from './test-db';

describe('runMigrations', () => {
  it('is a no-op on a fresh database after the first apply', async () => {
    const handle = await createTestDb();
    try {
      // createTestDb already ran migrations, calling again should be 0.
      const result = await runMigrations(
        handle.db as unknown as Parameters<typeof runMigrations>[0],
      );
      expect(result.applied).toBe(0);
      expect(result.current).toBe(2);
    } finally {
      handle.close();
    }
  });

  it('records the applied version in user_version', async () => {
    const handle = await createTestDb();
    try {
      const row = handle.sqlite.prepare('PRAGMA user_version').get() as { user_version: number };
      expect(row.user_version).toBe(2);
    } finally {
      handle.close();
    }
  });

  it('creates the expected tables', async () => {
    const handle = await createTestDb();
    try {
      const tables = handle.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];
      const names = tables.map((t) => t.name);
      for (const expected of [
        'wordbooks',
        'words',
        'word_states',
        'review_log',
        'ai_content',
        'favorites',
        'checkins',
        'settings',
        'drizzle___ migrations', // not expected; placeholder for completeness
      ]) {
        if (expected.startsWith('drizzle')) continue;
        expect(names).toContain(expected);
      }
    } finally {
      handle.close();
    }
  });
});
