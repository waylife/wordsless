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

/** Allowed minute values for the daily reminder picker. */
export const REMINDER_MINUTE_OPTIONS = [0, 15, 30, 45] as const;
export type ReminderMinute = (typeof REMINDER_MINUTE_OPTIONS)[number];

/** Allowed hour values for the daily reminder picker. */
export const REMINDER_HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => h);
export type ReminderHour = number;

export interface SettingsState {
  accent: Accent;
  dailyNewWords: DailyNewWords;
  reminderEnabled: boolean;
  reminderHour: ReminderHour;
  reminderMinute: ReminderMinute;
  /** Set to `true` after the first boot-time hydrate so the UI can avoid flash-of-defaults. */
  hydrated: boolean;

  hydrate: () => Promise<void>;
  setAccent: (accent: Accent) => Promise<void>;
  setDailyNewWords: (n: DailyNewWords) => Promise<void>;
  setReminderEnabled: (enabled: boolean) => Promise<void>;
  setReminderHour: (hour: ReminderHour) => Promise<void>;
  setReminderMinute: (minute: ReminderMinute) => Promise<void>;
  /**
   * Bulk update for time-of-day changes. We co-update hour + minute
   * to keep the schedule in one transaction — toggling minute alone
   * would briefly schedule a wrong-time notification.
   */
  setReminderTime: (hour: ReminderHour, minute: ReminderMinute) => Promise<void>;
}

interface PersistedSettings {
  accent: Accent;
  dailyNewWords: DailyNewWords;
  reminderEnabled: boolean;
  reminderHour: ReminderHour;
  reminderMinute: ReminderMinute;
}

const KEY = 'app';
const DEFAULTS: PersistedSettings = {
  accent: 'en-US',
  dailyNewWords: 30,
  reminderEnabled: false,
  reminderHour: 21,
  reminderMinute: 0,
};

function isAccent(v: unknown): v is Accent {
  return v === 'en-US' || v === 'en-GB';
}

function isDailyNewWords(v: unknown): v is DailyNewWords {
  return typeof v === 'number' && (DAILY_NEW_WORD_OPTIONS as readonly number[]).includes(v);
}

function isReminderMinute(v: unknown): v is ReminderMinute {
  return typeof v === 'number' && (REMINDER_MINUTE_OPTIONS as readonly number[]).includes(v);
}

function isReminderHour(v: unknown): v is ReminderHour {
  return typeof v === 'number' && v >= 0 && v <= 23 && Number.isInteger(v);
}

function isBool(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  accent: DEFAULTS.accent,
  dailyNewWords: DEFAULTS.dailyNewWords,
  reminderEnabled: DEFAULTS.reminderEnabled,
  reminderHour: DEFAULTS.reminderHour,
  reminderMinute: DEFAULTS.reminderMinute,
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
          reminderEnabled: isBool(persisted.reminderEnabled)
            ? persisted.reminderEnabled
            : DEFAULTS.reminderEnabled,
          reminderHour: isReminderHour(persisted.reminderHour)
            ? persisted.reminderHour
            : DEFAULTS.reminderHour,
          reminderMinute: isReminderMinute(persisted.reminderMinute)
            ? persisted.reminderMinute
            : DEFAULTS.reminderMinute,
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
    await persistPartial({ accent });
  },

  async setDailyNewWords(dailyNewWords) {
    set({ dailyNewWords });
    await persistPartial({ dailyNewWords });
  },

  async setReminderEnabled(reminderEnabled) {
    set({ reminderEnabled });
    await persistPartial({ reminderEnabled });
  },

  async setReminderHour(reminderHour) {
    set({ reminderHour });
    await persistPartial({ reminderHour });
  },

  async setReminderMinute(reminderMinute) {
    set({ reminderMinute });
    await persistPartial({ reminderMinute });
  },

  async setReminderTime(reminderHour, reminderMinute) {
    set({ reminderHour, reminderMinute });
    await persistPartial({ reminderHour, reminderMinute });
  },
}));

async function persistPartial(patch: Partial<PersistedSettings>): Promise<void> {
  try {
    const db = await getDb();
    const cur = (await settingsRepository.get<PersistedSettings>(db, KEY)) ?? DEFAULTS;
    await settingsRepository.set<PersistedSettings>(db, KEY, { ...cur, ...patch });
  } catch {
    // Persistence failure is non-fatal — in-memory state still wins for this session.
  }
}

export { DEFAULTS as DEFAULT_SETTINGS };
