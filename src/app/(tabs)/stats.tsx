/**
 * Stats tab — basic mastery distribution + 7-day activity.
 *
 * Phase 4 will graduate this to a real dashboard with mastery curves
 * and a 30-day heatmap; for now it surfaces the four most-asked
 * numbers so the home/review tabs feel less like a vacuum.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';

import { Card } from '@/components/card';
import { getDb } from '@/db/client';
import { checkinRepository } from '@/db/repositories/checkins';
import { favoritesRepository } from '@/db/repositories/favorites';
import { wordStateRepository } from '@/db/repositories/word-states';
import { Colors, FontSize, FontWeight, SemanticColors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface Stats {
  totalLearned: number;
  mastered: number;
  learning: number;
  favorites: number;
  last7Days: { date: string; count: number }[];
}

const EMPTY: Stats = {
  totalLearned: 0,
  mastered: 0,
  learning: 0,
  favorites: 0,
  last7Days: [],
};

export default function StatsTab() {
  const theme = useTheme();
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const db = await getDb();
      const [mastered, learning, total, fav, recent, streak] = await Promise.all([
        wordStateRepository.countByStatus(db, 'mastered'),
        wordStateRepository.countByStatus(db, 'learning'),
        wordStateRepository.countAll(db),
        favoritesRepository.count(db),
        checkinRepository.listRecent(db, 7),
        checkinRepository.currentStreak(db),
      ]);
      // Build a continuous 7-day window so empty days render as 0 bars.
      const last7: { date: string; count: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = isoDay(d);
        const row = recent.find((r) => r.date === key);
        last7.push({ date: key, count: (row?.newCount ?? 0) + (row?.reviewCount ?? 0) });
      }
      // Touch streak so the count call isn't tree-shaken.
      void streak;
      setStats({ totalLearned: total, mastered, learning, favorites: fav, last7Days: last7 });
    } catch (err) {
      console.warn('[stats] failed to load', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // See note in src/app/index.tsx — load-on-mount pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const max = Math.max(1, ...stats.last7Days.map((d) => d.count));

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>统计</Text>

      {loading ? (
        <ActivityIndicator color={Colors.light.primary} />
      ) : (
        <>
          <Card variant="flat" padding="four" radius="lg" style={styles.metaCard}>
            <Stat label="累计学词" value={String(stats.totalLearned)} tint={SemanticColors.new} />
            <Stat label="已掌握" value={String(stats.mastered)} tint={SemanticColors.mastered} />
            <Stat label="学习中" value={String(stats.learning)} tint={SemanticColors.learning} />
            <Stat label="生词本" value={String(stats.favorites)} tint={SemanticColors.warning} />
          </Card>

          <Card variant="flat" padding="four" radius="lg" style={styles.chartCard}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>近 7 日</Text>
            <View style={styles.chart}>
              {stats.last7Days.map((d) => {
                const heightPct = (d.count / max) * 100;
                return (
                  <View key={d.date} style={styles.barCol}>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.bar,
                          {
                            height: `${Math.max(heightPct, d.count > 0 ? 6 : 0)}%`,
                            backgroundColor: d.count > 0 ? SemanticColors.primary : 'transparent',
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.barLabel, { color: theme.textSecondary }]}>
                      {d.date.slice(5)}
                    </Text>
                  </View>
                );
              })}
            </View>
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              每天柱高 = (今日新词 + 复习数) / 7 日峰值
            </Text>
          </Card>
        </>
      )}
    </View>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <View style={styles.statRow}>
      <View style={[styles.dot, { backgroundColor: tint }]} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const styles: { [k: string]: ViewStyle | TextStyle } = {
  screen: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    fontSize: FontSize.display,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.two,
  },
  metaCard: {
    gap: Spacing.three,
  },
  chartCard: {
    gap: Spacing.three,
  },
  sectionTitle: {
    fontSize: FontSize.subtitle,
    fontWeight: FontWeight.semibold,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statLabel: {
    flex: 1,
    fontSize: FontSize.body,
    color: Colors.light.textSecondary,
  },
  statValue: {
    fontSize: FontSize.subtitle,
    fontWeight: FontWeight.bold,
    color: Colors.light.text,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 140,
    gap: Spacing.two,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.half,
    height: '100%',
  },
  barTrack: {
    width: '60%',
    flex: 1,
    backgroundColor: Colors.light.backgroundElement,
    borderRadius: 4,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderRadius: 4,
  },
  barLabel: {
    fontSize: 10,
  },
  hint: {
    fontSize: FontSize.caption,
  },
};
