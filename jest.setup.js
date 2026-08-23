/**
 * Jest setup — runs before each test file.
 *
 * The jest-expo preset already mocks the React Native / Expo runtime
 * (expo-router, expo-constants, native modules, etc.). Add project-specific
 * stubs here only when a component reaches for an optional surface that
 * jest-expo does not cover.
 *
 * This file is plain JS so Prettier (which doesn't go through
 * babel-preset-expo) can parse it; TypeScript annotations on the
 * mock args would break `pnpm format`.
 */

// expo-notifications is a native module that jest-expo does not
// auto-mock. The runtime API is a flat object of named exports, so
// we stub the surface the app actually touches. Tests that need to
// assert scheduling behavior (e.g. core/__tests__/notifications/*)
// reach into `__scheduled` on the mock to verify the call shape.
jest.mock('expo-notifications', () => {
  const SchedulableTriggerInputTypes = {
    CALENDAR: 'calendar',
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly',
    YEARLY: 'yearly',
    DATE: 'date',
    TIME_INTERVAL: 'timeInterval',
  };
  const AndroidImportance = { DEFAULT: 3, HIGH: 4, LOW: 2, MIN: 1, NONE: 0 };
  const scheduled = [];
  let idCounter = 0;
  const makeMock = () => jest.fn();
  return {
    SchedulableTriggerInputTypes,
    AndroidImportance,
    setNotificationHandler: makeMock(),
    setNotificationChannelAsync: makeMock(),
    getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
    requestPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
    getAllScheduledNotificationsAsync: jest.fn(async () => scheduled.slice()),
    scheduleNotificationAsync: jest.fn(async (req) => {
      const id = (req && req.identifier) || `mock-${++idCounter}`;
      scheduled.push({ identifier: id, content: undefined, trigger: undefined });
      return id;
    }),
    cancelScheduledNotificationAsync: jest.fn(async (id) => {
      const idx = scheduled.findIndex((s) => s.identifier === id);
      if (idx >= 0) scheduled.splice(idx, 1);
    }),
    cancelAllScheduledNotificationsAsync: makeMock(),
    getNotificationChannelsAsync: jest.fn(async () => []),
    getExpoPushTokenAsync: jest.fn(async () => ({ data: 'mock-token' })),
    // Expose the internal list so tests can introspect what was scheduled.
    __scheduled: scheduled,
  };
});

// expo-device is a tiny shim that always answers; mock it so the
// `isDevice` helper used by core/notifications/permissions returns
// `true` in unit tests (the rest of the app treats it as a real device).
jest.mock('expo-device', () => ({
  isDevice: true,
  deviceName: 'Mock Device',
  deviceType: 1,
}));
