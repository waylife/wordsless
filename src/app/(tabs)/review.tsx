/**
 * Review tab — surfaces only the FSRS-due cards. Same shape as the
 * learn session but no new words are introduced; if nothing is due we
 * show an "all done" placeholder.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { getDb } from '@/db/client';
import { buildSession } from '@/core/scheduler';
import { wordbookRepository } from '@/db/repositories/wordbooks';
import { useSettingsStore } from '@/stores/settings-store';
import { Colors, FontSize, FontWeight, SemanticColors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function ReviewTab() {
  const router = useRouter();
  const theme = useTheme();
  const dailyNewWords = useSettingsStore((s) => s.dailyNewWords);
  const [dueCount, setDueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasBook, setHasBook] = useState(false);

  const reload = useCallback(async () => {
    try {
      const db = await getDb();
      const books = await wordbookRepository.list(db);
      const installed = books.find((b) => b.downloaded);
      setHasBook(Boolean(installed));
      if (!installed) {
        setDueCount(0);
        return;
      }
      const session = buildSession(db, {
        bookId: installed.id,
        mode: 'review',
        dailyNewWords,
      });
      setDueCount(session.counts.learningCount + session.counts.reviewCount);
    } catch (err) {
      console.warn('[review] failed to load', err);
    } finally {
      setLoading(false);
    }
  }, [dailyNewWords]);

  useEffect(() => {
    // See note in src/app/index.tsx — load-on-mount is the right
    // pattern here; the lint flag is for cascades, not this case.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: theme.text }]}>复习</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          算法已经替你挑好了今天最该回顾的词。
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.light.primary} />
      ) : !hasBook ? (
        <Card variant="flat" padding="four" radius="lg" style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>还没选词书</Text>
          <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
            先去「选书」页安装一本。
          </Text>
          <Button label="去选书" onPress={() => router.push('/wordbooks/select')} />
        </Card>
      ) : dueCount === 0 ? (
        <Card variant="flat" padding="four" radius="lg" style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>🎉 今天都搞定了</Text>
          <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
            算法没找到需要复习的单词,明天再来。
          </Text>
          <Button
            label="随便学几个新词"
            variant="secondary"
            onPress={() => router.push('/study/session?mode=learn')}
          />
        </Card>
      ) : (
        <Card variant="flat" padding="four" radius="lg" style={styles.summary}>
          <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>到期待复习</Text>
          <Text style={[styles.summaryValue, { color: SemanticColors.primary }]}>{dueCount}</Text>
          <Button
            label="开始复习"
            size="lg"
            fullWidth
            onPress={() => router.push('/study/session?mode=review')}
          />
        </Card>
      )}
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
  summary: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  summaryLabel: {
    fontSize: FontSize.body,
  },
  summaryValue: {
    fontSize: 64,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.two,
  },
  empty: {
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
