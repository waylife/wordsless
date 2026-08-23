/**
 * Local-notification scheduling.
 *
 * The reminder is a single repeating notification: at HH:MM every day,
 * fire "该背单词啦 ✨". We always re-cancel + re-schedule on update so
 * the user only ever has one scheduled entry — keeps the cancel/grant
 * path simple and avoids leaking duplicate reminders when they toggle
 * the time.
 *
 * The module never throws into the UI. If the permission is missing
 * or the native API errors out, the call resolves to `{ ok: false }`
 * and the caller surfaces a friendly message. The user's
 * `reminderEnabled` setting is the source of truth, not the
 * scheduled-notification list.
 */
import { Platform } from 'react-native';

import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';

import {
  DAILY_REMINDER_CONTENT,
  REMINDER_CATEGORY_ID,
  REMINDER_CHANNEL_DESCRIPTION,
  REMINDER_CHANNEL_ID,
  REMINDER_CHANNEL_NAME,
} from './strings';

export interface ReminderInput {
  enabled: boolean;
  hour: number;
  minute: number;
}

export interface ScheduleResult {
  ok: boolean;
  /** Native identifier of the scheduled notification, when one was created. */
  id?: string;
  reason?: string;
}

export const REMINDER_IDENTIFIER = 'wordsless.daily-reminder';

/**
 * Set up the notification handler (controls how foregrounded
 * notifications are presented) and the Android channel. Safe to
 * call multiple times — the handler and channel are idempotent.
 */
export async function ensureNotificationInfrastructure(): Promise<void> {
  try {
    // Foregrounded notifications: still show as a banner on iOS,
    // play a sound. The user expects the reminder even if the app is
    // already open in the background.
    await Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    // Setter is a no-op on web; any other failure is non-fatal.
  }
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
        name: REMINDER_CHANNEL_NAME,
        description: REMINDER_CHANNEL_DESCRIPTION,
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#208AEF',
        sound: 'default',
      });
    } catch {
      // Channels are best-effort; the schedule will fall back to
      // the default channel.
    }
  }
}

/**
 * Cancel any previously-scheduled daily reminder and (optionally)
 * schedule a new one. `enabled = false` is equivalent to
 * `cancelReminder()`.
 */
export async function scheduleDailyReminder(input: ReminderInput): Promise<ScheduleResult> {
  await cancelReminder();
  if (!input.enabled) {
    return { ok: true };
  }
  if (!isValidHour(input.hour) || !isValidMinute(input.minute)) {
    return { ok: false, reason: 'invalid-time' };
  }
  try {
    await ensureNotificationInfrastructure();
    const id = await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_IDENTIFIER,
      content: {
        title: DAILY_REMINDER_CONTENT.title,
        body: DAILY_REMINDER_CONTENT.body,
        sound: 'default',
        categoryIdentifier: REMINDER_CATEGORY_ID,
        ...(Platform.OS === 'android' ? { channelId: REMINDER_CHANNEL_ID } : {}),
      },
      trigger: {
        type: SchedulableTriggerInputTypes.DAILY,
        hour: input.hour,
        minute: input.minute,
      },
    });
    return { ok: true, id };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

/** Cancel the daily reminder if one is scheduled. Idempotent. */
export async function cancelReminder(): Promise<void> {
  try {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    const matches = pending.filter((n) => n.identifier === REMINDER_IDENTIFIER);
    await Promise.all(
      matches.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    // Cancelling is best-effort — a stale reminder will still fire
    // at its scheduled time but the next boot will re-sync.
  }
}

/**
 * Returns the identifier of the currently-scheduled daily reminder,
 * or `null` if none. Useful for diagnostics / "is the reminder on?"
 * checks on the settings page.
 */
export async function getScheduledReminderId(): Promise<string | null> {
  try {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    return pending.find((n) => n.identifier === REMINDER_IDENTIFIER)?.identifier ?? null;
  } catch {
    return null;
  }
}

function isValidHour(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 23;
}

function isValidMinute(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 59;
}
