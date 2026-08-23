/**
 * Notifications — barrel + the public API the rest of the app should use.
 *
 * The app's notification surface is intentionally tiny:
 *   - `getReminderPermission()` for "is this on?"
 *   - `requestReminderPermission()` for the prompt
 *   - `scheduleDailyReminder({ enabled, hour, minute })` to (re)install
 *   - `cancelReminder()` for a hard off-switch
 *   - `isSchedulingAvailable()` so the UI can gray out the toggle on
 *     web / simulator builds
 *
 * Anything fancier (e.g. "tomorrow's reminder should fire at 8am
 * instead because you completed today's session early") belongs here,
 * not in the screen code.
 */
export {
  getReminderPermission,
  requestReminderPermission,
  isSchedulingAvailable,
  type ReminderPermission,
} from './permissions';

export {
  scheduleDailyReminder,
  cancelReminder,
  getScheduledReminderId,
  ensureNotificationInfrastructure,
  REMINDER_IDENTIFIER,
  type ReminderInput,
  type ScheduleResult,
} from './scheduler';

export {
  DAILY_REMINDER_CONTENT,
  REMINDER_CATEGORY_ID,
  REMINDER_CHANNEL_ID,
  REMINDER_CHANNEL_NAME,
} from './strings';
