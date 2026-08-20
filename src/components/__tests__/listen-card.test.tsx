/**
 * ListenCard component tests — verify the prompt text, the play button
 * test-id, and the choice options render.
 */

import { render, screen } from '@testing-library/react-native';

import { ListenCard } from '@/components/listen-card';

jest.mock('expo-speech', () => ({
  __esModule: true,
  speak: jest.fn(),
  stop: jest.fn(async () => undefined),
  isSpeakingAsync: jest.fn(async () => false),
}));

const OPTIONS = [
  { id: 'w-1', label: 'abandon' },
  { id: 'w-2', label: 'ability' },
  { id: 'w-3', label: 'absent' },
  { id: 'w-4', label: 'absorb' },
];

describe('ListenCard', () => {
  it('renders the prompt and the play button', () => {
    render(
      <ListenCard
        options={OPTIONS}
        correctId="w-1"
        selectedId={null}
        spelling="abandon"
        accent="en-US"
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByTestId('listen-card')).toBeTruthy();
    expect(screen.getByTestId('listen-play')).toBeTruthy();
    expect(screen.getByText('听音辨词 · 选正确的拼写')).toBeTruthy();
  });

  it('renders all 4 spelling options as buttons', () => {
    render(
      <ListenCard
        options={OPTIONS}
        correctId="w-1"
        selectedId={null}
        spelling="abandon"
        accent="en-US"
        onSelect={() => undefined}
      />,
    );
    for (const opt of OPTIONS) {
      expect(screen.getByTestId(`choice-${opt.id}`)).toBeTruthy();
    }
  });
});
