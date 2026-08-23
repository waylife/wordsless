/**
 * StreakBadge — visual regression is impractical without snapshots, so
 * the tests focus on the conditional behavior (when to render, what
 * numbers to show) via accessibility labels.
 */
import { render, screen } from '@testing-library/react-native';

import { StreakBadge } from '@/components/streak-badge';

describe('StreakBadge', () => {
  it('renders nothing when the streak is zero', () => {
    const { toJSON } = render(<StreakBadge current={0} />);
    expect(toJSON()).toBeNull();
  });

  it('renders the streak number in the accessibility label', () => {
    render(<StreakBadge current={7} />);
    expect(screen.getByLabelText('连续打卡 7 天')).toBeTruthy();
  });

  it('surfaces the "best" hint when best > current', () => {
    render(<StreakBadge current={3} best={10} />);
    expect(screen.getByLabelText('连续打卡 3 天,最佳 10 天')).toBeTruthy();
  });

  it('omits the "best" hint when best <= current', () => {
    render(<StreakBadge current={10} best={10} />);
    expect(screen.getByLabelText('连续打卡 10 天')).toBeTruthy();
  });
});
