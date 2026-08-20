/**
 * Home (今日) tab — the daily landing surface. Shows real counts pulled
 * from the local DB and routes the user into the study session.
 *
 *   - "今日新词"  = how many new words are queued (driven by the
 *                   settings' daily new-word quota)
 *   - "待复习"    = due review + learning cards
 *   - "连续天数"  = current checkin streak
 *   - "已掌握"    = total words in `mastered` status
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { getDb } from '@/db/client';
import { getHomeCounts, type HomeCounts } from '@/core/scheduler';
import { buildSession } from '@/core/scheduler';
import { wordbookRepository } from '@/db/repositories/wordbooks';
import { useSettingsStore } from '@/stores/settings-store';
import { Colors, FontSize, FontWeight, SemanticColors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const DEFAULT_COUNTS: HomeCounts = {
  newCount: 0,
  dueCount: 0,
  learningCount: 0,
  masteredCount: 0,
  totalCount: 0,
  streakDays: 0,
};

export default function HomeTab() {
  const router = useRouter();
  const theme = useTheme();
  const dailyNewWords = useSettingsStore((s) => s.dailyNewWords);
  const [counts, setCounts] = useState<HomeCounts>(DEFAULT_COUNTS);
  const [loading, setLoading] = useState(true);
  const [hasBook, setHasBook] = useState(false);

  const reload = useCallback(async () => {
    try {
      const db = await getDb();
      const c = await getHomeCounts(db);
      setCounts(c);
      const books = await wordbookRepository.list(db);
      setHasBook(books.some((b) => b.downloaded));
    } catch (err) {
      console.warn('[home] failed to load counts', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Trigger the initial load. This is the canonical "load on mount"
    // pattern; the React-Compiler-era lint flags it because reload()
    // calls setState, but the alternative (SWR / React Query) is
    // overkill for a one-shot SQLite read.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  // Re-read counts when the user navigates back from the session.
  useEffect(() => {
    const sub = router as unknown as { _reset?: () => void };
    void sub;
    // expo-router doesn't expose a generic "did focus" event in v5; we
    // rely on the reload-after-action pattern in the session page. Keep
    // this effect for future focus-listener integration.
  }, [router]);

  const startLearn = useCallback(async () => {
    const db = await getDb();
    const books = await wordbookRepository.list(db);
    const first = books.find((b) => b.downloaded);
    if (!first) {
      router.push('/wordbooks/select');
      return;
    }
    const session = buildSession(db, {
      bookId: first.id,
      mode: 'learn',
      dailyNewWords,
    });
    if (session.items.length === 0) {
      router.push('/study/session?mode=learn');
      return;
    }
    router.push(`/study/session?mode=learn&bookId=${first.id}`);
  }, [router, dailyNewWords]);

  const startReview = useCallback(async () => {
    router.push('/study/session?mode=review');
  }, [router]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: theme.text }]}>今日</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>每天 30 词,稳扎稳打。</Text>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.light.primary} />
        </View>
      ) : !hasBook ? (
        <Card variant="flat" padding="four" radius="lg" style={styles.emptyCard}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>还没选词书</Text>
          <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
            先去「选书」页安装一本,再回来开始学习。
          </Text>
          <Button label="去选书" onPress={() => router.push('/wordbooks/select')} />
        </Card>
      ) : (
        <Card variant="flat" padding="four" radius="lg" style={styles.metaCard}>
          <MetaRow label="今日新词" value={String(counts.newCount)} tint={SemanticColors.new} />
          <MetaRow label="待复习" value={String(counts.dueCount)} tint={SemanticColors.review} />
          <MetaRow
            label="已掌握"
            value={String(counts.masteredCount)}
            tint={SemanticColors.mastered}
          />
          <MetaRow
            label="连续天数"
            value={String(counts.streakDays)}
            tint={SemanticColors.warning}
          />
        </Card>
      )}

      {hasBook ? (
        <View style={styles.actions}>
          <Button label="开始今日学习" size="lg" fullWidth onPress={() => void startLearn()} />
          <Button
            label="听音辨词"
            variant="secondary"
            size="lg"
            fullWidth
            leftIcon={<Text>🎧</Text>}
            onPress={() => router.push('/study/session?mode=listen')}
          />
          <Button
            label={`进入复习队列 (${counts.dueCount})`}
            variant="secondary"
            size="lg"
            fullWidth
            onPress={() => void startReview()}
            disabled={counts.dueCount === 0}
          />
        </View>
      ) : null}
    </View>
  );
}

function MetaRow({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <View style={styles.metaRow}>
      <View style={[styles.dot, { backgroundColor: tint }]} />
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const styles: { [k: string]: ViewStyle | TextStyle } = {
  screen: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    paddingBottom: Spacing.four,
    gap: Spacing.five,
  },
  hero: {
    gap: Spacing.two,
  },
  title: {
    fontSize: FontSize.display,
    fontWeight: FontWeight.bold,
  },
  subtitle: {
    fontSize: FontSize.body,
  },
  loading: {
    paddingVertical: Spacing.five,
    alignItems: 'center',
  },
  metaCard: {
    gap: Spacing.three,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  metaLabel: {
    flex: 1,
    fontSize: FontSize.body,
    color: Colors.light.textSecondary,
  },
  metaValue: {
    fontSize: FontSize.subtitle,
    fontWeight: FontWeight.bold,
    color: Colors.light.text,
  },
  actions: {
    gap: Spacing.two,
    marginTop: 'auto',
  } as ViewStyle,
  emptyCard: {
    gap: Spacing.three,
    alignItems: 'flex-start',
  },
  emptyTitle: {
    fontSize: FontSize.subtitle,
    fontWeight: FontWeight.semibold,
  },
  emptySub: {
    fontSize: FontSize.body,
  },
};
