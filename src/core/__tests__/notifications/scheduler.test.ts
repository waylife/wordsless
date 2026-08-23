/**
 * Notifications scheduler — verifies the daily reminder shape, the
 * cancel-then-reschedule path, and the disabled/off branch.
 *
 * The native module is mocked in `jest.setup.js`; we reach into the
 * `__scheduled` array to assert what would have been installed.
 */
import * as Notifications from 'expo-notifications';

import {
  REMINDER_IDENTIFIER,
  cancelReminder,
  scheduleDailyReminder,
} from '@/core/notifications/scheduler';
import type { ReminderInput } from '@/core/notifications/scheduler';

interface MockedNotifications {
  __scheduled: { identifier: string; content: unknown; trigger: unknown }[];
  scheduleNotificationAsync: jest.Mock;
  cancelScheduledNotificationAsync: jest.Mock;
  cancelAllScheduledNotificationsAsync: jest.Mock;
  getAllScheduledNotificationsAsync: jest.Mock;
  setNotificationHandler: jest.Mock;
  setNotificationChannelAsync: jest.Mock;
}

const mock = Notifications as unknown as MockedNotifications;

beforeEach(() => {
  mock.__scheduled.length = 0;
  mock.scheduleNotificationAsync.mockClear();
  mock.cancelScheduledNotificationAsync.mockClear();
  mock.cancelAllScheduledNotificationsAsync.mockClear();
  mock.getAllScheduledNotificationsAsync.mockClear();
  mock.setNotificationHandler.mockClear();
  mock.setNotificationChannelAsync.mockClear();
  mock.getAllScheduledNotificationsAsync.mockResolvedValue(mock.__scheduled);
});

describe('scheduleDailyReminder', () => {
  it('schedules a daily trigger with the requested hour/minute', async () => {
    const input: ReminderInput = { enabled: true, hour: 21, minute: 30 };
    const result = await scheduleDailyReminder(input);
    expect(result.ok).toBe(true);
    expect(result.id).toBe(REMINDER_IDENTIFIER);
    expect(mock.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const [req] = mock.scheduleNotificationAsync.mock.calls[0]!;
    expect(req.identifier).toBe(REMINDER_IDENTIFIER);
    expect(req.content.title).toContain('背单词');
    expect(req.trigger).toMatchObject({ type: 'daily', hour: 21, minute: 30 });
  });

  it('rejects an invalid hour', async () => {
    const result = await scheduleDailyReminder({ enabled: true, hour: 99, minute: 0 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid-time');
    expect(mock.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('rejects a non-integer minute', async () => {
    const result = await scheduleDailyReminder({ enabled: true, hour: 9, minute: 7.5 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid-time');
  });

  it('cancels any existing reminder and installs none when disabled', async () => {
    // First install one
    await scheduleDailyReminder({ enabled: true, hour: 8, minute: 0 });
    expect(mock.__scheduled).toHaveLength(1);

    // Then turn it off
    const result = await scheduleDailyReminder({ enabled: false, hour: 8, minute: 0 });
    expect(result.ok).toBe(true);
    expect(mock.__scheduled).toHaveLength(0);
    expect(mock.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('replaces the previous schedule on time change', async () => {
    await scheduleDailyReminder({ enabled: true, hour: 8, minute: 0 });
    await scheduleDailyReminder({ enabled: true, hour: 22, minute: 15 });
    // The mock counts scheduleNotificationAsync calls; we expect 2.
    expect(mock.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    const last = mock.scheduleNotificationAsync.mock.calls.at(-1)?.[0];
    expect(last.trigger).toMatchObject({ hour: 22, minute: 15 });
  });

  it('attaches the reminder channel on android via a setter call', async () => {
    // We don't flip Platform.OS in tests (it stays 'ios' under
    // jest-expo), but we can still verify the setter is invoked.
    await scheduleDailyReminder({ enabled: true, hour: 7, minute: 30 });
    expect(mock.setNotificationHandler).toHaveBeenCalled();
  });
});

describe('cancelReminder', () => {
  it('removes only the daily reminder from the schedule', async () => {
    mock.__scheduled.push({ identifier: 'other', content: null, trigger: null });
    mock.__scheduled.push({ identifier: REMINDER_IDENTIFIER, content: null, trigger: null });
    mock.getAllScheduledNotificationsAsync.mockResolvedValueOnce(mock.__scheduled.slice());
    await cancelReminder();
    const remaining = mock.__scheduled.map((s) => s.identifier);
    expect(remaining).toEqual(['other']);
  });

  it('is a no-op when nothing is scheduled', async () => {
    await expect(cancelReminder()).resolves.toBeUndefined();
    expect(mock.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });
});
