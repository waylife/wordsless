/**
 * Scheduler — picks the cards the user will see in a study/review
 * session and tracks the daily quota.
 *
 * The daily session is a flat list of cards. We mix:
 *   - `new`        — words the user has never seen, drawn from a chosen book
 *   - `learning`   — words stuck in the learning/relearning phase
 *   - `review`     — words whose `due_at` has passed
 *
 * Cap policy:
 *   - Up to `dailyNewWords` new words.
 *   - All currently-due review cards.
 *   - Total is capped at `maxCards` (defaults to 4× quota) as a safety
 *     net against an overdue backlog from a long absence.
 *
 * The actual interleaving is the job of the session page — we just
 * return a typed, ordered list.
 */
import { and, asc, count, eq, lte, or } from 'drizzle-orm';

import type { Db } from '@/db/client';
import { type Word, type WordState, words, wordStates } from '@/db/schema';
import { checkinRepository } from '@/db/repositories/checkins';
import { wordStateRepository } from '@/db/repositories/word-states';

export type SessionMode = 'learn' | 'review' | 'choice';

export interface SessionItem {
  state: WordState;
  word: Word;
}

export interface BuildSessionInput {
  bookId: string;
  mode: SessionMode;
  /** How many new words to introduce. Used in 'learn' and 'choice' modes. */
  dailyNewWords: number;
  /** Hard upper bound on the session length. Defaults to 4× quota. */
  maxCards?: number;
  now?: Date;
}

export interface BuildSessionResult {
  items: SessionItem[];
  counts: {
    newCount: number;
    learningCount: number;
    reviewCount: number;
  };
}

/**
 * Build today's session.
 *
 *   learn   — new + learning + due (mixed), capped by new-word quota + max
 *   review  — due + learning only (no new words)
 *   choice  — alias for `learn` today; reserved for a future split where
 *             choice-mode uses a different set of cards
 */
export function buildSession(db: Db, input: BuildSessionInput): BuildSessionResult {
  const now = input.now ?? new Date();
  const max = input.maxCards ?? Math.max(input.dailyNewWords * 4, 50);
  const newBudget = input.mode === 'review' ? 0 : input.dailyNewWords;

  const newRows = fetchNewWords(db, input.bookId, newBudget);
  const newIds = new Set(newRows.map((r) => r.state.wordId));

  const dueRows = fetchDueWords(db, now, max);
  const filteredDue = dueRows.filter((r) => !newIds.has(r.state.wordId));

  const items: SessionItem[] = [...newRows, ...filteredDue].slice(0, max);

  const counts = {
    newCount: newRows.length,
    learningCount: items.filter((i) => i.state.status === 'learning').length,
    reviewCount: filteredDue.length,
  };
  return { items, counts };
}

/** What shows on the home tab — no book filter. */
export interface HomeCounts {
  newCount: number;
  dueCount: number;
  learningCount: number;
  masteredCount: number;
  totalCount: number;
  streakDays: number;
}

export async function getHomeCounts(db: Db, now: Date = new Date()): Promise<HomeCounts> {
  const [due, learning, mastered, total, streak] = await Promise.all([
    countByStatus(db, 'review', now),
    countByStatus(db, 'learning', now),
    countByStatus(db, 'mastered', null),
    wordStateRepository.countAll(db),
    checkinRepository.currentStreak(db),
  ]);

  return {
    newCount: 0, // We don't know newCount without picking a book; the home shows a hint instead.
    dueCount: due + learning,
    learningCount: learning,
    masteredCount: mastered,
    totalCount: total,
    streakDays: streak,
  };
}

function countByStatus(
  db: Db,
  status: 'review' | 'learning' | 'mastered',
  now: Date | null,
): number {
  if (status === 'mastered') {
    const row = db
      .select({ value: count() })
      .from(wordStates)
      .where(eq(wordStates.status, 'mastered'))
      .get();
    return row?.value ?? 0;
  }
  const cond =
    now == null
      ? eq(wordStates.status, status)
      : and(eq(wordStates.status, status), lte(wordStates.dueAt, now));
  const row = db.select({ value: count() }).from(wordStates).where(cond).get();
  return row?.value ?? 0;
}

// ---- internals --------------------------------------------------------

function fetchNewWords(db: Db, bookId: string, limit: number): SessionItem[] {
  if (limit === 0) return [];
  // Pull (word, word_state) pairs for the book, then filter to "new"
  // client-side. We over-fetch because the join returns one row per
  // word, not per state.
  const rows = db
    .select({ state: wordStates, word: words })
    .from(words)
    .leftJoin(wordStates, eq(wordStates.wordId, words.id))
    .where(eq(words.bookId, bookId))
    .orderBy(asc(words.spelling))
    .limit(Math.max(limit * 4, 50))
    .all();

  const fresh: SessionItem[] = [];
  for (const r of rows) {
    if (r.state && r.state.status !== 'new') continue;
    if (!r.state) {
      // Word exists but the user has never seen it — fabricate a
      // transient WordState so the session page can use one shape.
      fresh.push({
        state: {
          id: `pending:${r.word.id}`,
          wordId: r.word.id,
          status: 'new',
          fsrsState: { stability: 0, difficulty: 0 },
          dueAt: now(),
          reps: 0,
          lapses: 0,
          createdAt: now(),
          updatedAt: now(),
        },
        word: r.word,
      });
    } else {
      fresh.push({ state: r.state, word: r.word });
    }
    if (fresh.length >= limit) break;
  }
  return fresh;
}

function fetchDueWords(db: Db, at: Date, limit: number): SessionItem[] {
  if (limit === 0) return [];
  const rows = db
    .select({ state: wordStates, word: words })
    .from(wordStates)
    .innerJoin(words, eq(words.id, wordStates.wordId))
    .where(
      and(
        lte(wordStates.dueAt, at),
        or(eq(wordStates.status, 'review'), eq(wordStates.status, 'learning')),
      ),
    )
    .orderBy(asc(wordStates.dueAt))
    .limit(limit)
    .all();
  return rows.map((r) => ({ state: r.state, word: r.word }));
}

function now(): Date {
  return new Date();
}
