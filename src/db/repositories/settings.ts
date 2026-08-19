/**
 * Settings repository — thin key/value store for non-sensitive app
 * preferences (accent, daily new-word quota, theme override, …).
 *
 * Sensitive material (e.g. the user's MiniMax API key) does NOT live
 * here — it goes to `expo-secure-store` instead. This table is plain
 * SQLite and is fine to lose on reinstall.
 *
 * The value column is JSON-encoded so we can store richer shapes than
 * a single scalar (e.g. a `{ accent, dailyNewWords, theme }` blob) and
 * add new keys without a migration.
 */
import { eq } from 'drizzle-orm';

import type { Db } from '../client';
import { type NewSettingsRow, type SettingsRow, settings } from '../schema';

export const settingsRepository = {
  async get<T>(db: Db, key: string): Promise<T | null> {
    const row = db.select().from(settings).where(eq(settings.key, key)).get();
    if (!row) return null;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return null;
    }
  },

  async set<T>(db: Db, key: string, value: T): Promise<void> {
    const now = new Date();
    const row: NewSettingsRow = {
      key,
      value: JSON.stringify(value),
      updatedAt: now,
    };
    db.insert(settings)
      .values(row)
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: row.value, updatedAt: now },
      })
      .run();
  },

  async list(db: Db): Promise<SettingsRow[]> {
    return db.select().from(settings).all();
  },

  /**
   * Debug-only.
   */
  async _deleteAllForTests(db: Db): Promise<void> {
    db.delete(settings).where(eq(settings.key, settings.key)).run();
  },
};
