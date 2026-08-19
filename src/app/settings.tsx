/**
 * Settings tab — app preferences, API key management, daily reminder.
 * Real options come online in Phase 4 (notifications) and Phase 3.6
 * (AI key entry in SecureStore).
 */
import { TabPlaceholder } from '@/components/tab-placeholder';

export default function SettingsTab() {
  return (
    <TabPlaceholder
      emoji="⚙️"
      title="设置"
      description="每日新词量、发音偏好、提醒时间、AI Key 都会出现在这里。"
      meta={[
        { label: '每日新词', value: '30' },
        { label: '发音偏好', value: '美音' },
        { label: '提醒时间', value: '21:00' },
        { label: 'AI 状态', value: '未配置' },
      ]}
    />
  );
}
