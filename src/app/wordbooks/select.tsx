/**
 * Picker screen — lists the six known wordbooks and lets the user
 * install the bundled CET-4 sample. Other books render with a
 * "待添加" badge until their compiled JSON ships in Phase 1.5.
 *
 * Phase 1.4 deliverable: connect the repo to the UI, prove the
 * `选书 → 导入 → 词表浏览` loop end-to-end.
 */
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { ListRenderItem } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { TabPlaceholder } from '@/components/tab-placeholder';
import { WORDBOOK_CATALOG, daysAtRate, type WordbookCatalogEntry } from '@/db/catalog';
import { getDb } from '@/db/client';
import { wordbookRepository } from '@/db/repositories/wordbooks';
import { seedWordbook } from '@/db/seed';
import type { Wordbook } from '@/db/schema';
import { useAsyncResource } from '@/hooks/use-async-resource';
import { Colors, FontSize, FontWeight, SemanticColors, Spacing } from '@/constants/theme';
import { cet4Wordbook } from '@/data/wordbooks/cet4';

const DEFAULT_DAILY_RATE = 30;

function BookRow({
  entry,
  installed,
  onPressInstall,
  onPressOpen,
}: {
  entry: WordbookCatalogEntry;
  installed: boolean;
  onPressInstall: (code: string) => void;
  onPressOpen: (code: string) => void;
}) {
  const days = daysAtRate(entry.approxWordCount, DEFAULT_DAILY_RATE);
  return (
    <Card variant={installed ? 'flat' : 'outlined'} padding="four" radius="lg" style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{entry.name}</Text>
        {installed ? (
          <View style={[styles.badge, styles.badgeInstalled]}>
            <Text style={styles.badgeText}>已安装</Text>
          </View>
        ) : entry.bundled ? (
          <View style={[styles.badge, styles.badgeReady]}>
            <Text style={styles.badgeText}>可安装</Text>
          </View>
        ) : (
          <View style={[styles.badge, styles.badgePending]}>
            <Text style={styles.badgeText}>待添加</Text>
          </View>
        )}
      </View>
      <Text style={styles.blurb}>{entry.blurb}</Text>
      <Text style={styles.meta}>
        约 {entry.approxWordCount.toLocaleString()} 词 · 每天 30 词 ≈ {days} 天
      </Text>
      <View style={styles.actions}>
        {installed ? (
          <Button
            label="打开词表"
            variant="primary"
            size="md"
            onPress={() => onPressOpen(entry.code)}
          />
        ) : entry.bundled ? (
          <Button
            label="下载到本地"
            variant="primary"
            size="md"
            onPress={() => onPressInstall(entry.code)}
          />
        ) : (
          <Button
            label="敬请期待"
            variant="secondary"
            size="md"
            disabled
            onPress={() => undefined}
          />
        )}
      </View>
    </Card>
  );
}

export default function WordbookSelectScreen() {
  const router = useRouter();
  const resource = useAsyncResource<Wordbook[]>(async (db) => wordbookRepository.list(db));

  const installCet4 = useCallback(async () => {
    const db = await getDb();
    const result = await seedWordbook(db, cet4Wordbook);
    resource.reload();
    if (!result.alreadyInstalled) {
      router.push(`/wordbooks/${result.code}`);
    }
  }, [resource, router]);

  const handleInstall = useCallback(
    (code: string) => {
      if (code === 'cet4') {
        void installCet4();
      }
    },
    [installCet4],
  );

  const handleOpen = useCallback(
    (code: string) => {
      router.push(`/wordbooks/${code}`);
    },
    [router],
  );

  const renderItem: ListRenderItem<WordbookCatalogEntry> = useCallback(
    ({ item }) => (
      <BookRow
        entry={item}
        installed={(resource.data ?? []).some((w) => w.code === item.code && w.downloaded)}
        onPressInstall={handleInstall}
        onPressOpen={handleOpen}
      />
    ),
    [resource.data, handleInstall, handleOpen],
  );

  if (resource.loading && !resource.data) {
    return <TabPlaceholder emoji="📚" title="选书" description="加载中…" />;
  }
  if (resource.error) {
    return (
      <TabPlaceholder
        emoji="⚠️"
        title="无法打开本地数据库"
        description={resource.error.message}
        cta={{ label: '重试', onPress: resource.reload }}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.h1}>选择词书</Text>
      <Text style={styles.sub}>
        先选一本开始;之后可以同时安装多本,「今日」页会从所有已安装的书中按算法挑词。
      </Text>
      <FlatList
        data={WORDBOOK_CATALOG}
        keyExtractor={(item) => item.code}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.three }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  h1: {
    fontSize: FontSize.display,
    fontWeight: FontWeight.bold,
    color: Colors.light.text,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
  },
  sub: {
    fontSize: FontSize.body,
    color: Colors.light.textSecondary,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
  },
  list: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
  card: {
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: FontSize.subtitle,
    fontWeight: FontWeight.semibold,
    color: Colors.light.text,
    flex: 1,
  },
  blurb: {
    fontSize: FontSize.body,
    color: Colors.light.textSecondary,
    lineHeight: 22,
  },
  meta: {
    fontSize: FontSize.small,
    color: Colors.light.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: Spacing.one,
  },
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeInstalled: { backgroundColor: SemanticColors.successSoft },
  badgeReady: { backgroundColor: SemanticColors.infoSoft },
  badgePending: { backgroundColor: Colors.light.backgroundElement },
  badgeText: {
    fontSize: FontSize.caption,
    fontWeight: FontWeight.semibold,
    color: Colors.light.text,
  },
});
