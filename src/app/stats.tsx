/**
 * Stats tab — progress, mastery distribution, recent activity. Wired up
 * properly in Phase 4.
 */
import { TabPlaceholder } from '@/components/tab-placeholder';

export default function StatsTab() {
  return (
    <TabPlaceholder
      emoji="📊"
      title="统计"
      description="累计词量、掌握度分布、近 7 日热力图。Phase 4 上线。"
      meta={[
        { label: '累计学词', value: '0' },
        { label: '已掌握', value: '0' },
        { label: '学习中', value: '0' },
        { label: '生词本', value: '0' },
      ]}
    />
  );
}
