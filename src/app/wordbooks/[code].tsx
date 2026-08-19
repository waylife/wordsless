/**
 * Per-wordbook browser — lists every word in a book, with the primary
 * definition and the phonetic. Tapping a row is a no-op in Phase 1.4;
 * Phase 3 wires it to the study session.
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { ListRenderItem } from 'react-native';

import { Card } from '@/components/card';
import { TabPlaceholder } from '@/components/tab-placeholder';
import { Button } from '@/components/button';
import { WORDBOOK_CATALOG } from '@/db/catalog';
import { wordRepository } from '@/db/repositories/words';
import { wordbookRepository } from '@/db/repositories/wordbooks';
import type { Word, Wordbook, WordbookCodeValue } from '@/db/schema';
import { useAsyncResource } from '@/hooks/use-async-resource';
import { Colors, FontSize, FontWeight, Spacing } from '@/constants/theme';

interface BrowserData {
  wordbook: Wordbook | null;
  words: Word[];
}

function useBrowserData(code: string) {
  return useAsyncResource<BrowserData>(async (db) => {
    const wb = await wordbookRepository.findByCode(db, code as WordbookCodeValue);
    if (!wb) return { wordbook: null, words: [] };
    const words = await wordRepository.listByBook(db, { bookId: wb.id, limit: 1000 });
    return { wordbook: wb, words };
  });
}

function WordRow({ word }: { word: Word }) {
  const primary = word.meanings[0];
  return (
    <Card variant="flat" padding="three" radius="md" style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.spelling}>{word.spelling}</Text>
        {word.phoneticUs ? <Text style={styles.phonetic}>{word.phoneticUs}</Text> : null}
      </View>
      {primary ? (
        <Text style={styles.definition} numberOfLines={2}>
          {primary.pos ? `${primary.pos} ` : ''}
          {primary.def}
        </Text>
      ) : null}
    </Card>
  );
}

export default function WordbookBrowser() {
  const params = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const code = params.code ?? '';
  const meta = WORDBOOK_CATALOG.find((b) => b.code === code);
  const resource = useBrowserData(code);

  const renderItem: ListRenderItem<Word> = useCallback(({ item }) => <WordRow word={item} />, []);

  if (resource.loading && !resource.data) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: meta?.shortName ?? '词书' }} />
        <TabPlaceholder emoji="⏳" title="加载中" description="正在读本地数据库" />
      </View>
    );
  }
  if (resource.error) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: meta?.shortName ?? '词书' }} />
        <TabPlaceholder
          emoji="⚠️"
          title="读取失败"
          description={resource.error.message}
          cta={{ label: '重试', onPress: resource.reload }}
        />
      </View>
    );
  }
  if (!resource.data?.wordbook) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: meta?.shortName ?? '词书' }} />
        <TabPlaceholder
          emoji="📭"
          title="还没安装这本书"
          description="回到「选书」页,点击「下载到本地」再试。"
          cta={{ label: '返回选书', onPress: () => router.push('/wordbooks/select') }}
        />
      </View>
    );
  }
  const { wordbook, words } = resource.data;
  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: wordbook.name }} />
      <View style={styles.header}>
        <Text style={styles.h1}>{wordbook.name}</Text>
        <Text style={styles.meta}>{words.length} 词</Text>
      </View>
      <FlatList
        data={words}
        keyExtractor={(w) => w.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.two }} />}
      />
      <View style={styles.footer}>
        <Button
          label="开始学习这本书"
          variant="primary"
          size="lg"
          fullWidth
          onPress={() => router.push(`/study/session?book=${wordbook.code}`)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    paddingBottom: Spacing.three,
    gap: Spacing.one,
  },
  h1: {
    fontSize: FontSize.title,
    fontWeight: FontWeight.bold,
    color: Colors.light.text,
  },
  meta: {
    fontSize: FontSize.small,
    color: Colors.light.textSecondary,
  },
  list: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
  row: {
    gap: Spacing.one,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  spelling: {
    fontSize: FontSize.subtitle,
    fontWeight: FontWeight.semibold,
    color: Colors.light.text,
  },
  phonetic: {
    fontSize: FontSize.small,
    color: Colors.light.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  definition: {
    fontSize: FontSize.body,
    color: Colors.light.textSecondary,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
});
