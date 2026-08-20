/**
 * WordCard tests for the favorite toggle and back-face layout.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';

import { WordCard } from '@/components/word-card';
import type { Word } from '@/db/schema';

jest.mock('expo-speech', () => ({
  __esModule: true,
  speak: jest.fn(),
  stop: jest.fn(async () => undefined),
  isSpeakingAsync: jest.fn(async () => false),
}));

const SAMPLE_WORD: Word = {
  id: 'w-1',
  bookId: 'wb-1',
  spelling: 'serendipity',
  phoneticUk: '/x/',
  phoneticUs: '/x/',
  meanings: [{ pos: 'n.', def: '意外发现' }],
  examples: [{ en: 'a happy serendipity', cn: '一次愉快的意外', source: 'static' }],
  rootAffix: null,
  audioStatus: 'ready',
  createdAt: new Date(),
};

describe('WordCard favorite toggle', () => {
  it('hides the star button when onToggleFavorite is omitted', () => {
    render(<WordCard word={SAMPLE_WORD} flipped accent="en-US" />);
    expect(screen.queryByTestId('favorite-toggle')).toBeNull();
  });

  it('shows an empty star when isFavorited=false', () => {
    render(
      <WordCard
        word={SAMPLE_WORD}
        flipped
        accent="en-US"
        isFavorited={false}
        onToggleFavorite={() => undefined}
      />,
    );
    const btn = screen.getByTestId('favorite-toggle');
    expect(btn).toBeTruthy();
    expect(screen.getByText('☆')).toBeTruthy();
  });

  it('shows a filled star when isFavorited=true', () => {
    render(
      <WordCard
        word={SAMPLE_WORD}
        flipped
        accent="en-US"
        isFavorited
        onToggleFavorite={() => undefined}
      />,
    );
    expect(screen.getByText('★')).toBeTruthy();
  });

  it('invokes onToggleFavorite when the star is pressed', () => {
    const onToggle = jest.fn();
    render(
      <WordCard
        word={SAMPLE_WORD}
        flipped
        accent="en-US"
        isFavorited={false}
        onToggleFavorite={onToggle}
      />,
    );
    fireEvent.press(screen.getByTestId('favorite-toggle'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
