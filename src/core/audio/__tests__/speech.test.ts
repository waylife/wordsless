/**
 * Audio wrapper tests — verify the speak() helper:
 *   - calls expo-speech with the right language tag for each accent
 *   - returns silently for empty input
 *   - stops any in-flight speech before starting the next utterance
 */
// jest.mock is hoisted by jest so its syntactic position is fine;
// disable import/first to silence the linter.
jest.mock('expo-speech', () => ({
  __esModule: true,
  speak: jest.fn(),
  stop: jest.fn(async () => undefined),
  isSpeakingAsync: jest.fn(async () => false),
}));

// eslint-disable-next-line import/first
import { audio } from '@/core/audio/speech';
// eslint-disable-next-line import/first
import * as Speech from 'expo-speech';

const speakMock = Speech.speak as jest.MockedFunction<typeof Speech.speak>;
const stopMock = Speech.stop as jest.MockedFunction<typeof Speech.stop>;

beforeEach(() => {
  speakMock.mockClear();
  stopMock.mockClear();
});

describe('audio.speak', () => {
  it('uses en-US for the default accent', async () => {
    await audio.speak('hello');
    expect(speakMock).toHaveBeenCalledTimes(1);
    expect(speakMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ language: 'en-US' }));
  });

  it('uses en-GB when accent is en-GB', async () => {
    await audio.speak('colour', { accent: 'en-GB' });
    expect(speakMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ language: 'en-GB' }));
  });

  it('returns silently on empty text', async () => {
    await audio.speak('');
    expect(speakMock).not.toHaveBeenCalled();
  });

  it('stops any in-flight speech before starting the next one', async () => {
    await audio.speak('one');
    await audio.speak('two');
    expect(stopMock).toHaveBeenCalled();
    expect(speakMock).toHaveBeenCalledTimes(2);
  });
});
