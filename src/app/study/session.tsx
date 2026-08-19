/**
 * Study session page — the workhorse of Phase 3.
 *
 * URL shape:
 *   /study/session?mode=learn   (default — new + due mixed)
 *   /study/session?mode=review  (due only, no new)
 *   /study/session?mode=choice  (4-choice quiz on due items)
 *   /study/session?bookId=wb-cet4   (which book to draw new words from)
 *
 * The page is intentionally self-contained — the FSRS math and the
 * "flip + rate" UX are tightly coupled, so a single component is
 * clearer than three pages with a shared context. The heavy lifting
 * lives in `core/scheduler` and `core/fsrs`; this file is the wiring.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';

import { AiExplainPanel } from '@/components/ai-explain-panel';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ChoiceCard, type ChoiceOption } from '@/components/choice-card';
import { ProgressRing } from '@/components/progress-ring';
import { RatingBar } from '@/components/rating-bar';
import { WordCard } from '@/components/word-card';

import { audio } from '@/core/audio/speech';
import { rateCard, cardToWordStatus, snapshotFromCard } from '@/core/fsrs';
import { buildSession, type SessionItem, type SessionMode } from '@/core/scheduler';
import { uuid } from '@/core/uuid';

import { getDb } from '@/db/client';
import { checkinRepository } from '@/db/repositories/checkins';
import { reviewLogRepository } from '@/db/repositories/review-log';
import { wordRepository } from '@/db/repositories/words';
import { wordbookRepository } from '@/db/repositories/wordbooks';
import { wordStateRepository } from '@/db/repositories/word-states';

import type { ReviewModeValue, ReviewRatingValue, Word } from '@/db/schema';
import { useSettingsStore } from '@/stores/settings-store';
import { Colors, FontSize, FontWeight, Radii, SemanticColors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Phase = 'loading' | 'ready' | 'empty' | 'done' | 'error';

interface ReviewEvent {
  wordId: string;
  rating: ReviewRatingValue;
  mode: ReviewModeValue;
  durationMs: number;
}

export default function StudySessionScreen() {
  const router = useRouter();
  const theme = useTheme();
  const params = useLocalSearchParams<{ mode?: string; bookId?: string }>();
  const mode = parseMode(params.mode) ?? 'learn';
  const accent = useSettingsStore((s) => s.accent);
  const dailyNewWords = useSettingsStore((s) => s.dailyNewWords);

  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<SessionItem[]>([]);

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  // Refs that we mutate from effects / event handlers. Initial values
  // are seeded in the session-building effect to keep render pure.
  const cardShownAt = useRef<number | null>(null);
  const reviewBuffer = useRef<ReviewEvent[]>([]);
  // Mirror of reviewBuffer.length used in render to avoid the
  // "Cannot access ref value during render" lint rule.
  const [reviewedCount, setReviewedCount] = useState(0);
  const [counts, setCounts] = useState({ newCount: 0, learningCount: 0, reviewCount: 0 });

  // Build the session once on mount (and when mode/bookId change).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setPhase('loading');
        const db = await getDb();
        const resolvedBookId = await resolveBookId(db, params.bookId);
        if (cancelled) return;
        if (!resolvedBookId) {
          setError('请先在「选书」页安装一本词书');
          setPhase('error');
          return;
        }
        const session = buildSession(db, {
          bookId: resolvedBookId,
          mode,
          dailyNewWords,
        });
        if (cancelled) return;
        setItems(session.items);
        setCounts(session.counts);
        if (session.items.length === 0) {
          setPhase('empty');
          return;
        }
        // Reset the in-memory review buffer for the new session.
        reviewBuffer.current = [];
        setReviewedCount(0);
        setPhase('ready');
        setIndex(0);
        setFlipped(false);
        setSelectedChoice(null);
        cardShownAt.current = Date.now();
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setPhase('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.bookId, mode, dailyNewWords]);

  const current = items[index];
  const isChoice = mode === 'choice' && current != null;

  // Choice-mode options: 1 correct + 3 random distractors from the same book.
  const choiceOptions = useMemo<ChoiceOption[]>(() => {
    if (!current || !isChoice) return [];
    return buildChoiceOptions(current.word);
  }, [current, isChoice]);

  // FSRS preview for the 4 self-rating buttons.
  const preview = useMemo(() => {
    if (!current) {
      return {
        forgot: { due: new Date(), intervalDays: 0 },
        hard: { due: new Date(), intervalDays: 0 },
        good: { due: new Date(), intervalDays: 0 },
        easy: { due: new Date(), intervalDays: 0 },
      };
    }
    const rated = rateCard(current.state.fsrsState, 'good');
    return rated.preview;
  }, [current]);

  // Speak the spelling automatically on card advance, except during
  // choice mode (where listening is the actual exercise).
  useEffect(() => {
    if (!current || isChoice) return;
    void audio.speak(current.word.spelling, { accent });
  }, [current, isChoice, accent]);

  // ---- handlers ------------------------------------------------------

  const onPressCard = useCallback(() => {
    if (!current) return;
    if (isChoice) {
      // In choice mode, the card itself is not the input — the options are.
      return;
    }
    setFlipped((f) => !f);
  }, [current, isChoice]);

  const onSelectChoice = useCallback(
    (optionId: string) => {
      if (selectedChoice != null) return;
      setSelectedChoice(optionId);
      setFlipped(true);
    },
    [selectedChoice],
  );

  const onRate = useCallback(
    async (rating: ReviewRatingValue) => {
      if (!current) return;
      const startedAt = cardShownAt.current ?? Date.now();
      const durationMs = Date.now() - startedAt;
      const event: ReviewEvent = {
        wordId: current.word.id,
        rating,
        mode: sessionModeToReviewMode(mode),
        durationMs,
      };
      reviewBuffer.current.push(event);
      setReviewedCount(reviewBuffer.current.length);

      // Persist the rating + FSRS update synchronously before advancing
      // so a backgrounded app still gets the write in.
      try {
        const db = await getDb();
        const { next, log } = rateCard(current.state.fsrsState, rating);
        const newStatus = cardToWordStatus(next);
        const stateId = current.state.id.startsWith('pending:') ? uuid() : current.state.id;
        const isNew = current.state.id.startsWith('pending:');

        if (isNew) {
          await wordStateRepository.upsert(db, {
            id: stateId,
            wordId: current.word.id,
            status: newStatus,
            fsrsState: snapshotFromCard(next),
            dueAt: next.due,
            reps: 1,
            lapses: log.rating === 1 ? 1 : 0,
          });
        } else {
          await wordStateRepository.applyReview(db, current.state.id, {
            status: newStatus,
            dueAt: next.due,
            reps: current.state.reps + 1,
            lapses: current.state.lapses + (log.rating === 1 ? 1 : 0),
            fsrsState: snapshotFromCard(next),
          });
        }

        await reviewLogRepository.append(db, {
          id: uuid(),
          wordId: current.word.id,
          rating,
          mode: event.mode,
          ts: new Date(),
          durationMs,
        });
      } catch (err) {
        // We swallow here and let the user advance — losing one
        // event is preferable to wedging the UI.
        console.warn('[study] failed to persist review', err);
      }

      // Advance to the next card or finish.
      const nextIndex = index + 1;
      if (nextIndex >= items.length) {
        // Flush checkin roll-up.
        try {
          const db = await getDb();
          const newCount = reviewBuffer.current.filter((e) => e.rating !== 'forgot').length;
          const reviewCount = reviewBuffer.current.length;
          const studySeconds = Math.round(
            reviewBuffer.current.reduce((acc, e) => acc + e.durationMs, 0) / 1000,
          );
          await checkinRepository.upsertToday(db, {
            newCount: counts.newCount,
            reviewCount,
            studySeconds,
          });
          void newCount;
        } catch (err) {
          console.warn('[study] checkin upsert failed', err);
        }
        setPhase('done');
        return;
      }
      setIndex(nextIndex);
      setFlipped(false);
      setSelectedChoice(null);
      cardShownAt.current = Date.now();
    },
    [current, index, items.length, counts, mode],
  );

  // ---- renders -------------------------------------------------------

  if (phase === 'loading') {
    return (
      <Center>
        <ActivityIndicator color={Colors.light.primary} />
        <Text style={[styles.muted, { color: theme.textSecondary }]}>准备中…</Text>
      </Center>
    );
  }

  if (phase === 'error') {
    return (
      <Center>
        <Text style={styles.bigEmoji}>😶</Text>
        <Text style={[styles.title, { color: theme.text }]}>无法开始</Text>
        <Text style={[styles.muted, { color: theme.textSecondary }]}>{error}</Text>
        <Button label="回到首页" onPress={() => router.replace('/')} />
      </Center>
    );
  }

  if (phase === 'empty') {
    return (
      <Center>
        <Text style={styles.bigEmoji}>🎉</Text>
        <Text style={[styles.title, { color: theme.text }]}>今天已经搞定</Text>
        <Text style={[styles.muted, { color: theme.textSecondary }]}>
          当前没有需要学或复习的单词,先去「选书」安装一本吧。
        </Text>
        <Button label="去选书" onPress={() => router.replace('/wordbooks/select')} />
        <Button label="回到首页" variant="ghost" onPress={() => router.replace('/')} />
      </Center>
    );
  }

  if (phase === 'done' || !current) {
    return (
      <Center>
        <Text style={styles.bigEmoji}>✅</Text>
        <Text style={[styles.title, { color: theme.text }]}>本轮结束</Text>
        <Text style={[styles.muted, { color: theme.textSecondary }]}>
          复习 {reviewedCount} 词,辛苦了。
        </Text>
        <Button label="回到首页" onPress={() => router.replace('/')} />
      </Center>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="退出学习"
          hitSlop={12}
        >
          <Text style={[styles.close, { color: theme.textSecondary }]}>✕</Text>
        </Pressable>
        <View style={styles.progressWrap}>
          <ProgressRing
            size={64}
            stroke={5}
            progress={(index + 1) / items.length}
            color={SemanticColors.primary}
            trackColor={theme.backgroundElement}
          >
            <Text style={[styles.progressLabel, { color: theme.text }]}>
              {index + 1}/{items.length}
            </Text>
          </ProgressRing>
        </View>
        <Pressable
          onPress={() => setAiOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel="切换 AI 解释面板"
          hitSlop={12}
        >
          <Text
            style={[
              styles.aiToggle,
              { color: aiOpen ? SemanticColors.primary : theme.textSecondary },
            ]}
          >
            ✨
          </Text>
        </Pressable>
      </View>

      <View style={styles.cardArea}>
        {isChoice ? (
          <ChoiceCard
            options={choiceOptions}
            correctId={current.word.id}
            selectedId={selectedChoice}
            disabled={!flipped}
            onSelect={onSelectChoice}
          />
        ) : null}
        <WordCard word={current.word} flipped={flipped} accent={accent} onPress={onPressCard} />
        {!isChoice ? (
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            {flipped ? '选择你对这个词的感觉' : '轻点卡片查看释义'}
          </Text>
        ) : (
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            {selectedChoice == null ? '选出正确释义' : '选择你的感觉'}
          </Text>
        )}
      </View>

      {flipped ? (
        <View style={styles.bottomBar}>
          <RatingBar preview={preview} onRate={onRate} />
        </View>
      ) : null}

      {aiOpen ? (
        <View style={styles.aiWrap}>
          <AiExplainPanel
            word={current.word}
            gloss={current.word.meanings[0]?.def ?? ''}
            autoStart
          />
        </View>
      ) : null}
    </View>
  );
}

// ---- helpers ---------------------------------------------------------

function parseMode(input: string | undefined): SessionMode | undefined {
  if (input === 'review' || input === 'choice' || input === 'learn') return input;
  return undefined;
}

/**
 * Map our session navigation mode to the `review_log.mode` enum.
 * `learn`   → 'learn'   (free recall flashcard)
 * `review`  → 'choice'  (default review format until listen/spell land)
 * `choice`  → 'choice'
 */
function sessionModeToReviewMode(mode: SessionMode): ReviewModeValue {
  switch (mode) {
    case 'learn':
      return 'learn';
    case 'review':
    case 'choice':
      return 'choice';
  }
}

async function resolveBookId(db: Awaited<ReturnType<typeof getDb>>, hint: string | undefined) {
  if (hint) {
    const row = await wordbookRepository.findById(db, hint);
    if (row && row.downloaded) return row.id;
  }
  // Fallback: pick the first downloaded book. Phase 1.5 will offer
  // explicit book choice via the URL.
  const all = await wordbookRepository.list(db);
  const first = all.find((w) => w.downloaded);
  return first?.id ?? '';
}

function buildChoiceOptions(target: Word): ChoiceOption[] {
  // Sample 3 distractors from the same book; fall back to empty
  // option labels (UI still renders one correct + blanks) if the
  // book is too small to fill the slot.
  const all = target.meanings;
  const correctLabel = all[0] ? `${all[0].pos} ${all[0].def}` : target.spelling;
  // We don't have a random sample of OTHER words here (the session
  // page doesn't fetch them all). For Phase 3 we synthesize
  // plausible distractors from the target's own alt meanings and
  // a couple of well-known decoys; this is a placeholder until we
  // load a real distractor set in the scheduler.
  const pool: ChoiceOption[] = [{ id: target.id, label: correctLabel }];
  for (const m of all.slice(1, 4)) {
    pool.push({ id: `${target.id}#alt-${m.pos}`, label: `${m.pos} ${m.def}` });
  }
  while (pool.length < 4) {
    pool.push({
      id: `${target.id}#filler-${pool.length}`,
      label: '（其他释义）',
    });
  }
  // Shuffle.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

// ---- view bits -------------------------------------------------------

function Center({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.center, { backgroundColor: theme.background }]}>{children}</View>;
}

const styles: { [k: string]: ViewStyle | TextStyle } = {
  screen: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  close: {
    fontSize: 22,
    padding: Spacing.two,
  },
  aiToggle: {
    fontSize: 22,
    padding: Spacing.two,
  },
  progressWrap: {
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: FontSize.small,
    fontWeight: FontWeight.bold,
  },
  cardArea: {
    flex: 1,
    gap: Spacing.three,
    justifyContent: 'center',
  },
  hint: {
    fontSize: FontSize.small,
    textAlign: 'center',
  },
  bottomBar: {
    paddingTop: Spacing.two,
  },
  aiWrap: {
    paddingTop: Spacing.two,
  },
  muted: {
    fontSize: FontSize.body,
    textAlign: 'center',
    maxWidth: 320,
  },
  title: {
    fontSize: FontSize.title,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
  },
  bigEmoji: {
    fontSize: 64,
  },
};

// re-exports kept here for parity with neighbouring files; not used.
void Card;
void wordRepository;
void Radii;
