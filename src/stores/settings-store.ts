/**
 * Settings store — runtime mirror of the `settings` SQLite table.
 *
 * We keep the source of truth in SQLite (durable across app restarts)
 * and mirror the values into a Zustand store for the UI. The flow is:
 *
 *   boot  → read once from SQLite, hydrate the store
 *   write → update store immediately (UI reacts) + persist to SQLite
 *
 * Only non-sensitive prefs live here. The user's MiniMax API key is in
 * `expo-secure-store` and is loaded on demand by the AI runtime.
 */
import { create } from 'zustand';

import { settingsRepository } from '@/db/repositories/settings';
import { getDb } from '@/db/client';

export type Accent = 'en-US' | 'en-GB';

export const ACCENT_OPTIONS: readonly { value: Accent; label: string }[] = [
  { value: 'en-US', label: '美音' },
  { value: 'en-GB', label: '英音' },
] as const;

export const DAILY_NEW_WORD_OPTIONS = [10, 20, 30, 50, 80] as const;
export type DailyNewWords = (typeof DAILY_NEW_WORD_OPTIONS)[number];

export interface SettingsState {
  accent: Accent;
  dailyNewWords: DailyNewWords;
  /** Set to `true` after the first boot-time hydrate so the UI can avoid flash-of-defaults. */
  hydrated: boolean;

  hydrate: () => Promise<void>;
  setAccent: (accent: Accent) => Promise<void>;
  setDailyNewWords: (n: DailyNewWords) => Promise<void>;
}

interface PersistedSettings {
  accent: Accent;
  dailyNewWords: DailyNewWords;
}

const KEY = 'app';
const DEFAULTS: PersistedSettings = {
  accent: 'en-US',
  dailyNewWords: 30,
};

function isAccent(v: unknown): v is Accent {
  return v === 'en-US' || v === 'en-GB';
}

function isDailyNewWords(v: unknown): v is DailyNewWords {
  return typeof v === 'number' && (DAILY_NEW_WORD_OPTIONS as readonly number[]).includes(v);
}

export const useSettingsStore = create<SettingsState>((set) => ({
  accent: DEFAULTS.accent,
  dailyNewWords: DEFAULTS.dailyNewWords,
  hydrated: false,

  async hydrate() {
    try {
      const db = await getDb();
      const persisted = await settingsRepository.get<PersistedSettings>(db, KEY);
      if (persisted) {
        set({
          accent: isAccent(persisted.accent) ? persisted.accent : DEFAULTS.accent,
          dailyNewWords: isDailyNewWords(persisted.dailyNewWords)
            ? persisted.dailyNewWords
            : DEFAULTS.dailyNewWords,
          hydrated: true,
        });
        return;
      }
    } catch {
      // DB not ready yet — fall through to defaults and let a later
      // hydrate() call win. This happens on first launch before
      // getDb() has finished opening.
    }
    set({ hydrated: true });
  },

  async setAccent(accent) {
    set({ accent });
    try {
      const db = await getDb();
      const cur = (await settingsRepository.get<PersistedSettings>(db, KEY)) ?? DEFAULTS;
      await settingsRepository.set<PersistedSettings>(db, KEY, { ...cur, accent });
    } catch {
      // Persistence failure is non-fatal — in-memory state still wins for this session.
    }
  },

  async setDailyNewWords(dailyNewWords) {
    set({ dailyNewWords });
    try {
      const db = await getDb();
      const cur = (await settingsRepository.get<PersistedSettings>(db, KEY)) ?? DEFAULTS;
      await settingsRepository.set<PersistedSettings>(db, KEY, { ...cur, dailyNewWords });
    } catch {
      // See setAccent.
    }
  },
}));

export { DEFAULTS as DEFAULT_SETTINGS };
