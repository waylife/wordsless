/**
 * Home (今日) tab — the daily landing surface. Shows today's new/review
 * count, a quick-start button, and the recent streak.
 *
 * Phase 0 placeholder: numbers are hard-coded zero, the CTA navigates to
 * the (not-yet-built) study session. Real numbers + routing land in
 * Phase 3 / Phase 4.
 */
import { useRouter } from 'expo-router';

import { TabPlaceholder } from '@/components/tab-placeholder';

export default function HomeTab() {
  const router = useRouter();

  return (
    <TabPlaceholder
      emoji="📚"
      title="今日"
      description="挑个心情好的时间,今天的目标已经替你算好了。"
      meta={[
        { label: '今日新词', value: '0' },
        { label: '待复习', value: '0' },
        { label: '连续天数', value: '0' },
      ]}
      cta={{
        label: '去选书',
        onPress: () => router.push('/wordbooks/select'),
      }}
    />
  );
}
