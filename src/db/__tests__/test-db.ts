/**
 * In-memory database for unit tests.
 *
 * The production app uses `expo-sqlite` for persistence; in tests we use
 * `better-sqlite3` (a pure-node driver) and the matching Drizzle proxy
 * so the same schema and repository code can be exercised without RN
 * runtime. Schema is the single source of truth — the migrations are
 * applied here via the same `runMigrations` helper.
 */
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import { runMigrations } from '../migrate';
import * as schema from '../schema';

export type TestDb = BetterSQLite3Database<typeof schema>;

export interface TestDbHandle {
  db: TestDb;
  sqlite: Database.Database;
  close: () => void;
}

export async function createTestDb(): Promise<TestDbHandle> {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = MEMORY');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  await runMigrations(db as unknown as Parameters<typeof runMigrations>[0]);
  return {
    db,
    sqlite,
    close: () => sqlite.close(),
  };
}
