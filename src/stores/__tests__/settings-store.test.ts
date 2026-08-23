/**
 * Settings store — verifies the new reminder fields round-trip and
 * that default values are applied on a fresh DB.
 */
import { settingsRepository } from '@/db/repositories/settings';
import { useSettingsStore, DEFAULT_SETTINGS } from '@/stores/settings-store';

import { createTestDb, type TestDbHandle } from '@/db/__tests__/test-db';

jest.mock('@/db/client', () => ({
  getDb: jest.fn(),
}));

function mockedGetDb(): jest.Mock {
  return jest.requireMock('@/db/client').getDb as jest.Mock;
}

async function resetStore(handle: TestDbHandle) {
  // The store is a singleton — for each test, restore both the
  // persisted row and the in-memory state to the documented defaults.
  await settingsRepository._deleteAllForTests(handle.db);
  useSettingsStore.setState({
    accent: DEFAULT_SETTINGS.accent,
    dailyNewWords: DEFAULT_SETTINGS.dailyNewWords,
    reminderEnabled: DEFAULT_SETTINGS.reminderEnabled,
    reminderHour: DEFAULT_SETTINGS.reminderHour,
    reminderMinute: DEFAULT_SETTINGS.reminderMinute,
    hydrated: false,
  });
}

describe('useSettingsStore', () => {
  let handle: TestDbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
    const getDb = mockedGetDb();
    getDb.mockReset();
    getDb.mockResolvedValue(handle.db);
    await resetStore(handle);
  });
  afterEach(() => handle.close());

  it('starts with the documented defaults before hydration', () => {
    const s = useSettingsStore.getState();
    expect(s.accent).toBe('en-US');
    expect(s.dailyNewWords).toBe(30);
    expect(s.reminderEnabled).toBe(false);
    expect(s.reminderHour).toBe(21);
    expect(s.reminderMinute).toBe(0);
    expect(s.hydrated).toBe(false);
  });

  it('persists reminderEnabled and time changes', async () => {
    await useSettingsStore.getState().setReminderEnabled(true);
    await useSettingsStore.getState().setReminderTime(7, 30);
    const reloaded = (await settingsRepository.get<{
      reminderEnabled: boolean;
      reminderHour: number;
      reminderMinute: number;
    }>(handle.db, 'app'))!;
    expect(reloaded.reminderEnabled).toBe(true);
    expect(reloaded.reminderHour).toBe(7);
    expect(reloaded.reminderMinute).toBe(30);
  });

  it('hydrates from the persisted values', async () => {
    await settingsRepository.set(handle.db, 'app', {
      accent: 'en-GB',
      dailyNewWords: 50,
      reminderEnabled: true,
      reminderHour: 9,
      reminderMinute: 15,
    });
    await useSettingsStore.getState().hydrate();
    const s = useSettingsStore.getState();
    expect(s.accent).toBe('en-GB');
    expect(s.dailyNewWords).toBe(50);
    expect(s.reminderEnabled).toBe(true);
    expect(s.reminderHour).toBe(9);
    expect(s.reminderMinute).toBe(15);
    expect(s.hydrated).toBe(true);
  });

  it('falls back to defaults for malformed values', async () => {
    await settingsRepository.set(handle.db, 'app', {
      accent: 'en-US',
      dailyNewWords: 30,
      reminderEnabled: 'yes' as unknown as boolean,
      reminderHour: 99,
      reminderMinute: -5,
    });
    await useSettingsStore.getState().hydrate();
    const s = useSettingsStore.getState();
    expect(s.reminderEnabled).toBe(false);
    expect(s.reminderHour).toBe(21);
    expect(s.reminderMinute).toBe(0);
  });
});
