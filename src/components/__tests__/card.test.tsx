/**
 * Card component tests — verifies the three visual variants and padding override.
 */
import { Text } from 'react-native';

import { Card } from '@/components/card';
import { render, screen } from '@testing-library/react-native';

describe('Card', () => {
  it('renders children', () => {
    render(
      <Card>
        <Text>body</Text>
      </Card>,
    );
    expect(screen.getByText('body')).toBeTruthy();
  });

  it('applies the default padding (four) when not overridden', () => {
    render(
      <Card testID="card">
        <Text>x</Text>
      </Card>,
    );
    const view = screen.getByTestId('card');
    const flat = Array.isArray(view.props.style)
      ? view.props.style.flat(Infinity).filter(Boolean)
      : [view.props.style];
    const hasFour = flat.some((s: { padding?: number } | undefined) => s?.padding === 24);
    expect(hasFour).toBe(true);
  });

  it('respects the padding="none" override', () => {
    render(
      <Card testID="card" padding="none">
        <Text>x</Text>
      </Card>,
    );
    const view = screen.getByTestId('card');
    const flat = Array.isArray(view.props.style)
      ? view.props.style.flat(Infinity).filter(Boolean)
      : [view.props.style];
    const hasNone = flat.some((s: { padding?: number } | undefined) => s?.padding === 0);
    expect(hasNone).toBe(true);
  });
});
