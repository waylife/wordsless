/**
 * Boot-time database migration.
 *
 * We do NOT use drizzle-kit's migrator here at runtime because
 * `drizzle-orm/better-sqlite3/migrator` is not bundle-friendly for React
 * Native. Instead, we keep the migration as a hand-maintained DDL block
 * keyed by version. Each entry is idempotent; we record the applied
 * version in `user_version` (a built-in SQLite pragma) so the boot path
 * is O(1) after the first run.
 *
 * If we later switch to a real migration tool, the function signature
 * stays the same — only the inner loop changes.
 */
import type { AnyWordslessDatabase } from './client';

interface Migration {
  version: number;
  up: (db: AnyWordslessDatabase) => Promise<void>;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    async up(db) {
      // Mirror the schema in src/db/schema.ts. We hand-write the DDL
      // because SQLite-on-device lacks the helper for typed `mode: 'json'`
      // columns — they end up as plain TEXT, which is what we want.
      const client = (db as unknown as { $client?: unknown }).$client as
        | {
            execAsync?: (sql: string) => Promise<unknown>;
            exec: (sql: string) => unknown;
          }
        | undefined;
      const ddl = `
        CREATE TABLE IF NOT EXISTS wordbooks (
          id TEXT PRIMARY KEY NOT NULL,
          code TEXT NOT NULL,
          name TEXT NOT NULL,
          word_count INTEGER NOT NULL DEFAULT 0,
          downloaded INTEGER NOT NULL DEFAULT 0,
          description TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE UNIQUE INDEX IF NOT EXISTS wordbooks_code_idx ON wordbooks(code);

        CREATE TABLE IF NOT EXISTS words (
          id TEXT PRIMARY KEY NOT NULL,
          book_id TEXT NOT NULL REFERENCES wordbooks(id) ON DELETE CASCADE,
          spelling TEXT NOT NULL,
          phonetic_uk TEXT,
          phonetic_us TEXT,
          meanings TEXT NOT NULL,
          examples TEXT NOT NULL DEFAULT '[]',
          root_affix TEXT,
          audio_status TEXT NOT NULL DEFAULT 'pending',
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE UNIQUE INDEX IF NOT EXISTS words_book_spelling_idx ON words(book_id, spelling);

        CREATE TABLE IF NOT EXISTS word_states (
          id TEXT PRIMARY KEY NOT NULL,
          word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'new',
          fsrs_state TEXT NOT NULL DEFAULT '{"stability":0,"difficulty":0}',
          due_at INTEGER NOT NULL,
          reps INTEGER NOT NULL DEFAULT 0,
          lapses INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS review_log (
          id TEXT PRIMARY KEY NOT NULL,
          word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
          rating TEXT NOT NULL,
          mode TEXT NOT NULL,
          ts INTEGER NOT NULL DEFAULT (unixepoch()),
          duration_ms INTEGER
        );
        CREATE INDEX IF NOT EXISTS review_log_word_idx ON review_log(word_id);
        CREATE INDEX IF NOT EXISTS review_log_ts_idx ON review_log(ts);

        CREATE TABLE IF NOT EXISTS ai_content (
          id TEXT PRIMARY KEY NOT NULL,
          word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          content TEXT NOT NULL,
          model TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ai_content_word_type_idx ON ai_content(word_id, type);

        CREATE TABLE IF NOT EXISTS favorites (
          word_id TEXT PRIMARY KEY NOT NULL REFERENCES words(id) ON DELETE CASCADE,
          ts INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS checkins (
          date TEXT PRIMARY KEY NOT NULL,
          new_count INTEGER NOT NULL DEFAULT 0,
          review_count INTEGER NOT NULL DEFAULT 0,
          study_seconds INTEGER NOT NULL DEFAULT 0
        );
      `;
      if (client && typeof client.execAsync === 'function') {
        await client.execAsync(ddl);
      } else {
        (client ?? (db as unknown as { exec: (sql: string) => unknown })).exec(ddl);
      }
    },
  },
  {
    version: 2,
    async up(db) {
      // Phase 2/3: settings key/value table for non-sensitive prefs.
      const client = (db as unknown as { $client?: unknown }).$client as
        | {
            execAsync?: (sql: string) => Promise<unknown>;
            exec: (sql: string) => unknown;
          }
        | undefined;
      const ddl = `
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
      `;
      if (client && typeof client.execAsync === 'function') {
        await client.execAsync(ddl);
      } else {
        (client ?? (db as unknown as { exec: (sql: string) => unknown })).exec(ddl);
      }
    },
  },
];

/**
 * Apply any pending migrations. Reads `user_version` to find the
 * high-water mark and walks MIGRATIONS in order. Returns the number of
 * new migrations applied.
 */
export async function runMigrations(
  db: AnyWordslessDatabase,
): Promise<{ applied: number; current: number }> {
  const versionRow = await readUserVersion(db);
  const current = versionRow;

  let applied = 0;
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    await migration.up(db);
    await writeUserVersion(db, migration.version);
    applied += 1;
  }
  return { applied, current: current + applied };
}

async function readUserVersion(db: AnyWordslessDatabase): Promise<number> {
  // The two SQLite drivers we use (expo-sqlite and better-sqlite3) speak
  // slightly different APIs. We go through `$client` to stay driver-agnostic.
  const client = (db as unknown as { $client?: unknown }).$client as
    | {
        getFirstAsync?: (sql: string) => Promise<{ user_version: number } | null>;
        prepare: (sql: string) => { get: () => unknown };
      }
    | undefined;
  if (client && typeof client.getFirstAsync === 'function') {
    const row = await client.getFirstAsync('PRAGMA user_version');
    return row?.user_version ?? 0;
  }
  const fallback =
    client ?? (db as unknown as { prepare: (sql: string) => { get: () => unknown } });
  const row = fallback.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
  return row?.user_version ?? 0;
}

async function writeUserVersion(db: AnyWordslessDatabase, version: number): Promise<void> {
  const client = (db as unknown as { $client?: unknown }).$client as
    | {
        execAsync?: (sql: string) => Promise<unknown>;
        exec: (sql: string) => unknown;
      }
    | undefined;
  if (client && typeof client.execAsync === 'function') {
    await client.execAsync(`PRAGMA user_version = ${version}`);
  } else {
    (client ?? (db as unknown as { exec: (sql: string) => unknown })).exec(
      `PRAGMA user_version = ${version}`,
    );
  }
}
