/**
 * FSRS — Free Spaced Repetition Scheduler wrapper.
 *
 * The plan calls for FSRS (the algorithm Anki adopted in 2023 — see
 * https://github.com/open-spaced-repetition) because it models the
 * memory *stability* + *difficulty* of each card explicitly, which
 * produces noticeably better review timing than the older SM-2
 * approach the rest of the React Native ecosystem uses by default.
 *
 * This module is the only place that talks to `ts-fsrs`. The rest of
 * the app deals in our own vocabulary:
 *
 *   - `WordRating`        = 'forgot' | 'hard' | 'good' | 'easy'
 *   - `WordStatus`        = 'new' | 'learning' | 'review' | 'mastered' | 'excluded'
 *   - `WordState.fsrsState` = { stability, difficulty } (snapshot)
 *
 * Mapping rationale:
 *
 *   WordRating   → FSRS Grade        How the user felt on the back of the card
 *   'forgot'     → Again             Could not recall; lapse is recorded
 *   'hard'       → Hard              Recalled with serious effort
 *   'good'       → Good              Recalled correctly with some effort
 *   'easy'       → Easy              Recalled effortlessly; fast-tracks the card
 *
 *   FSRS State   → WordStatus
 *   New          → 'new'
 *   Learning     → 'learning'
 *   Relearning   → 'learning'        (post-lapse; not a separate bucket yet)
 *   Review       → 'review'
 *   (any with stability ≥ MASTERED_STABILITY_THRESHOLD)
 *                → 'mastered'        (long interval, low review burden)
 *
 *   excluded     → 'excluded'        (only set by the explicit markExcluded path;
 *                                    this wrapper never sets it)
 */
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type IPreview,
  type RecordLogItem,
} from 'ts-fsrs';

import type { FsrsSnapshot, ReviewRatingValue, WordStatusValue } from '@/db/schema';

const MASTERED_STABILITY_DAYS = 180;

const fsrsInstance = fsrs(generatorParameters({ enable_fuzz: true, enable_short_term: true }));

export type { Card };

/**
 * Apply a rating to the current FSRS card and return the new card plus
 * a small projection of the next-due times for the other three ratings
 * (used by the UI to show "if you tap 'good' you'll see this in 3d").
 */
export function rateCard(current: FsrsSnapshot, rating: ReviewRatingValue, now: Date = new Date()) {
  const card: Card = materialiseCard(current, now);
  const grade = wordRatingToGrade(rating);
  const result = fsrsInstance.repeat(card, now);
  const chosen = result[grade];
  return {
    next: chosen.card,
    log: chosen.log,
    preview: previewAll(result),
  };
}

/**
 * Materialise a FsrsSnapshot (the two scalars we persist) into the full
 * ts-fsrs `Card` shape. Defaults: New state, due now, no reviews yet.
 */
export function materialiseCard(snapshot: FsrsSnapshot, now: Date = new Date()): Card {
  // ts-fsrs treats all-zero as "new"; reuse that rather than guessing
  // from our persisted status (we only persist stability/difficulty).
  if (snapshot.stability === 0 && snapshot.difficulty === 0) {
    return createEmptyCard(now);
  }
  return {
    due: now,
    stability: snapshot.stability,
    difficulty: snapshot.difficulty,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: 0,
    lapses: 0,
    state: State.Review,
    last_review: now,
  };
}

export function snapshotFromCard(card: Card): FsrsSnapshot {
  return { stability: card.stability, difficulty: card.difficulty };
}

/** Map our rating → ts-fsrs Grade. */
export function wordRatingToGrade(rating: ReviewRatingValue): Exclude<Rating, Rating.Manual> {
  switch (rating) {
    case 'forgot':
      return Rating.Again;
    case 'hard':
      return Rating.Hard;
    case 'good':
      return Rating.Good;
    case 'easy':
      return Rating.Easy;
  }
}

/** Map ts-fsrs Card state + stability → our word_states.status. */
export function cardToWordStatus(card: Card): WordStatusValue {
  if (card.state === State.New) return 'new';
  if (card.state === State.Learning || card.state === State.Relearning) return 'learning';
  // State.Review — graduate to mastered if the card is "well-known".
  return card.stability >= MASTERED_STABILITY_DAYS ? 'mastered' : 'review';
}

function previewAll(
  result: IPreview,
): Record<ReviewRatingValue, { due: Date; intervalDays: number }> {
  return {
    forgot: project(result[Rating.Again]),
    hard: project(result[Rating.Hard]),
    good: project(result[Rating.Good]),
    easy: project(result[Rating.Easy]),
  };
}

function project(item: RecordLogItem): { due: Date; intervalDays: number } {
  return { due: item.card.due, intervalDays: item.card.scheduled_days };
}

/** Test helper — expose the configured instance. */
export const _internals = { fsrsInstance, MASTERED_STABILITY_DAYS };
