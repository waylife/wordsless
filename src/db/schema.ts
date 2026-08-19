/**
 * Wordsless — Drizzle schema.
 *
 * The schema is the single source of truth for the local SQLite database.
 * Every table follows the sync-friendly conventions from plans/PLAN.md §4:
 *   - User-data tables use UUID primary keys + `updated_at` for conflict-free
 *     merging once a future SyncProvider lands.
 *   - Reference data (wordbooks, words, ai_content) is treated as immutable
 *     and never participates in sync.
 *   - `review_log` is append-only (no updates) so it can be replayed verbatim.
 *
 * Run `pnpm db:generate` to produce a new SQL migration, then `pnpm db:migrate`
 * to apply pending migrations to the device database at boot time.
 */
import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ---------- enums (string union consts) ----------

export const WordbookCode = ['cet4', 'cet6', 'kaoyan', 'toefl', 'ielts', 'gre'] as const;
export type WordbookCodeValue = (typeof WordbookCode)[number];

export const WordStatus = ['new', 'learning', 'review', 'mastered', 'excluded'] as const;
export type WordStatusValue = (typeof WordStatus)[number];

export const ReviewMode = ['learn', 'choice', 'listen', 'spell'] as const;
export type ReviewModeValue = (typeof ReviewMode)[number];

export const ReviewRating = ['forgot', 'hard', 'good', 'easy'] as const;
export type ReviewRatingValue = (typeof ReviewRating)[number];

export const AiContentType = ['example', 'root', 'mnemonic', 'diff'] as const;
export type AiContentTypeValue = (typeof AiContentType)[number];

// ---------- tables ----------

/**
 * Wordbooks — reference data. Each wordbook (CET-4, TOEFL, …) is described
 * here with its target word count. The actual word rows live in `words`.
 */
export const wordbooks = sqliteTable(
  'wordbooks',
  {
    id: text('id').primaryKey(),
    code: text('code', { enum: WordbookCode }).notNull(),
    name: text('name').notNull(),
    wordCount: integer('word_count').notNull().default(0),
    downloaded: integer('downloaded', { mode: 'boolean' }).notNull().default(false),
    description: text('description'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    codeIdx: uniqueIndex('wordbooks_code_idx').on(table.code),
  }),
);

/**
 * Words — the canonical vocabulary entries. JSON columns hold the
 * multi-pos meanings and per-mode example sentences; we keep them
 * inline so a single SELECT pulls everything the card UI needs.
 */
export const words = sqliteTable(
  'words',
  {
    id: text('id').primaryKey(),
    bookId: text('book_id')
      .notNull()
      .references(() => wordbooks.id, { onDelete: 'cascade' }),
    spelling: text('spelling').notNull(),
    phoneticUk: text('phonetic_uk'),
    phoneticUs: text('phonetic_us'),
    /** JSON array: { pos: string, def: string, examples?: string[] }[] */
    meanings: text('meanings', { mode: 'json' }).$type<MeaningEntry[]>().notNull(),
    /** JSON array: { en: string, cn: string, source: 'static' | 'ai' }[] */
    examples: text('examples', { mode: 'json' }).$type<ExampleEntry[]>().notNull().default([]),
    rootAffix: text('root_affix'),
    /** 'pending' | 'partial' | 'ready' | 'unavailable' */
    audioStatus: text('audio_status').notNull().default('pending'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    bookSpellingIdx: uniqueIndex('words_book_spelling_idx').on(table.bookId, table.spelling),
  }),
);

export interface MeaningEntry {
  pos: string;
  def: string;
  examples?: string[];
}

export interface ExampleEntry {
  en: string;
  cn: string;
  source: 'static' | 'ai';
}

/**
 * Word states — one row per (word × user). The user's progress through the
 * FSRS scheduler lives here; `fsrsState` is a JSON blob that the scheduler
 * layer owns and reads/writes as a single unit.
 */
export const wordStates = sqliteTable('word_states', {
  id: text('id').primaryKey(),
  wordId: text('word_id')
    .notNull()
    .references(() => words.id, { onDelete: 'cascade' }),
  status: text('status', { enum: WordStatus }).notNull().default('new'),
  /** FSRS scheduler payload. Owned by core/fsrs; the column is opaque here. */
  fsrsState: text('fsrs_state', { mode: 'json' })
    .$type<FsrsSnapshot>()
    .notNull()
    .default({ stability: 0, difficulty: 0 }),
  /** Next time this word should be surfaced (unix seconds). */
  dueAt: integer('due_at', { mode: 'timestamp' }).notNull(),
  reps: integer('reps').notNull().default(0),
  lapses: integer('lapses').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export interface FsrsSnapshot {
  stability: number;
  difficulty: number;
}

/**
 * Review log — append-only event log. Every "show me a card, I rated it X"
 * interaction becomes a row here. The Stats and Streak pages aggregate over
 * this; the FSRS scheduler also uses it to drive updates to `word_states`.
 */
export const reviewLog = sqliteTable('review_log', {
  id: text('id').primaryKey(),
  wordId: text('word_id')
    .notNull()
    .references(() => words.id, { onDelete: 'cascade' }),
  rating: text('rating', { enum: ReviewRating }).notNull(),
  mode: text('mode', { enum: ReviewMode }).notNull(),
  /** Wall-clock seconds since epoch. */
  ts: integer('ts', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  /** Time the user spent on this card in ms — useful for engagement analytics. */
  durationMs: integer('duration_ms'),
});

/**
 * AI-generated content — immutable cache. Keyed on (word_id, type); the
 * runtime AI client reads here first and only calls the model on miss.
 */
export const aiContent = sqliteTable(
  'ai_content',
  {
    id: text('id').primaryKey(),
    wordId: text('word_id')
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    type: text('type', { enum: AiContentType }).notNull(),
    content: text('content', { mode: 'json' }).notNull(),
    model: text('model').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    wordTypeIdx: uniqueIndex('ai_content_word_type_idx').on(table.wordId, table.type),
  }),
);

/**
 * Favorites — the per-user "starred words" list. A user may favorite a
 * word many times (e.g. un-favorite then re-favorite), so we keep an
 * append-only log and treat "is currently favorited" as
 * `MAX(ts) IS NOT NULL` aggregated at query time.
 *
 * For Phase 1 we keep a single-row per word model: when favoriting, we
 * INSERT; when un-favoriting, we DELETE. The schema leaves room for a
 * later migration to a log table without breaking reads.
 */
export const favorites = sqliteTable('favorites', {
  wordId: text('word_id')
    .primaryKey()
    .references(() => words.id, { onDelete: 'cascade' }),
  ts: integer('ts', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * Checkins — daily roll-up used by the streak and stats pages.
 * One row per calendar day; the values are totals for the day.
 */
export const checkins = sqliteTable('checkins', {
  /** ISO date in YYYY-MM-DD form. */
  date: text('date').primaryKey(),
  newCount: integer('new_count').notNull().default(0),
  reviewCount: integer('review_count').notNull().default(0),
  studySeconds: integer('study_seconds').notNull().default(0),
});

/**
 * Settings — a small key/value store for non-sensitive app preferences
 * (accent, daily new-word quota, theme override, …). Each row holds a
 * JSON-serialized value; we keep the schema generic so new keys don't
 * require a migration.
 *
 * Sensitive material (e.g. the user's MiniMax API key) does NOT live
 * here — it goes to `expo-secure-store` instead.
 */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  /** JSON-encoded value; decode on read. */
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type SettingsRow = typeof settings.$inferSelect;
export type NewSettingsRow = typeof settings.$inferInsert;

// ---------- inferred row types ----------

export type Wordbook = typeof wordbooks.$inferSelect;
export type NewWordbook = typeof wordbooks.$inferInsert;
export type Word = typeof words.$inferSelect;
export type NewWord = typeof words.$inferInsert;
export type WordState = typeof wordStates.$inferSelect;
export type NewWordState = typeof wordStates.$inferInsert;
export type ReviewLogRow = typeof reviewLog.$inferSelect;
export type NewReviewLogRow = typeof reviewLog.$inferInsert;
export type AiContentRow = typeof aiContent.$inferSelect;
export type NewAiContentRow = typeof aiContent.$inferInsert;
export type FavoriteRow = typeof favorites.$inferSelect;
export type CheckinRow = typeof checkins.$inferSelect;
export type NewCheckinRow = typeof checkins.$inferInsert;
