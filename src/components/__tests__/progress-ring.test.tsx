/**
 * ProgressRing component tests.
 *
 * Smoke-tests the wrapper + a11y role. We don't snapshot the rotated
 * transforms here because they're visual — they get verified manually.
 */
import { Text } from 'react-native';

import { ProgressRing } from '@/components/progress-ring';
import { render, screen } from '@testing-library/react-native';

describe('ProgressRing', () => {
  it('renders with a progressbar accessibility role and the right now-value', () => {
    render(<ProgressRing progress={0.42} />);
    const ring = screen.getByTestId('progress-ring');
    expect(ring.props.accessibilityRole).toBe('progressbar');
    expect(ring.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 42 });
  });

  it('clamps progress above 1 down to 100%', () => {
    render(<ProgressRing progress={2} />);
    expect(screen.getByTestId('progress-ring').props.accessibilityValue.now).toBe(100);
  });

  it('clamps negative progress up to 0%', () => {
    render(<ProgressRing progress={-0.5} />);
    expect(screen.getByTestId('progress-ring').props.accessibilityValue.now).toBe(0);
  });

  it('renders string children as a center label', () => {
    render(<ProgressRing progress={0.3}>{`12/30`}</ProgressRing>);
    expect(screen.getByText('12/30')).toBeTruthy();
  });

  it('renders arbitrary node children without crashing', () => {
    render(
      <ProgressRing progress={0.5}>
        <Text>anything</Text>
      </ProgressRing>,
    );
    expect(screen.getByText('anything')).toBeTruthy();
  });
});
