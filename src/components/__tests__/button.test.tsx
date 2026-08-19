/**
 * Button component tests.
 *
 * Covers: rendering, press handling, disabled/loading states, and the
 * accessibility props we lean on (role, busy, disabled).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Button } from '@/components/button';

describe('Button', () => {
  it('renders the label', () => {
    render(<Button label="Start learning" onPress={() => undefined} />);
    expect(screen.getByText('Start learning')).toBeTruthy();
  });

  it('forwards press events when enabled', () => {
    const onPress = jest.fn();
    render(<Button label="Go" onPress={onPress} />);
    fireEvent.press(screen.getByText('Go'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    render(<Button label="Go" disabled onPress={onPress} />);
    fireEvent.press(screen.getByText('Go'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('does not call onPress when loading and shows busy accessibility', () => {
    const onPress = jest.fn();
    render(<Button label="Go" loading onPress={onPress} testID="go" />);
    const btn = screen.getByTestId('go');
    expect(btn.props.accessibilityState.busy).toBe(true);
    fireEvent.press(btn);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders left/right icons when provided', () => {
    render(
      <Button
        label="Listen"
        onPress={() => undefined}
        leftIcon={<Text testID="left">L</Text>}
        rightIcon={<Text testID="right">R</Text>}
      />,
    );
    expect(screen.getByTestId('left')).toBeTruthy();
    expect(screen.getByTestId('right')).toBeTruthy();
  });

  it('exposes button role for screen readers', () => {
    render(<Button label="Tap" onPress={() => undefined} testID="tap" />);
    expect(screen.getByTestId('tap').props.accessibilityRole).toBe('button');
  });
});
