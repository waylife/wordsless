/**
 * Notification permission helpers.
 *
 * Wraps `expo-notifications` so the rest of the app can ask "can I
 * notify the user?" without reaching for the native module directly.
 * The function is forgiving: any failure (no provider, web build,
 * permission API absent) collapses into a `granted: false` answer
 * rather than throwing — the UI's "enable reminder" toggle should
 * never break because of a notification API quirk.
 */
import { Platform } from 'react-native';
import type { NotificationPermissionsStatus } from 'expo-notifications';

import * as Notifications from 'expo-notifications';
import { isDevice } from 'expo-device';

/**
 * Coarse-grained permission state the rest of the app reasons about.
 * `unknown` covers the web target and any other surface where
 * expo-notifications is unavailable.
 */
export type ReminderPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

interface NotificationsShape {
  getPermissionsAsync?: typeof Notifications.getPermissionsAsync;
  requestPermissionsAsync?: typeof Notifications.requestPermissionsAsync;
}

function readExports(): NotificationsShape {
  return Notifications as unknown as NotificationsShape;
}

/**
 * Ask the platform whether we can post notifications. The `granted`
 * flag on iOS also accepts `PROVISIONAL` (silent) authorization; we
 * keep the check tight here because provisional wouldn't show a
 * daily reminder banner.
 */
export async function getReminderPermission(): Promise<ReminderPermission> {
  if (!isSchedulingAvailable()) return 'unsupported';
  try {
    const { getPermissionsAsync } = readExports();
    if (!getPermissionsAsync) return 'unsupported';
    const status: NotificationPermissionsStatus = await getPermissionsAsync();
    return interpretStatus(status);
  } catch {
    return 'undetermined';
  }
}

/**
 * Prompt the user for notification permission. Returns the resolved
 * status — on iOS, the first call shows the system dialog; on Android
 * 13+ it surfaces the runtime permission; on older Androids the
 * platform grants by default.
 */
export async function requestReminderPermission(): Promise<ReminderPermission> {
  if (!isSchedulingAvailable()) return 'unsupported';
  try {
    const { requestPermissionsAsync } = readExports();
    if (!requestPermissionsAsync) return 'unsupported';
    const status = await requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    return interpretStatus(status);
  } catch {
    return 'denied';
  }
}

function interpretStatus(status: NotificationPermissionsStatus | undefined): ReminderPermission {
  if (!status) return 'undetermined';
  if (status.granted) return 'granted';
  // iOS-only — accept provisional as granted so dev builds can test
  // without explicit perms.
  const iosStatus = (status as NotificationPermissionsStatus).ios?.status;
  if (iosStatus === 3 /* PROVISIONAL */) return 'granted';
  if (status.canAskAgain === false) return 'denied';
  return 'undetermined';
}

/**
 * Local notifications require a real device — emulators and the web
 * target are not supported. We expose this so the settings UI can
 * gray out the toggle instead of pretending it works.
 */
export function isSchedulingAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  // expo-device is a tiny shim that always answers — `isDevice` is
  // `false` on emulators/simulators and on the web. Web is filtered
  // above; this catches the simulator case.
  return Boolean(isDevice);
}
