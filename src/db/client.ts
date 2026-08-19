/**
 * Singleton access to the Wordsless SQLite database.
 *
 * Uses `expo-sqlite` async API and wraps it in Drizzle's sqlite-core proxy.
 * The connection is opened lazily on first call and cached for the
 * lifetime of the JS runtime (one process per app run).
 *
 * The Drizzle type is intentionally opaque: callers should depend on the
 * repository layer (`./repositories/*`) rather than running raw queries.
 * That keeps the schema refactor-friendly.
 */
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';

import * as schema from './schema';

const DB_NAME = 'wordsless.db';

/**
 * `BaseSQLiteDatabase` parameterized over the schema. Both expo-sqlite and
 * better-sqlite3 (used in tests) implement this same shape, so the
 * repository layer can be written against `AnyWordslessDatabase` and unit
 * tested against the in-memory driver.
 */
export type AnyWordslessDatabase = BaseSQLiteDatabase<'sync', unknown, typeof schema>;

export type WordslessDatabase = ReturnType<typeof drizzle<typeof schema>>;

let _db: WordslessDatabase | null = null;
let _opening: Promise<WordslessDatabase> | null = null;

export async function getDb(): Promise<WordslessDatabase> {
  if (_db) return _db;
  if (_opening) return _opening;
  _opening = (async () => {
    const sqlite = await SQLite.openDatabaseAsync(DB_NAME);
    await sqlite.execAsync('PRAGMA journal_mode = WAL;');
    await sqlite.execAsync('PRAGMA foreign_keys = ON;');
    const db = drizzle(sqlite, { schema });
    _db = db;
    return db;
  })();
  return _opening;
}

/**
 * Hard-close — used by integration tests that open many databases. Never
 * call this from app code: the connection is meant to live for the
 * process lifetime.
 */
export async function _closeDbForTests(): Promise<void> {
  if (!_db) return;
  await _db.$client.closeAsync();
  _db = null;
  _opening = null;
}

export type Db = AnyWordslessDatabase;
