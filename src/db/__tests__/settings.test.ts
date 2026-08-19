/**
 * Settings repository tests — verify round-trip and overwrite semantics.
 */
import { settingsRepository } from '@/db/repositories/settings';

import { createTestDb, type TestDbHandle } from './test-db';

describe('settingsRepository', () => {
  let handle: TestDbHandle;
  beforeEach(async () => {
    handle = await createTestDb();
  });
  afterEach(() => handle.close());

  it('returns null for an unset key', async () => {
    const v = await settingsRepository.get<{ x: number }>(handle.db, 'missing');
    expect(v).toBeNull();
  });

  it('persists and round-trips a JSON object', async () => {
    await settingsRepository.set(handle.db, 'app', { accent: 'en-GB', dailyNewWords: 50 });
    const v = await settingsRepository.get<{ accent: string; dailyNewWords: number }>(
      handle.db,
      'app',
    );
    expect(v).toEqual({ accent: 'en-GB', dailyNewWords: 50 });
  });

  it('overwrites on conflict', async () => {
    await settingsRepository.set(handle.db, 'app', { accent: 'en-US', dailyNewWords: 30 });
    await settingsRepository.set(handle.db, 'app', { accent: 'en-GB', dailyNewWords: 80 });
    const v = await settingsRepository.get<{ accent: string; dailyNewWords: number }>(
      handle.db,
      'app',
    );
    expect(v).toEqual({ accent: 'en-GB', dailyNewWords: 80 });
  });
});
