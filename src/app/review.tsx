/**
 * Review tab — full review queue, separate from "today's mixed session".
 * Will use the FSRS scheduler to surface only due cards in Phase 3.
 */
import { useRouter } from 'expo-router';

import { TabPlaceholder } from '@/components/tab-placeholder';

export default function ReviewTab() {
  const router = useRouter();

  return (
    <TabPlaceholder
      emoji="🔁"
      title="复习"
      description="算法会挑出你今天最该回顾的词。Phase 3 接入 FSRS 后会真正跑起来。"
      meta={[
        { label: '到期', value: '0' },
        { label: '逾期', value: '0' },
        { label: '总掌握率', value: '—' },
      ]}
      cta={{
        label: '进入复习队列',
        onPress: () => router.push('/study/session?mode=review'),
      }}
    />
  );
}
