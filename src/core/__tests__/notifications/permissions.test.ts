/**
 * Permissions module — verifies the coarse ReminderPermission shape
 * returned by the wrapper around expo-notifications.
 */
import * as Notifications from 'expo-notifications';

import {
  getReminderPermission,
  requestReminderPermission,
  isSchedulingAvailable,
} from '@/core/notifications/permissions';

interface MockedNotifications {
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
}

const mock = Notifications as unknown as MockedNotifications;

beforeEach(() => {
  mock.getPermissionsAsync.mockReset();
  mock.requestPermissionsAsync.mockReset();
});

describe('getReminderPermission', () => {
  it('returns "granted" when the native call reports granted', async () => {
    mock.getPermissionsAsync.mockResolvedValueOnce({ granted: true, canAskAgain: true });
    expect(await getReminderPermission()).toBe('granted');
  });

  it('returns "denied" when canAskAgain is false and not granted', async () => {
    mock.getPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: false });
    expect(await getReminderPermission()).toBe('denied');
  });

  it('returns "undetermined" when the user has not been asked', async () => {
    mock.getPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: true });
    expect(await getReminderPermission()).toBe('undetermined');
  });

  it('returns "granted" on iOS provisional auth', async () => {
    mock.getPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      canAskAgain: true,
      ios: { status: 3 /* PROVISIONAL */ },
    });
    expect(await getReminderPermission()).toBe('granted');
  });

  it('returns "undetermined" when the native call throws', async () => {
    mock.getPermissionsAsync.mockRejectedValueOnce(new Error('boom'));
    expect(await getReminderPermission()).toBe('undetermined');
  });
});

describe('requestReminderPermission', () => {
  it('passes iOS options and resolves granted', async () => {
    mock.requestPermissionsAsync.mockResolvedValueOnce({ granted: true, canAskAgain: true });
    const p = await requestReminderPermission();
    expect(p).toBe('granted');
    expect(mock.requestPermissionsAsync).toHaveBeenCalledWith(
      expect.objectContaining({ ios: expect.any(Object) }),
    );
  });

  it('collapses thrown errors to denied', async () => {
    mock.requestPermissionsAsync.mockRejectedValueOnce(new Error('boom'));
    expect(await requestReminderPermission()).toBe('denied');
  });
});

describe('isSchedulingAvailable', () => {
  it('reports availability based on expo-device + platform', () => {
    // Under jest-expo, Platform.OS defaults to 'ios' and the
    // expo-device mock returns isDevice: true → available.
    expect(isSchedulingAvailable()).toBe(true);
  });
});
