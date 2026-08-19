/**
 * Audio — single-purpose speech wrapper used by the study session.
 *
 * Phase 2 of the plan calls for "real human audio per word, system TTS
 * as a fallback". We don't have a real-audio pipeline yet (no licensed
 * audio corpus, no zip-distribution infra), so for now the only
 * available source IS the system TTS. The wrapper is shaped so we can
 * drop in `expo-audio` + per-word MP3s behind the same surface without
 * touching the call sites.
 *
 * The wrapper is intentionally tiny — no preloading, no queueing. The
 * session UI calls `speak()` with the next word right before flipping
 * the card; latency on iOS/Android system voices is well under 200ms.
 */
import * as Speech from 'expo-speech';

import type { Accent } from '@/stores/settings-store';

export interface SpeakOptions {
  /** Force a specific accent regardless of the current settings. */
  accent?: Accent;
  /** 0.5 (slow) — 2.0 (fast). 1.0 is the OS default. */
  rate?: number;
}

const ACCENT_TO_BCP47: Record<Accent, string> = {
  'en-US': 'en-US',
  'en-GB': 'en-GB',
};

export const audio = {
  /**
   * Speak the given text. If another utterance is in progress, it is
   * stopped first (no queueing — the study flow only ever cares about
   * the most recent word).
   */
  async speak(text: string, opts: SpeakOptions = {}): Promise<void> {
    if (!text) return;
    // `stop()` is a Promise; awaiting it guarantees the previous
    // utterance has been released before we start the next one.
    await Speech.stop();
    Speech.speak(text, {
      language: ACCENT_TO_BCP47[opts.accent ?? 'en-US'],
      rate: opts.rate ?? 0.95,
    });
  },

  /** Stop any in-flight speech. Cheap to call on screen unmount. */
  async stop(): Promise<void> {
    await Speech.stop();
  },

  /** True if the OS is mid-utterance. Mostly useful in tests. */
  isSpeaking(): Promise<boolean> {
    return Speech.isSpeakingAsync();
  },
};
