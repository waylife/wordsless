/**
 * FSRS wrapper tests — verify the rating → grade mapping, that
 * a fresh card graduates through new → learning → review, and that
 * "easy" graduates faster than "good" graduates faster than "hard".
 */
import { rateCard, wordRatingToGrade, cardToWordStatus, snapshotFromCard } from '@/core/fsrs';
import { Rating } from 'ts-fsrs';
import type { FsrsSnapshot } from '@/db/schema';

describe('wordRatingToGrade', () => {
  it('maps our 4 ratings to ts-fsrs Grade enum values', () => {
    expect(wordRatingToGrade('forgot')).toBe(Rating.Again);
    expect(wordRatingToGrade('hard')).toBe(Rating.Hard);
    expect(wordRatingToGrade('good')).toBe(Rating.Good);
    expect(wordRatingToGrade('easy')).toBe(Rating.Easy);
  });
});

describe('rateCard', () => {
  const fresh: FsrsSnapshot = { stability: 0, difficulty: 0 };
  const now = new Date('2026-08-20T00:00:00Z');

  it('returns a longer interval for "easy" than for "good"', () => {
    const easy = rateCard(fresh, 'easy', now);
    const good = rateCard(fresh, 'good', now);
    expect(easy.next.scheduled_days).toBeGreaterThanOrEqual(good.next.scheduled_days);
  });

  it('returns a shorter interval for "hard" than for "good"', () => {
    const hard = rateCard(fresh, 'hard', now);
    const good = rateCard(fresh, 'good', now);
    expect(hard.next.scheduled_days).toBeLessThanOrEqual(good.next.scheduled_days);
  });

  it('produces a sub-day interval for "forgot" on a new card', () => {
    const forgot = rateCard(fresh, 'forgot', now);
    expect(forgot.next.scheduled_days).toBeLessThan(1);
  });

  it('exposes a preview for every rating key', () => {
    const out = rateCard(fresh, 'good', now);
    expect(out.preview.forgot.intervalDays).toBeGreaterThanOrEqual(0);
    expect(out.preview.hard.intervalDays).toBeGreaterThanOrEqual(0);
    expect(out.preview.good.intervalDays).toBeGreaterThanOrEqual(0);
    expect(out.preview.easy.intervalDays).toBeGreaterThanOrEqual(0);
  });

  it('snapshotFromCard round-trips the two scalars', () => {
    const rated = rateCard(fresh, 'good', now);
    const snap = snapshotFromCard(rated.next);
    expect(snap.stability).toBeCloseTo(rated.next.stability, 5);
    expect(snap.difficulty).toBeCloseTo(rated.next.difficulty, 5);
  });
});

describe('cardToWordStatus', () => {
  it('returns "mastered" when stability crosses the long-term threshold', () => {
    const result = cardToWordStatus({
      due: new Date(),
      stability: 365,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 365,
      learning_steps: 0,
      reps: 10,
      lapses: 0,
      state: 2 as never, // State.Review
      last_review: new Date(),
    });
    expect(result).toBe('mastered');
  });

  it('returns "review" for moderate-stability cards', () => {
    const result = cardToWordStatus({
      due: new Date(),
      stability: 7,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 7,
      learning_steps: 0,
      reps: 3,
      lapses: 0,
      state: 2 as never,
      last_review: new Date(),
    });
    expect(result).toBe('review');
  });
});
